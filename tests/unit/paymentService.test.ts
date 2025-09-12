import {
  paymentService,
  PaymentMethod,
  TransactionRequest,
  AuthorizeRequest,
  CaptureRequest,
} from '../../src/services/paymentService';
import { APIControllers } from 'authorizenet';

// Mock the authorizenet module
jest.mock('authorizenet', () => ({
  APIContracts: {
    MerchantAuthenticationType: jest.fn().mockImplementation(() => ({
      setName: jest.fn(),
      setTransactionKey: jest.fn(),
    })),
    TransactionRequestType: jest.fn().mockImplementation(() => ({
      setTransactionType: jest.fn(),
      setAmount: jest.fn(),
      setPayment: jest.fn(),
      setBillTo: jest.fn(),
      setDescription: jest.fn(),
      setInvoiceNumber: jest.fn(),
      setCustomer: jest.fn(),
      setMerchantDescriptor: jest.fn(),
      setRefTransId: jest.fn(),
    })),
    CreditCardType: jest.fn().mockImplementation(() => ({
      setCardNumber: jest.fn(),
      setExpirationDate: jest.fn(),
      setCardCode: jest.fn(),
    })),
    PaymentType: jest.fn().mockImplementation(() => ({
      setCreditCard: jest.fn(),
    })),
    CustomerAddressType: jest.fn().mockImplementation(() => ({
      setFirstName: jest.fn(),
      setLastName: jest.fn(),
      setCompany: jest.fn(),
      setAddress: jest.fn(),
      setCity: jest.fn(),
      setState: jest.fn(),
      setZip: jest.fn(),
      setCountry: jest.fn(),
    })),
    CustomerDataType: jest.fn().mockImplementation(() => ({
      setEmail: jest.fn(),
    })),
    CreateTransactionRequest: jest.fn().mockImplementation(() => ({
      setMerchantAuthentication: jest.fn(),
      setTransactionRequest: jest.fn(),
      getJSON: jest.fn().mockReturnValue({}),
    })),
    MessageTypeEnum: {
      OK: 'Ok',
    },
    TransactionTypeEnum: {
      PRIORCAPTURETRANSACTION: 'priorAuthCaptureTransaction',
    },
  },
  APIControllers: {
    CreateTransactionController: jest.fn(),
  },
}));

// Mock the logger
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock the authorize.net config
jest.mock('../../src/config/authorizeNet', () => ({
  authorizeNetConfig: {
    getConfig: jest.fn().mockReturnValue({
      apiLoginId: 'test_login',
      transactionKey: 'test_key',
      environment: 'sandbox',
      endpoint: 'https://apitest.authorize.net/xml/v1/request.api',
    }),
  },
}));

