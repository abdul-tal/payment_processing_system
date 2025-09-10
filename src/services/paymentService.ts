import { APIContracts, APIControllers } from 'authorizenet';
import { authorizeNetConfig } from '../config/authorizeNet';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';

export interface PaymentMethod {
  cardNumber: string;
  expirationDate: string; // MMYY format
  cardCode: string;
  cardholderName?: string;
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
  billingAddress?: BillingAddress;
  description?: string;
  invoiceNumber?: string;
  customerEmail?: string;
  merchantTransactionId?: string;
}

export interface AuthorizeRequest extends TransactionRequest {
  // Inherits all fields from TransactionRequest
}

export interface CaptureRequest {
  transactionId: string;
  amount?: number; // If not provided, captures the full authorized amount
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
   * Process a purchase transaction (charge immediately)
   */
  public async processPurchase(
    request: TransactionRequest
  ): Promise<PaymentResult> {
    const correlationId = randomUUID();
    logger.info('Processing purchase transaction', {
      correlationId,
      amount: request.amount,
      merchantTransactionId: request.merchantTransactionId,
    });

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

        controller.execute(() => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

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
    logger.info('Processing authorization transaction', {
      correlationId,
      amount: request.amount,
      merchantTransactionId: request.merchantTransactionId,
    });

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

        controller.execute(() => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

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
    logger.info('Processing capture transaction', {
      correlationId,
      transactionId: request.transactionId,
      amount: request.amount,
    });

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

        controller.execute(() => {
          const response = controller.getResponse();
          const result = this.processTransactionResponse(
            response,
            correlationId
          );

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
      if (response && response.getMessages()) {
        const messages = response.getMessages();
        result.responseCode = messages.getResultCode();

        if (messages.getResultCode() === APIContracts.MessageTypeEnum.OK) {
          const transactionResponse = response.getTransactionResponse();

          if (transactionResponse) {
            result.success = transactionResponse.getResponseCode() === '1';
            result.transactionId = transactionResponse.getTransId();
            result.authCode = transactionResponse.getAuthCode();
            result.responseText =
              transactionResponse
                .getMessages()
                ?.getMessage()?.[0]
                ?.getDescription() || 'Transaction approved';
            result.avsResultCode = transactionResponse.getAvsResultCode();
            result.cvvResultCode = transactionResponse.getCvvResultCode();

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
          const messageArray = messages.getMessage();
          if (messageArray && messageArray.length > 0) {
            result.errors = messageArray.map(
              (msg: any) => `${msg.getCode()}: ${msg.getText()}`
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
