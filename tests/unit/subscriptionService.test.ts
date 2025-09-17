import {
  SubscriptionService,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
} from '../../src/services/subscriptionService';
import {
  Subscription,
  SubscriptionStatus,
  BillingInterval,
} from '../../src/entities/Subscription';
import { AppDataSource } from '../../src/config/database';
import { Repository } from 'typeorm';

// Mock the database connection
jest.mock('../../src/config/database');
jest.mock('../../src/config/logger');

describe('SubscriptionService', () => {
  let subscriptionService: SubscriptionService;
  let mockRepository: jest.Mocked<Repository<Subscription>>;

  beforeEach(() => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepository);
    subscriptionService = new SubscriptionService();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createSubscription', () => {
    it('should create a new subscription successfully', async () => {
      const request: CreateSubscriptionRequest = {
        customer_email: 'test@example.com',
        customer_name: 'Test User',
        plan_name: 'Premium Plan',
        amount: 29.99,
        billing_interval: BillingInterval.MONTHLY,
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '25',
        cvv: '123',
      };

      const mockSubscription = new Subscription();
      mockSubscription.id = 'test-id';
      mockSubscription.subscription_id = 'sub_123';
      mockSubscription.customer_email = request.customer_email;
      mockSubscription.plan_name = request.plan_name;
      mockSubscription.amount = request.amount;
      mockSubscription.billing_interval = request.billing_interval;
      mockSubscription.status = SubscriptionStatus.ACTIVE;

      mockRepository.save.mockResolvedValue(mockSubscription);

      const result = await subscriptionService.createSubscription(request);

      expect(result).toBeDefined();
      expect(result.customer_email).toBe(request.customer_email);
      expect(result.plan_name).toBe(request.plan_name);
      expect(result.amount).toBe(request.amount);
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(mockRepository.save).toHaveBeenCalledTimes(2); // Initial save + update with billing cycles
    });

    it('should handle errors during subscription creation', async () => {
      const request: CreateSubscriptionRequest = {
        customer_email: 'test@example.com',
        plan_name: 'Premium Plan',
        amount: 29.99,
        billing_interval: BillingInterval.MONTHLY,
        card_number: '4111111111111111',
        expiry_month: '12',
        expiry_year: '25',
        cvv: '123',
      };

      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await expect(
        subscriptionService.createSubscription(request)
      ).rejects.toThrow('Database error');
    });
  });

  describe('getSubscription', () => {
    it('should return subscription when found', async () => {
      const mockSubscription = new Subscription();
      mockSubscription.id = 'test-id';
      mockSubscription.subscription_id = 'sub_123';

      mockRepository.findOne.mockResolvedValue(mockSubscription);

      const result = await subscriptionService.getSubscription('test-id');

      expect(result).toBe(mockSubscription);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-id' },
      });
    });

    it('should return null when subscription not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result =
        await subscriptionService.getSubscription('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('updateSubscription', () => {
    it('should update subscription successfully', async () => {
      const mockSubscription = new Subscription();
      mockSubscription.id = 'test-id';
      mockSubscription.plan_name = 'Basic Plan';
      mockSubscription.amount = 19.99;
      mockSubscription.metadata = {};

      const updateRequest: UpdateSubscriptionRequest = {
        plan_name: 'Premium Plan',
        amount: 29.99,
        metadata: { updated: true },
      };

      const updatedSubscription = { ...mockSubscription, ...updateRequest };
      updatedSubscription.metadata = { updated: true };

      mockRepository.findOne.mockResolvedValue(mockSubscription);
      mockRepository.save.mockResolvedValue(
        updatedSubscription as Subscription
      );

      const result = await subscriptionService.updateSubscription(
        'test-id',
        updateRequest
      );

      expect(result).toBeDefined();
      expect(result?.plan_name).toBe('Premium Plan');
      expect(result?.amount).toBe(29.99);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should return null when subscription not found for update', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await subscriptionService.updateSubscription(
        'non-existent-id',
        {
          plan_name: 'New Plan',
        }
      );

      expect(result).toBeNull();
    });
  });

  describe('cancelSubscription', () => {
    it('should cancel subscription successfully', async () => {
      const mockSubscription = new Subscription();
      mockSubscription.id = 'test-id';
      mockSubscription.status = SubscriptionStatus.ACTIVE;

      const cancelledSubscription = { ...mockSubscription };
      cancelledSubscription.status = SubscriptionStatus.CANCELLED;
      cancelledSubscription.cancelled_at = new Date();
      cancelledSubscription.end_date = new Date();
      cancelledSubscription.cancellation_reason = 'User requested cancellation';

      mockRepository.findOne.mockResolvedValue(mockSubscription);
      mockRepository.save.mockResolvedValue(
        cancelledSubscription as Subscription
      );

      const result = await subscriptionService.cancelSubscription(
        'test-id',
        'User request'
      );

      expect(result).toBeDefined();
      expect(result?.status).toBe(SubscriptionStatus.CANCELLED);
      expect(result?.cancelled_at).toBeDefined();
      expect(result?.end_date).toBeDefined();
    });
  });

  describe('getSubscriptionsByCustomer', () => {
    it('should return customer subscriptions', async () => {
      const mockSubscriptions = [
        { id: '1', customer_email: 'test@example.com' },
        { id: '2', customer_email: 'test@example.com' },
      ] as Subscription[];

      mockRepository.find.mockResolvedValue(mockSubscriptions);

      const result =
        await subscriptionService.getSubscriptionsByCustomer(
          'test@example.com'
        );

      expect(result).toHaveLength(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        where: { customer_email: 'test@example.com' },
        order: { created_at: 'DESC' },
      });
    });
  });

  describe('getSubscriptionsDueForBilling', () => {
    it('should return subscriptions due for billing', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any
      );

      const result = await subscriptionService.getSubscriptionsDueForBilling();

      expect(result).toBeDefined();
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith(
        'subscription'
      );
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
      expect(mockQueryBuilder.getMany).toHaveBeenCalled();
    });
  });

  describe('processBilling', () => {
    it('should process billing successfully', async () => {
      const mockSubscription = new Subscription();
      mockSubscription.id = 'test-id';
      mockSubscription.subscription_id = 'sub_123';
      mockSubscription.amount = 29.99;
      mockSubscription.billing_cycles_completed = 0;
      mockSubscription.billing_interval = BillingInterval.MONTHLY;
      mockSubscription.total_billing_cycles = null;

      mockRepository.save.mockResolvedValue(mockSubscription);

      const result = await subscriptionService.processBilling(mockSubscription);

      expect(result).toBe(true);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should handle subscription that reached max billing cycles', async () => {
      const mockSubscription = new Subscription();
      mockSubscription.id = 'test-id';
      mockSubscription.subscription_id = 'sub_123';
      mockSubscription.billing_cycles_completed = 12;
      mockSubscription.total_billing_cycles = 12;

      // Mock the updateSubscription method
      jest
        .spyOn(subscriptionService, 'updateSubscription')
        .mockResolvedValue(mockSubscription);

      const result = await subscriptionService.processBilling(mockSubscription);

      expect(result).toBe(false);
      expect(subscriptionService.updateSubscription).toHaveBeenCalledWith(
        mockSubscription.id,
        { status: SubscriptionStatus.EXPIRED }
      );
    });
  });
});
