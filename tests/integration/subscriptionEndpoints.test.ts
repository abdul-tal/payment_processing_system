import request from 'supertest';
import { createApp } from '../../src/app';
import { AppDataSource } from '../../src/config/database';
import {
  Subscription,
  SubscriptionStatus,
  BillingInterval,
} from '../../src/entities/Subscription';
import { Express } from 'express';

describe('Subscription Endpoints Integration Tests', () => {
  let app: Express;

  beforeAll(async () => {
    // Initialize test database connection
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    app = createApp();
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  beforeEach(async () => {
    // Clean up subscriptions table before each test
    const subscriptionRepository = AppDataSource.getRepository(Subscription);
    await subscriptionRepository.clear();
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
      // First create a subscription
      const subscriptionRepository = AppDataSource.getRepository(Subscription);
      const subscription = new Subscription();
      subscription.subscription_id = 'sub_test_123';
      subscription.customer_email = 'test@example.com';
      subscription.customer_name = 'Test User';
      subscription.plan_name = 'Premium Plan';
      subscription.amount = 29.99;
      subscription.currency = 'USD';
      subscription.billing_interval = BillingInterval.MONTHLY;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.start_date = new Date();
      subscription.next_billing_date = new Date();
      subscription.billing_cycles_completed = 0;

      const savedSubscription = await subscriptionRepository.save(subscription);

      const response = await request(app)
        .get(`/api/v1/subscriptions/${savedSubscription.id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(savedSubscription.id);
      expect(response.body.data.subscription_id).toBe('sub_test_123');
      expect(response.body.data.customer_email).toBe('test@example.com');
    });

    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/non-existent-id')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Subscription not found');
    });
  });

  describe('PUT /api/v1/subscriptions/:id', () => {
    it('should update a subscription', async () => {
      // First create a subscription
      const subscriptionRepository = AppDataSource.getRepository(Subscription);
      const subscription = new Subscription();
      subscription.subscription_id = 'sub_test_123';
      subscription.customer_email = 'test@example.com';
      subscription.plan_name = 'Basic Plan';
      subscription.amount = 19.99;
      subscription.currency = 'USD';
      subscription.billing_interval = BillingInterval.MONTHLY;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.start_date = new Date();
      subscription.next_billing_date = new Date();
      subscription.billing_cycles_completed = 0;
      subscription.metadata = {};

      const savedSubscription = await subscriptionRepository.save(subscription);

      const updateData = {
        plan_name: 'Premium Plan',
        amount: 29.99,
        metadata: { updated: true },
      };

      const response = await request(app)
        .put(`/api/v1/subscriptions/${savedSubscription.id}`)
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
        .send(updateData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Subscription not found');
    });
  });

  describe('DELETE /api/v1/subscriptions/:id', () => {
    it('should cancel a subscription', async () => {
      // First create a subscription
      const subscriptionRepository = AppDataSource.getRepository(Subscription);
      const subscription = new Subscription();
      subscription.subscription_id = 'sub_test_123';
      subscription.customer_email = 'test@example.com';
      subscription.plan_name = 'Premium Plan';
      subscription.amount = 29.99;
      subscription.currency = 'USD';
      subscription.billing_interval = BillingInterval.MONTHLY;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.start_date = new Date();
      subscription.next_billing_date = new Date();
      subscription.billing_cycles_completed = 0;

      const savedSubscription = await subscriptionRepository.save(subscription);

      const response = await request(app)
        .delete(`/api/v1/subscriptions/${savedSubscription.id}`)
        .send({ reason: 'User requested cancellation' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancelled_at).toBeDefined();
      expect(response.body.data.cancellation_reason).toBe(
        'User requested cancellation'
      );
    });

    it('should return 404 for non-existent subscription cancellation', async () => {
      const response = await request(app)
        .delete('/api/v1/subscriptions/non-existent-id')
        .send({ reason: 'Test cancellation' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Subscription not found');
    });
  });

  describe('GET /api/v1/subscriptions/customer/:email', () => {
    it('should retrieve subscriptions by customer email', async () => {
      // Create multiple subscriptions for the same customer
      const subscriptionRepository = AppDataSource.getRepository(Subscription);

      const subscription1 = new Subscription();
      subscription1.subscription_id = 'sub_test_1';
      subscription1.customer_email = 'test@example.com';
      subscription1.plan_name = 'Basic Plan';
      subscription1.amount = 19.99;
      subscription1.currency = 'USD';
      subscription1.billing_interval = BillingInterval.MONTHLY;
      subscription1.status = SubscriptionStatus.ACTIVE;
      subscription1.start_date = new Date();
      subscription1.next_billing_date = new Date();
      subscription1.billing_cycles_completed = 0;

      const subscription2 = new Subscription();
      subscription2.subscription_id = 'sub_test_2';
      subscription2.customer_email = 'test@example.com';
      subscription2.plan_name = 'Premium Plan';
      subscription2.amount = 29.99;
      subscription2.currency = 'USD';
      subscription2.billing_interval = BillingInterval.MONTHLY;
      subscription2.status = SubscriptionStatus.CANCELLED;
      subscription2.start_date = new Date();
      subscription2.next_billing_date = new Date();
      subscription2.billing_cycles_completed = 2;

      await subscriptionRepository.save([subscription1, subscription2]);

      const response = await request(app)
        .get('/api/v1/subscriptions/customer/test@example.com')
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
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email format');
    });

    it('should return empty array for customer with no subscriptions', async () => {
      const response = await request(app)
        .get('/api/v1/subscriptions/customer/nonexistent@example.com')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });
  });
});
