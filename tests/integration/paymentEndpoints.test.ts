import request from 'supertest';
import { createApp } from '../../src/app';
import { paymentService } from '../../src/services/paymentService';
import { clearCleanupInterval } from '../../src/middleware/idempotency';

// Mock the payment service and JWT middleware for integration tests
jest.mock('../../src/services/paymentService');
jest.mock('../../src/config/logger');
jest.mock('../../src/middleware/jwtAuth', () => ({
  jwtAuth: (req: any, _res: any, next: any) => {
    req.user = {
      id: 'test-user-id',
      username: 'testuser',
      email: 'test@example.com',
    };
    next();
  },
}));

const mockPaymentService = paymentService as jest.Mocked<typeof paymentService>;

describe('Payment Endpoints Integration Tests', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  afterAll(() => {
    // Clear the cleanup interval to prevent Jest from hanging
    clearCleanupInterval();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const validPaymentData = {
    amount: 100.0,
    currency: 'USD',
    description: 'Test payment',
    customerEmail: 'test@example.com',
    customerName: 'John Doe',
    invoiceNumber: 'INV-001',
    paymentMethod: {
      type: 'credit_card',
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

  describe('POST /api/v1/payments/purchase', () => {
    it('should process a purchase successfully', async () => {
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

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .send(validPaymentData)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'txn_123456789',
        status: 'completed',
        amount: 100.0,
        currency: 'USD',
        authCode: 'AUTH123',
      });
      expect(response.body.correlationId).toBeDefined();
    });

    it('should handle validation errors', async () => {
      const invalidData = {
        ...validPaymentData,
        amount: -10, // Invalid negative amount
      };

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should handle payment method validation errors', async () => {
      mockPaymentService.validatePaymentMethod.mockReturnValue([
        'Invalid card number format',
      ]);

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .send(validPaymentData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid payment method',
        details: ['Invalid card number format'],
      });
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

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .send(validPaymentData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Payment processing failed',
        message: 'This transaction has been declined.',
        details: ['Insufficient funds'],
      });
    });

    it('should support idempotency keys', async () => {
      const mockResult = {
        success: true,
        transactionId: 'txn_123456789',
        authCode: 'AUTH123',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
      };

      mockPaymentService.validatePaymentMethod.mockReturnValue([]);
      mockPaymentService.processPurchase.mockResolvedValue(mockResult);

      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440000';

      // First request
      const response1 = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .set('Idempotency-Key', idempotencyKey)
        .send(validPaymentData)
        .expect(201);

      // Second request with same idempotency key should return cached response
      const response2 = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .set('Idempotency-Key', idempotencyKey)
        .send(validPaymentData)
        .expect(201);

      expect(response1.body).toEqual(response2.body);
      expect(mockPaymentService.processPurchase).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/v1/payments/authorize', () => {
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

      const response = await request(app)
        .post('/api/v1/payments/authorize')
        .set('X-API-Key', 'test-api-key-12345')
        .send(validPaymentData)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'auth_987654321',
        status: 'authorized',
        amount: 100.0,
        authCode: 'AUTH456',
      });
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

      const response = await request(app)
        .post('/api/v1/payments/authorize')
        .set('X-API-Key', 'test-api-key-12345')
        .send(validPaymentData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Payment authorization failed',
        message: 'This transaction has been declined.',
      });
    });
  });

  describe('POST /api/v1/payments/:transactionId/capture', () => {
    it('should capture a payment successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'cap_123456789',
        authCode: 'CAPTURE123',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
      };

      mockPaymentService.captureTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/auth_123456789/capture')
        .set('X-API-Key', 'test-api-key-12345')
        .send({ amount: 75.0 })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'cap_123456789',
        originalTransactionId: 'auth_123456789',
        status: 'captured',
        amount: 75.0,
      });
    });

    it('should capture full amount when amount not specified', async () => {
      const mockResult = {
        success: true,
        transactionId: 'cap_123456789',
        authCode: 'CAPTURE123',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
      };

      mockPaymentService.captureTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/auth_123456789/capture')
        .set('X-API-Key', 'test-api-key-12345')
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'cap_123456789',
        originalTransactionId: 'auth_123456789',
        status: 'captured',
        amount: 'full_amount',
      });
    });

    it('should handle capture failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '3',
        responseText: 'This transaction cannot be captured.',
        errors: ['Transaction not found'],
      };

      mockPaymentService.captureTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/invalid_txn/capture')
        .set('X-API-Key', 'test-api-key-12345')
        .send({ amount: 50.0 })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Payment capture failed',
        message: 'This transaction cannot be captured.',
      });
    });

    it('should validate transaction ID parameter', async () => {
      await request(app)
        .post('/api/v1/payments//capture') // Empty transaction ID
        .set('X-API-Key', 'test-api-key-12345')
        .send({ amount: 50.0 })
        .expect(404);
    });
  });

  describe('POST /api/v1/payments/:transactionId/refund', () => {
    it('should refund a payment successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'ref_123456789',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
        amount: 50.0,
      };

      mockPaymentService.refundTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/txn_123456789/refund')
        .set('X-API-Key', 'test-api-key-12345')
        .send({ amount: 50.0, reason: 'Customer request' })
        .expect(201);

      expect(response.body).toMatchObject({
        paymentId: 'txn_123456789',
        status: 'completed',
        amount: 50.0,
        reason: 'Customer request',
      });
      expect(response.body.id).toMatch(/^ref_/);
    });

    it('should refund full amount when amount not specified', async () => {
      const mockResult = {
        success: true,
        transactionId: 'ref_123456789',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
        amount: 100.0,
      };

      mockPaymentService.refundTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/txn_123456789/refund')
        .set('X-API-Key', 'test-api-key-12345')
        .send({ reason: 'Full refund' })
        .expect(201);

      expect(response.body).toMatchObject({
        paymentId: 'txn_123456789',
        status: 'completed',
        amount: 100.0,
        reason: 'Full refund',
      });
    });

    it('should handle refund failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '3',
        responseText: 'This transaction cannot be refunded.',
        errors: ['Transaction already refunded'],
      };

      mockPaymentService.refundTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/txn_123456789/refund')
        .set('X-API-Key', 'test-api-key-12345')
        .send({ amount: 25.0 })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Payment refund failed',
        message: 'This transaction cannot be refunded.',
      });
    });

    it('should support idempotency for refunds', async () => {
      const mockResult = {
        success: true,
        transactionId: 'ref_123456789',
        responseCode: '1',
        responseText: 'This transaction has been approved.',
        amount: 50.0,
      };

      mockPaymentService.refundTransaction.mockResolvedValue(mockResult);

      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440001';

      // First refund request
      const response1 = await request(app)
        .post('/api/v1/payments/txn_123456789/refund')
        .set('X-API-Key', 'test-api-key-12345')
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 50.0, reason: 'Customer request' })
        .expect(201);

      // Second refund request with same idempotency key
      const response2 = await request(app)
        .post('/api/v1/payments/txn_123456789/refund')
        .set('X-API-Key', 'test-api-key-12345')
        .set('Idempotency-Key', idempotencyKey)
        .send({ amount: 50.0, reason: 'Customer request' })
        .expect(201);

      expect(response1.body).toEqual(response2.body);
      expect(mockPaymentService.refundTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /api/v1/payments/:transactionId/cancel', () => {
    it('should cancel a payment successfully', async () => {
      const mockResult = {
        success: true,
        transactionId: 'void_123456789',
        responseCode: '1',
        responseText: 'This transaction has been voided.',
      };

      mockPaymentService.cancelTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/auth_123456789/cancel')
        .set('X-API-Key', 'test-api-key-12345')
        .send({})
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'void_123456789',
        originalTransactionId: 'auth_123456789',
        status: 'cancelled',
      });
      expect(response.body.cancelledAt).toBeDefined();
    });

    it('should handle cancel failure', async () => {
      const mockResult = {
        success: false,
        responseCode: '3',
        responseText: 'This transaction cannot be voided.',
        errors: ['Transaction already settled'],
      };

      mockPaymentService.cancelTransaction.mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/v1/payments/settled_txn/cancel')
        .set('X-API-Key', 'test-api-key-12345')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Payment cancel failed',
        message: 'This transaction cannot be voided.',
      });
    });

    it('should support idempotency for cancellations', async () => {
      const mockResult = {
        success: true,
        transactionId: 'void_123456789',
        responseCode: '1',
        responseText: 'This transaction has been voided.',
      };

      mockPaymentService.cancelTransaction.mockResolvedValue(mockResult);

      const idempotencyKey = '550e8400-e29b-41d4-a716-446655440002';

      // First cancel request
      const response1 = await request(app)
        .post('/api/v1/payments/auth_123456789/cancel')
        .set('X-API-Key', 'test-api-key-12345')
        .set('Idempotency-Key', idempotencyKey)
        .send({})
        .expect(200);

      // Second cancel request with same idempotency key
      const response2 = await request(app)
        .post('/api/v1/payments/auth_123456789/cancel')
        .set('X-API-Key', 'test-api-key-12345')
        .set('Idempotency-Key', idempotencyKey)
        .send({})
        .expect(200);

      expect(response1.body).toEqual(response2.body);
      expect(mockPaymentService.cancelTransaction).toHaveBeenCalledTimes(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid idempotency key format', async () => {
      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .set('Idempotency-Key', 'invalid key with spaces!')
        .send(validPaymentData)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid idempotency key format',
      });
    });

    it('should handle missing required fields', async () => {
      const incompleteData = {
        amount: 100.0,
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .send(incompleteData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should handle invalid card number format', async () => {
      const invalidCardData = {
        ...validPaymentData,
        paymentMethod: {
          ...validPaymentData.paymentMethod,
          cardNumber: '1234', // Invalid card number
        },
      };

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .send(invalidCardData)
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should handle service unavailable errors', async () => {
      mockPaymentService.validatePaymentMethod.mockReturnValue([]);
      mockPaymentService.processPurchase.mockRejectedValue(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .set('X-API-Key', 'test-api-key-12345')
        .send(validPaymentData)
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal server error',
        message: 'Payment processing failed due to a system error',
      });
    });
  });
});