describe('PaymentService', () => {
  let mockController: any;
  let mockResponse: any;
  let mockTransactionResponse: any;
  let mockMessages: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock responses
    mockMessages = {
      getResultCode: jest.fn().mockReturnValue('Ok'),
      getMessage: jest.fn().mockReturnValue([
        {
          getCode: jest.fn().mockReturnValue('I00001'),
          getText: jest.fn().mockReturnValue('Successful.'),
        },
      ]),
    };

    mockTransactionResponse = {
      getResponseCode: jest.fn().mockReturnValue('1'),
      getTransId: jest.fn().mockReturnValue('12345'),
      getAuthCode: jest.fn().mockReturnValue('ABC123'),
      getAvsResultCode: jest.fn().mockReturnValue('Y'),
      getCvvResultCode: jest.fn().mockReturnValue('M'),
      getMessages: jest.fn().mockReturnValue({
        getMessage: jest.fn().mockReturnValue([
          {
            getDescription: jest
              .fn()
              .mockReturnValue('This transaction has been approved.'),
          },
        ]),
      }),
    };

    mockResponse = {
      getMessages: jest.fn().mockReturnValue(mockMessages),
      getTransactionResponse: jest
        .fn()
        .mockReturnValue(mockTransactionResponse),
    };

    mockController = {
      execute: jest.fn((callback: () => void) => callback()),
      getResponse: jest.fn().mockReturnValue(mockResponse),
    };

    (
      APIControllers.CreateTransactionController as jest.Mock
    ).mockImplementation(() => mockController);
  });

  describe('validatePaymentMethod', () => {
    it('should return no errors for valid payment method', () => {
      const paymentMethod: PaymentMethod = {
        cardNumber: '4111111111111111',
        expirationDate: '1225', // December 2025
        cardCode: '123',
      };

      const errors = paymentService.validatePaymentMethod(paymentMethod);
      expect(errors).toHaveLength(0);
    });

    it('should return error for invalid card number', () => {
      const paymentMethod: PaymentMethod = {
        cardNumber: '123',
        expirationDate: '1225',
        cardCode: '123',
      };

      const errors = paymentService.validatePaymentMethod(paymentMethod);
      expect(errors).toContain('Invalid card number format');
    });

    it('should return error for invalid expiration date format', () => {
      const paymentMethod: PaymentMethod = {
        cardNumber: '4111111111111111',
        expirationDate: '12/25',
        cardCode: '123',
      };

      const errors = paymentService.validatePaymentMethod(paymentMethod);
      expect(errors).toContain(
        'Invalid expiration date format (MMYY required)'
      );
    });

    it('should return error for expired card', () => {
      const paymentMethod: PaymentMethod = {
        cardNumber: '4111111111111111',
        expirationDate: '0120', // January 2020
        cardCode: '123',
      };

      const errors = paymentService.validatePaymentMethod(paymentMethod);
      expect(errors).toContain('Card has expired');
    });

    it('should return error for invalid CVV', () => {
      const paymentMethod: PaymentMethod = {
        cardNumber: '4111111111111111',
        expirationDate: '1225',
        cardCode: '12',
      };

      const errors = paymentService.validatePaymentMethod(paymentMethod);
      expect(errors).toContain('Invalid card security code');
    });
  });

  describe('processPurchase', () => {
    it('should successfully process a purchase transaction', async () => {
      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
        billingAddress: {
          firstName: 'John',
          lastName: 'Doe',
          address: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zip: '12345',
          country: 'US',
        },
        description: 'Test purchase',
        customerEmail: 'john@example.com',
      };

      const result = await paymentService.processPurchase(request);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('12345');
      expect(result.authCode).toBe('ABC123');
      expect(result.responseCode).toBe('Ok');
      expect(result.avsResultCode).toBe('Y');
      expect(result.cvvResultCode).toBe('M');
    });

    it('should handle declined transaction', async () => {
      // Mock declined response
      mockTransactionResponse.getResponseCode.mockReturnValue('2');
      // Mock the messages property for declined transactions
      mockTransactionResponse.messages = [
        {
          description: 'This transaction has been declined.',
        },
      ];

      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4000000000000002', // Test card that gets declined
          expirationDate: '1225',
          cardCode: '123',
        },
      };

      const result = await paymentService.processPurchase(request);

      expect(result.success).toBe(false);
      expect(result.responseText).toBe('This transaction has been declined.');
    });

    it('should handle API errors', async () => {
      // Mock API error response
      mockMessages.getResultCode.mockReturnValue('Error');
      mockMessages.getMessage.mockReturnValue([
        {
          getCode: jest.fn().mockReturnValue('E00027'),
          getText: jest
            .fn()
            .mockReturnValue('The transaction was unsuccessful.'),
        },
      ]);

      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
      };

      const result = await paymentService.processPurchase(request);

      expect(result.success).toBe(false);
      expect(result.errors).toContain(
        'E00027: The transaction was unsuccessful.'
      );
    });
  });

  describe('authorizeTransaction', () => {
    it('should successfully authorize a transaction', async () => {
      const request: AuthorizeRequest = {
        amount: 50.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
        description: 'Test authorization',
      };

      const result = await paymentService.authorizeTransaction(request);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('12345');
      expect(result.authCode).toBe('ABC123');
      expect(mockController.execute).toHaveBeenCalled();
    });
  });

  describe('captureTransaction', () => {
    it('should successfully capture a previously authorized transaction', async () => {
      const request: CaptureRequest = {
        transactionId: '12345',
        amount: 50.0,
      };

      const result = await paymentService.captureTransaction(request);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('12345');
      expect(result.authCode).toBe('ABC123');
    });

    it('should capture full amount when amount not specified', async () => {
      const request: CaptureRequest = {
        transactionId: '12345',
      };

      const result = await paymentService.captureTransaction(request);

      expect(result.success).toBe(true);
      expect(result.transactionId).toBe('12345');
    });
  });

  describe('retry logic', () => {
    it('should retry on network errors', async () => {
      let attemptCount = 0;
      mockController.execute.mockImplementation((callback: () => void) => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('ECONNRESET');
        }
        callback();
      });

      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
      };

      const result = await paymentService.processPurchase(request);

      expect(result.success).toBe(true);
      expect(attemptCount).toBe(3);
    });

    it('should not retry on non-retryable errors', async () => {
      mockController.execute.mockImplementation(() => {
        throw new Error('Invalid request');
      });

      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
      };

      await expect(paymentService.processPurchase(request)).rejects.toThrow(
        'Invalid request'
      );
    });

    it('should fail after maximum retry attempts', async () => {
      mockController.execute.mockImplementation(() => {
        throw new Error('ECONNRESET');
      });

      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
      };

      await expect(paymentService.processPurchase(request)).rejects.toThrow(
        'ECONNRESET'
      );
    });
  });

  describe('error handling', () => {
    it('should handle null response', async () => {
      mockController.getResponse.mockReturnValue(null);

      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
      };

      const result = await paymentService.processPurchase(request);

      expect(result.success).toBe(false);
      expect(result.responseText).toBe('Error processing payment response');
    });

    it('should handle response without transaction response', async () => {
      mockResponse.getTransactionResponse.mockReturnValue(null);

      const request: TransactionRequest = {
        amount: 100.0,
        paymentMethod: {
          cardNumber: '4111111111111111',
          expirationDate: '1225',
          cardCode: '123',
        },
      };

      const result = await paymentService.processPurchase(request);

      expect(result.success).toBe(false);
      expect(result.responseText).toBe('No transaction response received');
    });
  });
});
