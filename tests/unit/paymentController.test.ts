import { Request, Response } from 'express';
import { PaymentController } from '../../src/controllers/paymentController';
import { paymentService } from '../../src/services/paymentService';
import { IdempotentRequest } from '../../src/middleware/idempotency';

// Mock the payment service
jest.mock('../../src/services/paymentService');
jest.mock('../../src/config/logger');

const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;

describe('PaymentController', () => {
  let paymentController: PaymentController;
  let mockRequest: Partial<IdempotentRequest>;
  let mockResponse: Partial<Response>;
  let responseJson: jest.Mock;
  let responseStatus: jest.Mock;

  beforeEach(() => {
    paymentController = new PaymentController();

    responseJson = jest.fn().mockReturnThis();
    responseStatus = jest.fn().mockReturnThis();

    mockRequest = {
      correlationId: 'test-correlation-id',
      idempotencyKey: 'test-idempotency-key',
      body: {},
      params: {},
    };

    mockResponse = {
      json: responseJson,
      status: responseStatus,
    };

    // Reset all mocks
    jest.clearAllMocks();
  });

  describe('processPurchase', () => {
    const validPurchaseRequest = {
      amount: 100.0,
      currency: 'USD',
      description: 'Test purchase',
      customerEmail: 'test@example.com',
      customerName: 'John Doe',
      invoiceNumber: 'INV-001',
      paymentMethod: {
        type: 'credit_card' as const,
        cardNumber: '4111111111111111',
        expirationDate: '1225',
        cardCode: '123',
        cardholderName: 'John Doe',
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
    };

    beforeEach(() => {
      mockRequest.body = validPurchaseRequest;
    });

    it('should process a successful purchase', async () => {
      const mockResult = {
        success: true,
        transactionId: 'txn_123456789',
        authCode: 'AUTH123',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
        avsResultCode: 'Y',
        cvvResultCode: 'M',
      };

      mockPaymentService.validatePaymentMethod.mockReturnValue([]);
      mockPaymentService.processPurchase.mockResolvedValue(mockResult);

      await paymentController.processPurchase(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.validatePaymentMethod).toHaveBeenCalledWith(
        validPurchaseRequest.paymentMethod
      );
      expect(mockPaymentService.processPurchase).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 100.0,
          merchantTransactionId: 'test-correlation-id',
        })
      );
      expect(responseStatus).toHaveBeenCalledWith(201);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'txn_123456789',
          status: 'completed',
          amount: 100.0,
          authCode: 'AUTH123',
        })
      );
    });

    it('should handle payment method validation errors', async () => {
      mockPaymentService.validatePaymentMethod.mockReturnValue([
        'Invalid card number format',
        'Card has expired',
      ]);

      await paymentController.processPurchase(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid payment method',
          details: ['Invalid card number format', 'Card has expired'],
        })
      );
      expect(mockPaymentService.processPurchase).not.toHaveBeenCalled();
    });

    it('should handle payment processing failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '2',
        responseText: 'This transaction has been declined.',
        errors: ['Insufficient funds'],
      };

      mockPaymentService.validatePaymentMethod.mockReturnValue([]);
      mockPaymentService.processPurchase.mockResolvedValue(mockResult);

      await paymentController.processPurchase(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment processing failed',
          message: 'This transaction has been declined.',
          details: ['Insufficient funds'],
        })
      );
    });

    it('should handle service errors', async () => {
      mockPaymentService.validatePaymentMethod.mockReturnValue([]);
      mockPaymentService.processPurchase.mockRejectedValue(
        new Error('Network error')
      );

      await paymentController.processPurchase(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(500);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal server error',
          message: 'Payment processing failed due to a system error',
        })
      );
    });
  });

  describe('authorizePayment', () => {
    const validAuthorizeRequest = {
      amount: 150.0,
      currency: 'USD',
      description: 'Test authorization',
      customerEmail: 'test@example.com',
      customerName: 'Jane Doe',
      paymentMethod: {
        type: 'credit_card' as const,
        cardNumber: '4111111111111111',
        expirationDate: '1225',
        cardCode: '123',
        cardholderName: 'Jane Doe',
      },
      billingAddress: {
        firstName: 'Jane',
        lastName: 'Doe',
        address: '456 Oak Ave',
        city: 'Somewhere',
        state: 'NY',
        zip: '67890',
        country: 'US',
      },
    };

    beforeEach(() => {
      mockRequest.body = validAuthorizeRequest;
    });

    it('should authorize a payment successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'auth_987654321',
        authCode: 'AUTH456',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
        avsResultCode: 'Y',
        cvvResultCode: 'M',
      };

      mockPaymentService.validatePaymentMethod.mockReturnValue([]);
      mockPaymentService.authorizeTransaction.mockResolvedValue(mockResult);

      await paymentController.authorizePayment(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.authorizeTransaction).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 150.0,
          merchantTransactionId: 'test-correlation-id',
        })
      );
      expect(responseStatus).toHaveBeenCalledWith(201);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'auth_987654321',
          status: 'authorized',
          amount: 150.0,
          authCode: 'AUTH456',
        })
      );
    });

    it('should handle authorization failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '2',
        responseText: 'This transaction has been declined.',
        errors: ['Invalid card'],
      };

      mockPaymentService.validatePaymentMethod.mockReturnValue([]);
      mockPaymentService.authorizeTransaction.mockResolvedValue(mockResult);

      await paymentController.authorizePayment(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment authorization failed',
          message: 'This transaction has been declined.',
        })
      );
    });
  });

  describe('capturePayment', () => {
    beforeEach(() => {
      mockRequest.params = { transactionId: 'auth_123456789' };
      mockRequest.body = { amount: 75.0 };
    });

    it('should capture a payment successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'cap_123456789',
        authCode: 'CAPTURE123',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
      };

      mockPaymentService.captureTransaction.mockResolvedValue(mockResult);

      await paymentController.capturePayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockPaymentService.captureTransaction).toHaveBeenCalledWith({
        transactionId: 'auth_123456789',
        amount: 75.0,
      });
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'cap_123456789',
          originalTransactionId: 'auth_123456789',
          status: 'captured',
          amount: 75.0,
        })
      );
    });

    it('should handle capture failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '3',
        responseText: 'This transaction cannot be captured.',
        errors: ['Transaction not found'],
      };

      mockPaymentService.captureTransaction.mockResolvedValue(mockResult);

      await paymentController.capturePayment(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment capture failed',
          message: 'This transaction cannot be captured.',
        })
      );
    });
  });

  describe('refundPayment', () => {
    beforeEach(() => {
      mockRequest.params = { transactionId: 'txn_123456789' };
      mockRequest.body = { amount: 50.0, reason: 'Customer request' };
    });

    it('should refund a payment successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'ref_123456789',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
        amount: 50.0,
      };

      mockPaymentService.refundTransaction.mockResolvedValue(mockResult);

      await paymentController.refundPayment(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.refundTransaction).toHaveBeenCalledWith({
        transactionId: 'txn_123456789',
        amount: 50.0,
        paymentMethod: {
          cardNumber: '****',
          expirationDate: '****',
          cardCode: '***',
        },
        reason: 'Customer request',
      });
      expect(responseStatus).toHaveBeenCalledWith(201);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentId: 'txn_123456789',
          status: 'completed',
          amount: 50.0,
          reason: 'Customer request',
        })
      );
    });

    it('should handle refund failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '3',
        responseText: 'This transaction cannot be refunded.',
        errors: ['Transaction already refunded'],
      };

      mockPaymentService.refundTransaction.mockResolvedValue(mockResult);

      await paymentController.refundPayment(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment refund failed',
          message: 'This transaction cannot be refunded.',
        })
      );
    });
  });

  describe('cancelPayment', () => {
    beforeEach(() => {
      mockRequest.params = { transactionId: 'auth_123456789' };
      mockRequest.body = {};
    });

    it('should cancel a payment successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'void_123456789',
        responseCode: '1',
        responseText: 'This transaction has been voided.',
      };

      mockPaymentService.cancelTransaction.mockResolvedValue(mockResult);

      await paymentController.cancelPayment(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(mockPaymentService.cancelTransaction).toHaveBeenCalledWith({
        transactionId: 'auth_123456789',
      });
      expect(responseStatus).toHaveBeenCalledWith(200);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'void_123456789',
          originalTransactionId: 'auth_123456789',
          status: 'cancelled',
        })
      );
    });

    it('should handle cancel failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '3',
        responseText: 'This transaction cannot be voided.',
        errors: ['Transaction already settled'],
      };

      mockPaymentService.cancelTransaction.mockResolvedValue(mockResult);

      await paymentController.cancelPayment(
        mockRequest as IdempotentRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Payment cancel failed',
          message: 'This transaction cannot be voided.',
        })
      );
    });
  });
});
