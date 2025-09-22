import request from 'supertest';
import { Application } from 'express';
import testApp from '../../src/testApp';
import { SubscriptionStatus } from '../../src/entities/Subscription';

// Mock webhook queue to avoid Redis connections in tests
jest.mock('../../src/services/webhookQueue', () =>
  require('../../src/services/testWebhookQueue')
);

// Create global mock state that can be reset between tests
const mockSubscriptions = new Map();
let mockIdCounter = 1;

const resetMockState = () => {
  mockSubscriptions.clear();
  mockIdCounter = 1;
};

// Mock SubscriptionService to avoid database calls
jest.mock('../../src/services/SubscriptionService', () => {
  return {
    SubscriptionService: jest.fn().mockImplementation(() => {
      return {
        createSubscription: jest.fn().mockImplementation(async request => {
          const id = `mock-id-${mockIdCounter++}`;
          const subscription = {
            id,
            subscription_id: `sub_${Date.now()}`,
            customer_email: request.customer_email,
            customer_name: request.customer_name || '',
            plan_name: request.plan_name,
            amount: request.amount,
            currency: request.currency || 'USD',
            billing_interval: request.billing_interval,
            status: 'active',
            created_at: new Date(),
            updated_at: new Date(),
            start_date: new Date(),
            next_billing_date: new Date(),
            billing_cycles_completed: 0,
            metadata: request.metadata || {},
          };
          mockSubscriptions.set(id, subscription);
          return subscription;
        }),

        getSubscription: jest.fn().mockImplementation(async id => {
          return mockSubscriptions.get(id) || null;
        }),

        updateSubscription: jest
          .fn()
          .mockImplementation(async (id, request) => {
            const existing = mockSubscriptions.get(id);
            if (!existing) return null;

            const updated = {
              ...existing,
              plan_name:
                request.plan_name !== undefined
                  ? request.plan_name
                  : existing.plan_name,
              amount:
                request.amount !== undefined ? request.amount : existing.amount,
              billing_interval:
                request.billing_interval !== undefined
                  ? request.billing_interval
                  : existing.billing_interval,
              status:
                request.status !== undefined ? request.status : existing.status,
              metadata:
                request.metadata !== undefined
                  ? request.metadata
                  : existing.metadata,
              updated_at: new Date(),
            };
            mockSubscriptions.set(id, updated);
            return updated;
          }),

        cancelSubscription: jest.fn().mockImplementation(async (id, reason) => {
          const existing = mockSubscriptions.get(id);
          if (!existing) return null;

          const cancelled = {
            ...existing,
            status: 'cancelled',
            cancelled_at: new Date(),
            end_date: new Date(),
            cancellation_reason: reason || 'User requested cancellation',
            updated_at: new Date(),
          };
          mockSubscriptions.set(id, cancelled);
          return cancelled;
        }),

        getSubscriptionsByCustomer: jest
          .fn()
          .mockImplementation(async customerEmail => {
            return Array.from(mockSubscriptions.values()).filter(
              sub => sub.customer_email === customerEmail
            );
          }),
      };
    }),
  };
});

// Mock PaymentService to avoid Authorize.Net calls
jest.mock('../../src/services/PaymentService', () => ({
  PaymentService: jest.fn().mockImplementation(() => ({
    createSubscription: jest.fn().mockResolvedValue({
      success: true,
      subscriptionId: `sub_${Date.now()}`,
      message: 'Subscription created successfully',
    }),
  })),
}));

let app: Application;

beforeAll(async () => {
  app = testApp;
});

afterAll(async () => {
  // Clean up any remaining mocks
  jest.clearAllMocks();
});

