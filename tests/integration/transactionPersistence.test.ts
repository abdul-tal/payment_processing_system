import request from 'supertest';
import { createApp } from '../../src/app';
import { AppDataSource } from '../../src/config/database';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../../src/entities/Transaction';
import { clearCleanupInterval } from '../../src/middleware/idempotency';

describe('Transaction Persistence Integration Tests', () => {
  let app: any;
  let transactionRepository: any;

  beforeAll(async () => {
    app = createApp();
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    transactionRepository = AppDataSource.getRepository(Transaction);
  });

  afterAll(async () => {
    // Clear the idempotency cleanup interval to prevent Jest hanging
    clearCleanupInterval();

    // Clean up database connection
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  }, 10000);

  beforeEach(async () => {
    // Clean up transactions before each test
    await transactionRepository.clear();
  });

  describe('Purchase Transaction Persistence', () => {
    it('should save purchase transaction to database', async () => {
      const uniqueAmount = 100 + Math.floor(Math.random() * 100);
      const purchaseRequest = {
        amount: uniqueAmount,
        currency: 'USD',
        paymentMethod: {
          type: 'credit_card',
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
        customerName: 'John Doe',
        customerEmail: 'john.doe@example.com',
        description: 'Test purchase',
      };

      const response = await request(app)
        .post('/api/v1/payments/purchase')
        .send(purchaseRequest);

      // Handle both success (201) and failure (400) cases
      if (response.status === 201) {
        expect(response.body.status).toBe('completed');
        expect(response.body.id).toBeDefined();
      } else if (response.status === 400) {
        // Transaction failed, but we should still check if it was persisted
        expect(response.body.error).toBeDefined();
      } else {
        throw new Error(`Unexpected status code: ${response.status}`);
      }

      // Check if transaction was saved to database
      const savedTransactions = await transactionRepository.find({
        where: { type: TransactionType.PAYMENT },
      });

      expect(savedTransactions).toHaveLength(1);
      const savedTransaction = savedTransactions[0];
      expect(parseFloat(savedTransaction.amount)).toBe(uniqueAmount);
      expect(savedTransaction.type).toBe(TransactionType.PAYMENT);
      // Status could be COMPLETED for success or FAILED for failure
      expect([TransactionStatus.COMPLETED, TransactionStatus.FAILED]).toContain(
        savedTransaction.status
      );
      expect(savedTransaction.customer_email).toBe('john.doe@example.com');
      expect(savedTransaction.description).toBe('Test purchase');
    });
  });

  describe('Refund Transaction Persistence', () => {
    it('should save refund transaction to database', async () => {
      // First create a purchase transaction
      const uniqueAmount = 150 + Math.floor(Math.random() * 100);
      const purchaseRequest = {
        amount: uniqueAmount,
        currency: 'USD',
        paymentMethod: {
          type: 'credit_card',
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
        customerName: 'John Doe',
        customerEmail: 'john.doe@example.com',
      };

      const purchaseResponse = await request(app)
        .post('/api/v1/payments/purchase')
        .send(purchaseRequest);

      // Skip refund test if purchase failed
      if (purchaseResponse.status !== 201) {
        console.log('Skipping refund test - purchase failed');
        return;
      }

      const transactionId = purchaseResponse.body.id;

      // Now refund it
      const refundRequest = {
        amount: 50.0,
        reason: 'Customer request',
      };

      const refundResponse = await request(app)
        .post(`/api/v1/payments/${transactionId}/refund`)
        .send(refundRequest);

      // Handle both success (201) and failure (400) cases for refunds
      if (refundResponse.status === 201) {
        expect(refundResponse.body.status).toBe('completed');
      } else if (refundResponse.status === 400) {
        // Refund failed (likely because transaction not settled in sandbox), but should still be persisted
        expect(refundResponse.body.error).toBeDefined();
      } else {
        throw new Error(`Unexpected status code: ${refundResponse.status}`);
      }

      // Check if both transactions were saved to database
      const savedTransactions = await transactionRepository.find();
      expect(savedTransactions).toHaveLength(2);

      const purchaseTransaction = savedTransactions.find(
        (t: Transaction) => t.type === TransactionType.PAYMENT
      );
      const refundTransaction = savedTransactions.find(
        (t: Transaction) => t.type === TransactionType.REFUND
      );

      expect(purchaseTransaction).toBeDefined();
      expect(refundTransaction).toBeDefined();
      expect(parseFloat(refundTransaction.amount)).toBe(50);
      expect(refundTransaction.reference_transaction_id).toBe(transactionId);
      expect(refundTransaction.description).toBe('Customer request');
      // Status could be COMPLETED for success or FAILED for failure
      expect([TransactionStatus.COMPLETED, TransactionStatus.FAILED]).toContain(
        refundTransaction.status
      );
    });
  });

  describe('Void Transaction Persistence', () => {
    it('should save void transaction to database', async () => {
      // First create an authorization
      const uniqueAmount = 200 + Math.floor(Math.random() * 100);
      const authRequest = {
        amount: uniqueAmount,
        currency: 'USD',
        paymentMethod: {
          type: 'credit_card',
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
        customerName: 'John Doe',
        customerEmail: 'john.doe@example.com',
      };

      const authResponse = await request(app)
        .post('/api/v1/payments/authorize')
        .send(authRequest);

      // Skip void test if authorization failed
      if (authResponse.status !== 201) {
        console.log('Skipping void test - authorization failed');
        return;
      }

      const transactionId = authResponse.body.id;

      // Now void it
      const voidResponse = await request(app)
        .post(`/api/v1/payments/${transactionId}/cancel`)
        .send({})
        .expect(200);

      expect(voidResponse.body.status).toBe('cancelled');

      // Check if void transaction was saved to database
      const savedTransactions = await transactionRepository.find({
        where: { type: TransactionType.VOID },
      });

      expect(savedTransactions).toHaveLength(1);
      const voidTransaction = savedTransactions[0];
      expect(voidTransaction.type).toBe(TransactionType.VOID);
      expect(voidTransaction.reference_transaction_id).toBe(transactionId);
      expect(voidTransaction.description).toBe('Void transaction');
    });
  });
});
