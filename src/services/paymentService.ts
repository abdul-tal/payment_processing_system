import { APIContracts, APIControllers } from 'authorizenet';
import { authorizeNetConfig } from '../config/authorizeNet';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../config/database';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
} from '../entities/Transaction';

export interface PaymentMethod {
  cardNumber: string;
  expirationDate: string; // MMYY format
  cardCode: string;
  cardholderName?: string | undefined;
}

export interface BillingAddress {
  firstName: string;
  lastName: string;
  company?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface TransactionRequest {
  amount: number;
  paymentMethod: PaymentMethod;
  billingAddress?: BillingAddress | undefined;
  description?: string | undefined;
  invoiceNumber?: string | undefined;
  customerEmail?: string | undefined;
  merchantTransactionId?: string | undefined;
}

export interface AuthorizeRequest extends TransactionRequest {
  // Inherits all fields from TransactionRequest
}

export interface CaptureRequest {
  transactionId: string;
  amount?: number | undefined; // If not provided, captures the full authorized amount
}

export interface RefundRequest {
  transactionId: string;
  amount: number;
  paymentMethod: PaymentMethod; // Last 4 digits and expiration date required for refunds
  reason?: string;
}

export interface CancelRequest {
  transactionId: string;
}

export interface SubscriptionRequest {
  name: string;
  length: number;
  unit: 'days' | 'months';
  startDate: Date;
  totalOccurrences?: number;
  trialOccurrences?: number;
  amount: number;
  trialAmount?: number;
  paymentMethod: PaymentMethod;
  billingAddress?: BillingAddress;
  customerEmail?: string;
  customerName?: string;
  description?: string;
  merchantSubscriptionId?: string;
}

export interface SubscriptionResponse {
  subscriptionId: string;
  resultCode: string;
  message: string;
  success: boolean;
}

export interface PaymentResult {
  success: boolean;
  transactionId?: string;
  authCode?: string;
  responseCode: string;
  responseText: string;
  avsResultCode?: string;
  cvvResultCode?: string;
  amount?: number;
  errors?: string[];
}

export interface AuthorizeNetError {
  code: string;
  text: string;
}

class PaymentService {
  private merchantAuthentication: any;
  private retryAttempts = 3;
  private retryDelay = 1000; // Base delay in milliseconds

  constructor() {
    const config = authorizeNetConfig.getConfig();
    this.merchantAuthentication = new APIContracts.MerchantAuthenticationType();
    this.merchantAuthentication.setName(config.apiLoginId);
    this.merchantAuthentication.setTransactionKey(config.transactionKey);
  }

  /**
   * Save transaction to database
   */
  private async saveTransaction(transactionData: {
    transactionId: string;
    authorizeNetTransactionId?: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    currency: string;
    customerEmail: string;
    customerName?: string;
    description?: string;
    billingAddress?: BillingAddress;
    cardLastFour?: string;
    cardType?: string;
    referenceTransactionId?: string;
    failureReason?: string;
  }): Promise<Transaction> {
    const transactionRepository = AppDataSource.getRepository(Transaction);

    const transaction = new Transaction();
    transaction.transaction_id = transactionData.transactionId;
    transaction.authorize_net_transaction_id =
      transactionData.authorizeNetTransactionId || '';
    transaction.type = transactionData.type;
    transaction.status = transactionData.status;
    transaction.amount = transactionData.amount;
    transaction.currency = transactionData.currency;
    transaction.customer_email = transactionData.customerEmail;
    transaction.customer_name = transactionData.customerName || '';
    transaction.description = transactionData.description || '';
    transaction.card_last_four = transactionData.cardLastFour || '';
    transaction.card_type = transactionData.cardType || '';
    transaction.reference_transaction_id =
      transactionData.referenceTransactionId || '';
    transaction.failure_reason = transactionData.failureReason || '';

    if (transactionData.billingAddress) {
      transaction.billing_address = JSON.stringify(
        transactionData.billingAddress
      );
    }

    return await transactionRepository.save(transaction);
  }