describe('Subscription Endpoints Integration Tests', () => {
  // Set the environment variable to ensure consistency
  process.env['DEFAULT_API_KEY'] = 'test-api-key-for-testing-purposes-only';
  const API_KEY = process.env['DEFAULT_API_KEY'];
  const headers = {
    'x-api-key': API_KEY,
    'Content-Type': 'application/json',
  };

  beforeEach(async () => {
    // Clear all mocks before each test
    jest.clearAllMocks();

    // Reset mock state to avoid data persistence between tests
    resetMockState();

    // Reset the app to get fresh service instances
    delete require.cache[require.resolve('../../src/testApp')];
    app = require('../../src/testApp').default;
  });

  describe('POST /api/v1/subscriptions', () => {
    it('should create a new subscription', async () => {
      const subscriptionData = {
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_name: 'Premium Plan',
        amount: 29.99,
        billing_interval: 'monthly',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '25',
        cvv: '123',
        billing_address: {
          first_name: 'Test',
          last_name: 'User',
          address: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          country: 'US',
        },
      };

      const response = await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(subscriptionData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.customer_email).toBe(
        subscriptionData.customer_email
      );
      expect(response.body.data.plan_name).toBe(subscriptionData.plan_name);
      expect(response.body.data.amount).toBe(subscriptionData.amount);
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.subscription_id).toMatch(/^sub_/);
    });

    it('should return 400 for missing required fields', async () => {
      const incompleteData = {
        customer_email: 'test@example.com',
        plan_name: 'Premium Plan',
        // Missing amount, billing_interval, card details
      };

      const response = await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(incompleteData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Missing required fields');
      expect(response.body.required_fields).toBeDefined();
    });

    it('should return 400 for invalid email format', async () => {
      const invalidEmailData = {
        customer_email: 'invalid-email',
        plan_name: 'Premium Plan',
        amount: 29.99,
        billing_interval: 'monthly',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '25',
        cvv: '123',
      };

      const response = await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(invalidEmailData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email format');
    });

    it('should return 400 for invalid billing interval', async () => {
      const invalidIntervalData = {
        customer_email: 'test@example.com',
        plan_name: 'Premium Plan',
        amount: 29.99,
        billing_interval: 'invalid_interval',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '25',
        cvv: '123',
      };

      const response = await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(invalidIntervalData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid billing interval');
      expect(response.body.valid_intervals).toEqual([
        'monthly',
        'quarterly',
        'yearly',
      ]);
    });
  });

  describe('GET /api/v1/subscriptions/:id', () => {
    it('should retrieve a subscription by ID', async () => {
      // Create a subscription first to get a valid ID
      const subscriptionData = {
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_name: 'Basic Plan',
        amount: 19.99,
        currency: 'USD',
        billing_interval: 'monthly',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '2025',
        cvv: '123',
        billing_address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          country: 'US',
        },
      };

      const createResponse = await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(subscriptionData)
        .expect(201);

      const subscriptionId = createResponse.body.data.id;

      const response = await request(app)
        .get(`/api/v1/subscriptions/${subscriptionId}`)
        .set(headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(subscriptionId);
      expect(response.body.data.customer_email).toBe('test@example.com');
      expect(response.body.data.plan_name).toBe('Basic Plan');
    });

    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/non-existent-id')
        .set(headers)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Subscription not found');
    });
  });

  describe('PUT /api/v1/subscriptions/:id', () => {
    it('should update a subscription', async () => {
      // Create a subscription first
      const subscriptionData = {
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_name: 'Basic Plan',
        amount: 19.99,
        currency: 'USD',
        billing_interval: 'monthly',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '2025',
        cvv: '123',
        billing_address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          country: 'US',
        },
      };

      const createResponse = await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(subscriptionData)
        .expect(201);

      const subscriptionId = createResponse.body.data.id;

      const updateData = {
        plan_name: 'Premium Plan',
        amount: 29.99,
        metadata: { updated: true },
      };

      const response = await request(app)
        .put(`/api/v1/subscriptions/${subscriptionId}`)
        .set(headers)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.plan_name).toBe('Premium Plan');
      expect(response.body.data.amount).toBe(29.99);
      expect(response.body.data.metadata.updated).toBe(true);
    });

    it('should return 404 for non-existent subscription update', async () => {
      const updateData = {
        plan_name: 'Premium Plan',
      };

      const response = await request(app)
        .put('/api/v1/subscriptions/non-existent-id')
        .set(headers)
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Subscription not found');
    });
  });

  describe('DELETE /api/v1/subscriptions/:id', () => {
    it('should cancel a subscription', async () => {
      // Create a subscription first
      const subscriptionData = {
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_name: 'Basic Plan',
        amount: 19.99,
        currency: 'USD',
        billing_interval: 'monthly',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '2025',
        cvv: '123',
        billing_address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          country: 'US',
        },
      };

      const createResponse = await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(subscriptionData)
        .expect(201);

      const subscriptionId = createResponse.body.data.id;

      const response = await request(app)
        .delete(`/api/v1/subscriptions/${subscriptionId}`)
        .set(headers)
        .send({ reason: 'Test cancellation' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe(SubscriptionStatus.CANCELLED);
      expect(response.body.data.cancellation_reason).toBe('Test cancellation');
      expect(response.body.data.cancelled_at).toBeDefined();
    });

    it('should return 404 for non-existent subscription cancellation', async () => {
      const response = await request(app)
        .delete('/api/v1/subscriptions/non-existent-id')
        .set(headers)
        .send({ reason: 'Test cancellation' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Subscription not found');
    });
  });

  describe('GET /api/v1/subscriptions/customer/:email', () => {
    it('should retrieve subscriptions by customer email', async () => {
      // Create multiple subscriptions for the same customer using the API
      const subscriptionData1 = {
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_name: 'Basic Plan',
        amount: 19.99,
        currency: 'USD',
        billing_interval: 'monthly',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '2025',
        cvv: '123',
        billing_address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          country: 'US',
        },
      };

      const subscriptionData2 = {
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_name: 'Premium Plan',
        amount: 29.99,
        currency: 'USD',
        billing_interval: 'monthly',
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '2025',
        cvv: '123',
        billing_address: {
          street: '123 Test St',
          city: 'Test City',
          state: 'TS',
          zip: '12345',
          country: 'US',
        },
      };

      // Create both subscriptions
      await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(subscriptionData1)
        .expect(201);

      await request(app)
        .post('/api/v1/subscriptions')
        .set(headers)
        .send(subscriptionData2)
        .expect(201);

      const response = await request(app)
        .get('/api/v1/subscriptions/customer/test@example.com')
        .set(headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.count).toBe(2);
      expect(response.body.data[0].customer_email).toBe('test@example.com');
      expect(response.body.data[1].customer_email).toBe('test@example.com');
    });

    it('should return 400 for invalid email format', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/customer/invalid-email')
        .set(headers)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email format');
    });

    it('should return empty array for customer with no subscriptions', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/customer/nonexistent@example.com')
        .set(headers)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });
  });
});