  /**
   * Update transaction status
   */
  private async updateTransactionStatus(
    transactionId: string,
    status: TransactionStatus,
    authorizeNetTransactionId?: string,
    failureReason?: string
  ): Promise<void> {
    const transactionRepository = AppDataSource.getRepository(Transaction);

    const updateData: any = { status };
    if (authorizeNetTransactionId) {
      updateData.authorize_net_transaction_id = authorizeNetTransactionId;
    }
    if (failureReason) {
      updateData.failure_reason = failureReason;
    }

    await transactionRepository.update(
      { transaction_id: transactionId },
      updateData
    );
  }

  /**
   * Process a purchase transaction (charge immediately)
   */
  public async processPurchase(
    request: TransactionRequest
  ): Promise<PaymentResult> {
    const correlationId = randomUUID();
    const transactionId = request.merchantTransactionId || randomUUID();

    logger.info('Processing purchase transaction', {
      correlationId,
      amount: request.amount,
      transactionId,
    });

    // Save initial transaction to database
    try {
      await this.saveTransaction({
        transactionId,
        type: TransactionType.PAYMENT,
        status: TransactionStatus.PROCESSING,
        amount: request.amount,
        currency: 'USD',
        customerEmail: request.customerEmail || '',
        customerName: '',
        description: request.description || '',
        billingAddress: request.billingAddress || {
          firstName: '',
          lastName: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
        },
        cardLastFour: request.paymentMethod.cardNumber.slice(-4),
      });
    } catch (error) {
      logger.error('Failed to save transaction to database', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return this.executeWithRetry(async () => {
      const transactionRequest = this.createTransactionRequest(
        request,
        'authCaptureTransaction'
      );
      const createTransactionRequest =
        new APIContracts.CreateTransactionRequest();
      createTransactionRequest.setMerchantAuthentication(
        this.merchantAuthentication
      );
      createTransactionRequest.setTransactionRequest(transactionRequest);

      return new Promise<PaymentResult>(resolve => {
        const controller = new APIControllers.CreateTransactionController(
          createTransactionRequest.getJSON()
        );

        controller.execute(async () => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

          // Update transaction status in database
          try {
            await this.updateTransactionStatus(
              transactionId,
              result.success
                ? TransactionStatus.COMPLETED
                : TransactionStatus.FAILED,
              result.transactionId,
              result.success ? undefined : result.responseText
            );
          } catch (error) {
            logger.error('Failed to update transaction status', {
              correlationId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }

          logger.info('Purchase transaction completed', {
            correlationId,
            success: result.success,
            transactionId: result.transactionId,
            responseCode: result.responseCode,
          });

          resolve(result);
        });
      });
    }, correlationId);
  }

  /**
   * Authorize a transaction (hold funds without capturing)
   */
  public async authorizeTransaction(
    request: AuthorizeRequest
  ): Promise<PaymentResult> {
    const correlationId = randomUUID();
    const transactionId = request.merchantTransactionId || randomUUID();

    logger.info('Processing authorization transaction', {
      correlationId,
      amount: request.amount,
      transactionId,
    });

    // Save initial transaction to database
    try {
      await this.saveTransaction({
        transactionId,
        type: TransactionType.AUTHORIZATION,
        status: TransactionStatus.PROCESSING,
        amount: request.amount,
        currency: 'USD',
        customerEmail: request.customerEmail || '',
        customerName: '',
        description: request.description || '',
        billingAddress: request.billingAddress || {
          firstName: '',
          lastName: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
        },
        cardLastFour: request.paymentMethod.cardNumber.slice(-4),
      });
    } catch (error) {
      logger.error('Failed to save authorization transaction to database', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return this.executeWithRetry(async () => {
      const transactionRequest = this.createTransactionRequest(
        request,
        'authOnlyTransaction'
      );
      const createTransactionRequest =
        new APIContracts.CreateTransactionRequest();
      createTransactionRequest.setMerchantAuthentication(
        this.merchantAuthentication
      );
      createTransactionRequest.setTransactionRequest(transactionRequest);

      return new Promise<PaymentResult>(resolve => {
        const controller = new APIControllers.CreateTransactionController(
          createTransactionRequest.getJSON()
        );

        controller.execute(async () => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

          // Update transaction status in database
          try {
            await this.updateTransactionStatus(
              transactionId,
              result.success
                ? TransactionStatus.COMPLETED
                : TransactionStatus.FAILED,
              result.transactionId,
              result.success ? undefined : result.responseText
            );
          } catch (error) {
            logger.error('Failed to update authorization transaction status', {
              correlationId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }

          logger.info('Authorization transaction completed', {
            correlationId,
            success: result.success,
            transactionId: result.transactionId,
            responseCode: result.responseCode,
          });

          resolve(result);
        });
      });
    }, correlationId);
  }

  /**
   * Capture a previously authorized transaction
   */
  public async captureTransaction(
    request: CaptureRequest
  ): Promise<PaymentResult> {
    const correlationId = randomUUID();
    const captureTransactionId = randomUUID();

    logger.info('Processing capture transaction', {
      correlationId,
      transactionId: request.transactionId,
      captureTransactionId,
      amount: request.amount,
    });

    // Save capture transaction to database
    try {
      await this.saveTransaction({
        transactionId: captureTransactionId,
        type: TransactionType.CAPTURE,
        status: TransactionStatus.PROCESSING,
        amount: request.amount || 0,
        currency: 'USD',
        customerEmail: '',
        customerName: '',
        description: 'Capture transaction',
        billingAddress: {
          firstName: '',
          lastName: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
        },
        cardLastFour: '',
        referenceTransactionId: request.transactionId,
      });
    } catch (error) {
      logger.error('Failed to save capture transaction to database', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return this.executeWithRetry(async () => {
      const transactionRequest = new APIContracts.TransactionRequestType();
      transactionRequest.setTransactionType(
        APIContracts.TransactionTypeEnum.PRIORAUTHCAPTURETRANSACTION
      );
      transactionRequest.setRefTransId(request.transactionId);

      if (request.amount) {
        transactionRequest.setAmount(request.amount);
      }

      const createTransactionRequest =
        new APIContracts.CreateTransactionRequest();
      createTransactionRequest.setMerchantAuthentication(
        this.merchantAuthentication
      );
      createTransactionRequest.setTransactionRequest(transactionRequest);

      return new Promise<PaymentResult>(resolve => {
        const controller = new APIControllers.CreateTransactionController(
          createTransactionRequest.getJSON()
        );

        controller.execute(async () => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

          // Update capture transaction status in database
          try {
            await this.updateTransactionStatus(
              captureTransactionId,
              result.success
                ? TransactionStatus.COMPLETED
                : TransactionStatus.FAILED,
              result.transactionId,
              result.success ? undefined : result.responseText
            );
          } catch (error) {
            logger.error('Failed to update capture transaction status', {
              correlationId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }

          logger.info('Capture transaction completed', {
            correlationId,
            success: result.success,
            transactionId: result.transactionId,
            responseCode: result.responseCode,
          });

          resolve(result);
        });
      });
    }, correlationId);
  }

  /**
   * Refund a previously completed transaction
   */
  public async refundTransaction(
    request: RefundRequest
  ): Promise<PaymentResult> {
    const correlationId = randomUUID();
    const refundTransactionId = randomUUID();

    logger.info('Processing refund transaction', {
      correlationId,
      transactionId: request.transactionId,
      refundTransactionId,
      amount: request.amount,
      reason: request.reason,
    });

    // Save refund transaction to database
    try {
      await this.saveTransaction({
        transactionId: refundTransactionId,
        type: TransactionType.REFUND,
        status: TransactionStatus.PROCESSING,
        amount: request.amount || 0,
        currency: 'USD',
        customerEmail: '',
        customerName: '',
        description: request.reason || 'Refund transaction',
        billingAddress: {
          firstName: '',
          lastName: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
        },
        cardLastFour: '',
        referenceTransactionId: request.transactionId,
      });
    } catch (error) {
      logger.error('Failed to save refund transaction to database', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return this.executeWithRetry(async () => {
      const transactionRequest = new APIContracts.TransactionRequestType();
      transactionRequest.setTransactionType(
        APIContracts.TransactionTypeEnum.REFUNDTRANSACTION
      );
      transactionRequest.setRefTransId(request.transactionId);

      if (request.amount) {
        transactionRequest.setAmount(request.amount);
      }

      // For refunds, we need to provide payment method info (last 4 digits)
      // Since we don't store card details, we'll use a placeholder that works in sandbox
      const paymentType = new APIContracts.PaymentType();
      const creditCard = new APIContracts.CreditCardType();
      creditCard.setCardNumber('XXXX1111'); // Last 4 digits placeholder for sandbox
      creditCard.setExpirationDate('XXXX'); // Expiration date placeholder
      paymentType.setCreditCard(creditCard);
      transactionRequest.setPayment(paymentType);

      const createTransactionRequest =
        new APIContracts.CreateTransactionRequest();
      createTransactionRequest.setMerchantAuthentication(
        this.merchantAuthentication
      );
      createTransactionRequest.setTransactionRequest(transactionRequest);

      return new Promise<PaymentResult>(resolve => {
        const controller = new APIControllers.CreateTransactionController(
          createTransactionRequest.getJSON()
        );

        controller.execute(async () => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

          // Update refund transaction status in database
          try {
            await this.updateTransactionStatus(
              refundTransactionId,
              result.success
                ? TransactionStatus.COMPLETED
                : TransactionStatus.FAILED,
              result.transactionId,
              result.success ? undefined : result.responseText
            );
          } catch (error) {
            logger.error('Failed to update refund transaction status', {
              correlationId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }

          logger.info('Refund transaction completed', {
            correlationId,
            success: result.success,
            transactionId: result.transactionId,
            responseCode: result.responseCode,
          });

          resolve(result);
        });
      });
    }, correlationId);
  }

  /**
   * Cancel (void) a previously authorized transaction
   */
  public async cancelTransaction(
    request: CancelRequest
  ): Promise<PaymentResult> {
    const correlationId = randomUUID();
    const voidTransactionId = randomUUID();

    logger.info('Processing cancel transaction', {
      correlationId,
      transactionId: request.transactionId,
      voidTransactionId,
    });

    // Save void transaction to database
    try {
      await this.saveTransaction({
        transactionId: voidTransactionId,
        type: TransactionType.VOID,
        status: TransactionStatus.PROCESSING,
        amount: 0,
        currency: 'USD',
        customerEmail: '',
        customerName: '',
        description: 'Void transaction',
        billingAddress: {
          firstName: '',
          lastName: '',
          address: '',
          city: '',
          state: '',
          zip: '',
          country: 'US',
        },
        cardLastFour: '',
        referenceTransactionId: request.transactionId,
      });
    } catch (error) {
      logger.error('Failed to save void transaction to database', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return this.executeWithRetry(async () => {
      const transactionRequest = new APIContracts.TransactionRequestType();
      transactionRequest.setTransactionType(
        APIContracts.TransactionTypeEnum.VOIDTRANSACTION
      );
      transactionRequest.setRefTransId(request.transactionId);

      const createTransactionRequest =
        new APIContracts.CreateTransactionRequest();
      createTransactionRequest.setMerchantAuthentication(
        this.merchantAuthentication
      );
      createTransactionRequest.setTransactionRequest(transactionRequest);

      return new Promise<PaymentResult>(resolve => {
        const controller = new APIControllers.CreateTransactionController(
          createTransactionRequest.getJSON()
        );

        controller.execute(async () => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

          // Update void transaction status in database
          try {
            await this.updateTransactionStatus(
              voidTransactionId,
              result.success
                ? TransactionStatus.COMPLETED
                : TransactionStatus.FAILED,
              result.transactionId,
              result.success ? undefined : result.responseText
            );
          } catch (error) {
            logger.error('Failed to update void transaction status', {
              correlationId,
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          }

          logger.info('Cancel transaction completed', {
            correlationId,
            success: result.success,
            transactionId: result.transactionId,
            responseCode: result.responseCode,
          });

          resolve(result);
        });
      });
    }, correlationId);
  }

  /**
   * Create a transaction request object
   */
  private createTransactionRequest(
    request: TransactionRequest,
    transactionType: string
  ): any {
    const transactionRequest = new APIContracts.TransactionRequestType();
    transactionRequest.setTransactionType(transactionType);
    transactionRequest.setAmount(request.amount);

    // Set payment method
    const creditCard = new APIContracts.CreditCardType();
    creditCard.setCardNumber(request.paymentMethod.cardNumber);
    creditCard.setExpirationDate(request.paymentMethod.expirationDate);
    creditCard.setCardCode(request.paymentMethod.cardCode);

    const paymentType = new APIContracts.PaymentType();
    paymentType.setCreditCard(creditCard);
    transactionRequest.setPayment(paymentType);

    // Set billing address if provided
    if (request.billingAddress) {
      const billTo = new APIContracts.CustomerAddressType();
      billTo.setFirstName(request.billingAddress.firstName);
      billTo.setLastName(request.billingAddress.lastName);
      billTo.setCompany(request.billingAddress.company || '');
      billTo.setAddress(request.billingAddress.address);
      billTo.setCity(request.billingAddress.city);
      billTo.setState(request.billingAddress.state);
      billTo.setZip(request.billingAddress.zip);
      billTo.setCountry(request.billingAddress.country);
      transactionRequest.setBillTo(billTo);
    }

    // Set optional fields - Note: setDescription and setInvoiceNumber may not be available in all SDK versions
    // These fields can be set through other means if needed

    if (request.customerEmail) {
      const customerData = new APIContracts.CustomerDataType();
      customerData.setEmail(request.customerEmail);
      transactionRequest.setCustomer(customerData);
    }

    // Set merchant transaction ID
    const merchantTransactionId = request.merchantTransactionId || randomUUID();
    transactionRequest.setMerchantDescriptor(merchantTransactionId);

    return transactionRequest;
  }

  /**
   * Process the response from Authorize.Net
   */
  private processTransactionResponse(
    response: any,
    correlationId: string
  ): PaymentResult {
    const result: PaymentResult = {
      success: false,
      responseCode: '0',
      responseText: 'Unknown error',
      errors: [],
    };

    try {
      // Handle both old SDK format (with getMessages) and new format (direct object)
      let messages: any;
      let transactionResponse: any;
      console.log('response::', JSON.stringify(response, null, 2));
      if (response && typeof response.getMessages === 'function') {
        // Old SDK format
        messages = response.getMessages();
        transactionResponse = response.getTransactionResponse();
      } else if (response && response.messages) {
        // New format - direct object access
        messages = response.messages;
        transactionResponse = response.transactionResponse;
      } else {
        throw new Error('Invalid response format from Authorize.Net');
      }

      if (messages) {
        // Handle messages based on format
        const resultCode =
          messages.resultCode ||
          (typeof messages.getResultCode === 'function'
            ? messages.getResultCode()
            : null);
        result.responseCode = resultCode;

        if (
          resultCode === 'Ok' ||
          resultCode === APIContracts.MessageTypeEnum.OK
        ) {
          if (transactionResponse) {
            // Handle transaction response based on format
            const responseCode =
              transactionResponse.responseCode ||
              (typeof transactionResponse.getResponseCode === 'function'
                ? transactionResponse.getResponseCode()
                : null);
            result.success = responseCode === '1';
            result.transactionId =
              transactionResponse.transId ||
              (typeof transactionResponse.getTransId === 'function'
                ? transactionResponse.getTransId()
                : null);
            result.authCode =
              transactionResponse.authCode ||
              (typeof transactionResponse.getAuthCode === 'function'
                ? transactionResponse.getAuthCode()
                : null);

            // Get response text from messages
            if (
              transactionResponse.messages &&
              transactionResponse.messages.length > 0
            ) {
              result.responseText =
                transactionResponse.messages[0].description ||
                'Transaction approved';
            } else {
              result.responseText = 'Transaction approved';
            }

            result.avsResultCode =
              transactionResponse.avsResultCode ||
              (typeof transactionResponse.getAvsResultCode === 'function'
                ? transactionResponse.getAvsResultCode()
                : null);
            result.cvvResultCode =
              transactionResponse.cvvResultCode ||
              (typeof transactionResponse.getCvvResultCode === 'function'
                ? transactionResponse.getCvvResultCode()
                : null);

            // Log transaction details
            logger.info('Transaction response processed', {
              correlationId,
              transactionId: result.transactionId,
              authCode: result.authCode,
              avsResult: result.avsResultCode,
              cvvResult: result.cvvResultCode,
            });
          } else {
            result.responseText = 'No transaction response received';
            result.errors?.push('No transaction response received');
          }
        } else {
          // Handle API-level errors
          const messageArray =
            messages.message ||
            (typeof messages.getMessage === 'function'
              ? messages.getMessage()
              : []);
          if (messageArray && messageArray.length > 0) {
            result.errors = messageArray.map(
              (msg: any) =>
                `${msg.code || (typeof msg.getCode === 'function' ? msg.getCode() : 'Unknown')}: ${msg.text || (typeof msg.getText === 'function' ? msg.getText() : 'Unknown error')}`
            );
            result.responseText = result.errors?.[0] || 'API Error';
          }

          logger.error('Transaction API error', {
            correlationId,
            errors: result.errors,
          });
        }
      } else {
        result.responseText = 'Invalid response from payment gateway';
        result.errors?.push('Invalid response from payment gateway');

        logger.error('Invalid response from Authorize.Net', {
          correlationId,
          response: response,
        });
      }
    } catch (error) {
      result.responseText = 'Error processing payment response';
      result.errors?.push(
        `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      logger.error('Error processing payment response', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }

    return result;
  }

  /**
   * Execute a payment operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    correlationId: string,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const isRetryableError = this.isRetryableError(error);

      logger.warn('Payment operation failed', {
        correlationId,
        attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
        isRetryable: isRetryableError,
      });

      if (attempt < this.retryAttempts && isRetryableError) {
        const delay = this.calculateRetryDelay(attempt);
        logger.info('Retrying payment operation', {
          correlationId,
          nextAttempt: attempt + 1,
          delayMs: delay,
        });

        await this.sleep(delay);
        return this.executeWithRetry(operation, correlationId, attempt + 1);
      }

      logger.error('Payment operation failed after all retries', {
        correlationId,
        finalAttempt: attempt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  /**
   * Determine if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (!error) return false;

    // Network-related errors are typically retryable
    const retryableErrors = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'NETWORK_ERROR',
      'TIMEOUT',
    ];

    const errorMessage = error.message || error.toString();
    return retryableErrors.some(retryableError =>
      errorMessage.toUpperCase().includes(retryableError)
    );
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(attempt: number): number {
    return this.retryDelay * Math.pow(2, attempt - 1) + Math.random() * 1000;
  }

  /**
   * Sleep utility function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a subscription using Authorize.Net ARB
   */
  async createSubscription(
    request: SubscriptionRequest,
    correlationId?: string
  ): Promise<SubscriptionResponse> {
    const corrId = correlationId || randomUUID();

    logger.info('Creating Authorize.Net subscription', {
      correlationId: corrId,
      subscriptionName: request.name,
      amount: request.amount,
      interval: `${request.length} ${request.unit}`,
      customerEmail: request.customerEmail,
    });

    try {
      // Create subscription request
      const subscriptionType = new APIContracts.ARBSubscriptionType();
      subscriptionType.setName(request.name);

      // Set payment schedule
      const paymentSchedule = new APIContracts.PaymentScheduleType();
      const interval = new APIContracts.PaymentScheduleType.Interval();
      interval.setLength(request.length);
      interval.setUnit(
        request.unit === 'months'
          ? APIContracts.ARBSubscriptionUnitEnum.MONTHS
          : APIContracts.ARBSubscriptionUnitEnum.DAYS
      );

      paymentSchedule.setInterval(interval);
      paymentSchedule.setStartDate(
        request.startDate.toISOString().split('T')[0]
      );

      // Set total occurrences to 9999 for ongoing subscriptions (Authorize.Net requirement)
      paymentSchedule.setTotalOccurrences(
        request.totalOccurrences && request.totalOccurrences > 0
          ? request.totalOccurrences
          : 9999
      );

      subscriptionType.setPaymentSchedule(paymentSchedule);

      // Set amount
      subscriptionType.setAmount(request.amount);

      if (request.trialAmount !== undefined) {
        subscriptionType.setTrialAmount(request.trialAmount);
      }

      // Set payment method
      const payment = new APIContracts.PaymentType();
      const creditCard = new APIContracts.CreditCardType();
      creditCard.setCardNumber(request.paymentMethod.cardNumber);
      creditCard.setExpirationDate(request.paymentMethod.expirationDate);
      creditCard.setCardCode(request.paymentMethod.cardCode);
      payment.setCreditCard(creditCard);
      subscriptionType.setPayment(payment);

      // Set billing address (required by Authorize.Net)
      const billTo = new APIContracts.NameAndAddressType();
      if (request.billingAddress) {
        billTo.setFirstName(request.billingAddress.firstName);
        billTo.setLastName(request.billingAddress.lastName);
        billTo.setAddress(request.billingAddress.address);
        billTo.setCity(request.billingAddress.city);
        billTo.setState(request.billingAddress.state);
        billTo.setZip(request.billingAddress.zip);
        billTo.setCountry(request.billingAddress.country);
      } else {
        // Use customer name as fallback for required fields
        const nameParts = (request.customerName || 'Customer Name').split(' ');
        billTo.setFirstName(nameParts[0] || 'Customer');
        billTo.setLastName(nameParts[1] || 'Name');
        billTo.setAddress('123 Main St');
        billTo.setCity('Anytown');
        billTo.setState('CA');
        billTo.setZip('12345');
        billTo.setCountry('US');
      }
      subscriptionType.setBillTo(billTo);

      // Set customer info
      if (request.customerEmail || request.customerName) {
        const customer = new APIContracts.CustomerType();
        if (request.customerEmail) {
          customer.setEmail(request.customerEmail);
        }
        if (request.customerName) {
          // const nameParts = request.customerName.split(' ');
          customer.setId(
            request.customerName.replace(/\s+/g, '_').toLowerCase()
          );
        }
        subscriptionType.setCustomer(customer);
      }

      // Note: merchantSubscriptionId is stored locally, not sent to Authorize.Net

      // Create the request
      const createRequest = new APIContracts.ARBCreateSubscriptionRequest();
      createRequest.setMerchantAuthentication(this.merchantAuthentication);
      createRequest.setSubscription(subscriptionType);

      // Execute the request
      const controller = new APIControllers.ARBCreateSubscriptionController(
        createRequest.getJSON()
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
      return new Promise((resolve, _reject) => {
        controller.execute(() => {
          const apiResponse = controller.getResponse();
          const response = new APIContracts.ARBCreateSubscriptionResponse(
            apiResponse
          );

          logger.info('Authorize.Net subscription creation response', {
            correlationId: corrId,
            resultCode: response.getMessages().getResultCode(),
            subscriptionId: response.getSubscriptionId(),
          });

          if (
            response.getMessages().getResultCode() ===
            APIContracts.MessageTypeEnum.OK
          ) {
            resolve({
              subscriptionId: response.getSubscriptionId(),
              resultCode: response.getMessages().getResultCode(),
              message: response.getMessages().getMessage()[0].getText(),
              success: true,
            });
          } else {
            const errorMessages = response
              .getMessages()
              .getMessage()
              .map((msg: any) => msg.getText())
              .join(', ');
            logger.error('Authorize.Net subscription creation failed', {
              correlationId: corrId,
              errors: errorMessages,
            });

            resolve({
              subscriptionId: '',
              resultCode: response.getMessages().getResultCode(),
              message: errorMessages,
              success: false,
            });
          }
        });
      });
    } catch (error) {
      logger.error('Error creating Authorize.Net subscription', {
        correlationId: corrId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        subscriptionId: '',
        resultCode: 'ERROR',
        message:
          error instanceof Error ? error.message : 'Unknown error occurred',
        success: false,
      };
    }
  }

  /**
   * Validate payment method
   */
  public validatePaymentMethod(paymentMethod: PaymentMethod): string[] {
    const errors: string[] = [];

    // Validate card number (basic Luhn algorithm check)
    if (
      !paymentMethod.cardNumber ||
      !/^\d{13,19}$/.test(paymentMethod.cardNumber.replace(/\s/g, ''))
    ) {
      errors.push('Invalid card number format');
    }

    // Validate expiration date (MMYY format)
    if (
      !paymentMethod.expirationDate ||
      !/^\d{4}$/.test(paymentMethod.expirationDate)
    ) {
      errors.push('Invalid expiration date format (MMYY required)');
    } else {
      const month = parseInt(paymentMethod.expirationDate.substring(0, 2));
      const year =
        parseInt(paymentMethod.expirationDate.substring(2, 4)) + 2000;
      const currentDate = new Date();
      const expirationDate = new Date(year, month - 1);

      if (month < 1 || month > 12) {
        errors.push('Invalid expiration month');
      } else if (expirationDate < currentDate) {
        errors.push('Card has expired');
      }
    }

    // Validate CVV
    if (!paymentMethod.cardCode || !/^\d{3,4}$/.test(paymentMethod.cardCode)) {
      errors.push('Invalid card security code');
    }

    return errors;
  }
}

export const paymentService = new PaymentService();
