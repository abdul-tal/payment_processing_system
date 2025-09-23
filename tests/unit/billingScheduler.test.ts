import {
  BillingScheduler,
  RetryConfig,
} from '../../src/services/billingScheduler';
import { SubscriptionService } from '../../src/services/subscriptionService';
import {
  Subscription,
  SubscriptionStatus,
  BillingInterval,
} from '../../src/entities/Subscription';

// Mock dependencies
jest.mock('../../src/services/subscriptionService');
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));
jest.mock('crypto', () => ({
  randomUUID: jest.fn(),
}));

const mockSubscriptionService = {
  getSubscriptionsDueForBilling: jest.fn(),
  processBilling: jest.fn(),
  updateSubscription: jest.fn(),
  getSubscription: jest.fn(),
} as any;

const mockRandomUUID = require('crypto').randomUUID as jest.MockedFunction<
  () => string
>;

// Get reference to mocked logger
const { logger: mockLogger } = require('../../src/config/logger');

// Mock SubscriptionService constructor
(
  SubscriptionService as jest.MockedClass<typeof SubscriptionService>
).mockImplementation(() => mockSubscriptionService);

describe('BillingScheduler', () => {
  let billingScheduler: BillingScheduler;
  let mockSubscription: Subscription;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockRandomUUID.mockReturnValue('test-correlation-id' as any);

    mockSubscription = {
      id: 'sub-123',
      subscription_id: 'subscription-123',
      authorize_net_subscription_id: 'auth-net-123',
      customer_email: 'test@example.com',
      customer_name: 'Test Customer',
      status: SubscriptionStatus.ACTIVE,
      plan_name: 'Basic Plan',
      amount: 29.99,
      currency: 'USD',
      billing_interval: BillingInterval.MONTHLY,
      start_date: new Date(),
      end_date: new Date(),
      next_billing_date: new Date(),
      last_billing_date: new Date(),
      billing_cycles_completed: 0,
      total_billing_cycles: null,
      card_last_four: '1234',
      card_type: 'visa',
      metadata: {},
      cancellation_reason: 'test reason',
      cancelled_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    } as Subscription;

    billingScheduler = new BillingScheduler();
  });

  afterEach(() => {
    jest.useRealTimers();
    if (billingScheduler) {
      billingScheduler.stop();
    }
  });

  describe('Constructor', () => {
    it('should initialize with default retry configuration', () => {
      const stats = billingScheduler.getRetryStatistics();

      expect(stats.total_retries).toBe(0);
      expect(SubscriptionService).toHaveBeenCalled();
    });

    it('should initialize with custom retry configuration', () => {
      const customConfig: Partial<RetryConfig> = {
        maxRetries: 3,
        baseDelayMs: 30000,
        maxDelayMs: 43200000,
        backoffMultiplier: 1.5,
      };

      const scheduler = new BillingScheduler(customConfig);
      expect(scheduler).toBeInstanceOf(BillingScheduler);
    });
  });

  describe('Scheduler Lifecycle', () => {
    it('should start the scheduler successfully', () => {
      billingScheduler.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting billing scheduler',
        expect.objectContaining({
          check_interval_ms: 60000,
          retry_config: expect.any(Object),
        })
      );
    });

    it('should warn when trying to start already running scheduler', () => {
      billingScheduler.start();
      billingScheduler.start();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Billing scheduler is already running'
      );
    });

    it('should stop the scheduler successfully', () => {
      billingScheduler.start();
      billingScheduler.stop();

      expect(mockLogger.info).toHaveBeenCalledWith('Billing scheduler stopped');
    });

    it('should warn when trying to stop non-running scheduler', () => {
      billingScheduler.stop();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Billing scheduler is not running'
      );
    });

    it('should process billing cycle on start and interval', async () => {
      mockSubscriptionService.getSubscriptionsDueForBilling.mockResolvedValue(
        []
      );

      billingScheduler.start();

      // Fast-forward time to trigger interval
      jest.advanceTimersByTime(60000);

      await Promise.resolve(); // Allow async operations to complete

      expect(
        mockSubscriptionService.getSubscriptionsDueForBilling
      ).toHaveBeenCalledTimes(2);
    });
  });

  describe('Regular Billing Processing', () => {
    it('should process no subscriptions when none are due', async () => {
      mockSubscriptionService.getSubscriptionsDueForBilling.mockResolvedValue(
        []
      );

      billingScheduler.start();
      await Promise.resolve();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No subscriptions due for billing',
        { correlationId: 'test-correlation-id' }
      );
    });

    it('should process due subscriptions successfully', async () => {
      mockSubscriptionService.getSubscriptionsDueForBilling.mockResolvedValue([
        mockSubscription,
      ]);
      mockSubscriptionService.processBilling.mockResolvedValue(true);

      billingScheduler.start();
      await Promise.resolve();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing regular billing',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscriptions_count: 1,
        })
      );

      expect(mockSubscriptionService.processBilling).toHaveBeenCalledWith(
        mockSubscription
      );
    });

    it('should handle billing processing errors', async () => {
      mockSubscriptionService.getSubscriptionsDueForBilling.mockRejectedValue(
        new Error('Database error')
      );

      billingScheduler.start();
      await Promise.resolve();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing regular billing',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          error: 'Database error',
        })
      );
    });
  });

  describe('Single Subscription Processing', () => {
    it('should process successful subscription billing', async () => {
      mockSubscriptionService.processBilling.mockResolvedValue(true);

      const scheduler = billingScheduler as any;
      await scheduler.processSingleSubscription(
        mockSubscription,
        'test-correlation-id'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Subscription billing successful',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
        })
      );
    });

    it('should handle failed subscription billing', async () => {
      mockSubscriptionService.processBilling.mockResolvedValue(false);
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.processSingleSubscription(
        mockSubscription,
        'test-correlation-id'
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Subscription billing failed',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
        })
      );
    });

    it('should handle subscription processing errors', async () => {
      mockSubscriptionService.processBilling.mockRejectedValue(
        new Error('Payment gateway error')
      );
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.processSingleSubscription(
        mockSubscription,
        'test-correlation-id'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing single subscription',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
          error: 'Payment gateway error',
        })
      );
    });
  });

  describe('Payment Retry Scheduling', () => {
    it('should schedule first payment retry with correct delay', async () => {
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.schedulePaymentRetry(
        mockSubscription,
        'Payment failed',
        'test-correlation-id'
      );

      const stats = billingScheduler.getRetryStatistics();
      expect(stats.total_retries).toBe(1);
      expect(stats.retries_by_attempt[1]).toBe(1);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Scheduled payment retry',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
          attempt_count: 1,
          delay_ms: 60000, // Base delay
        })
      );
    });

    it('should calculate exponential backoff correctly', async () => {
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;

      // First retry
      await scheduler.schedulePaymentRetry(
        mockSubscription,
        'Payment failed',
        'test-correlation-id'
      );

      // Second retry (should have exponential backoff)
      await scheduler.schedulePaymentRetry(
        mockSubscription,
        'Payment failed again',
        'test-correlation-id'
      );

      expect(mockLogger.info).toHaveBeenLastCalledWith(
        'Scheduled payment retry',
        expect.objectContaining({
          attempt_count: 2,
          delay_ms: 120000, // 60000 * 2^(2-1) = 120000
        })
      );
    });

    it('should suspend subscription after max retries', async () => {
      const customConfig: Partial<RetryConfig> = { maxRetries: 2 };
      const scheduler = new BillingScheduler(customConfig) as any;

      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      // First retry
      await scheduler.schedulePaymentRetry(
        mockSubscription,
        'Payment failed',
        'test-correlation-id'
      );
      // Second retry
      await scheduler.schedulePaymentRetry(
        mockSubscription,
        'Payment failed',
        'test-correlation-id'
      );
      // Third attempt should suspend
      await scheduler.schedulePaymentRetry(
        mockSubscription,
        'Payment failed',
        'test-correlation-id'
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Maximum retry attempts reached, suspending subscription',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
          attempt_count: 3,
          max_retries: 2,
        })
      );

      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith(
        mockSubscription.id,
        expect.objectContaining({
          status: SubscriptionStatus.SUSPENDED,
          metadata: expect.objectContaining({
            suspension_reason: 'Maximum payment retry attempts exceeded',
          }),
        })
      );
    });

    it('should cap delay at maximum configured value', async () => {
      const customConfig: Partial<RetryConfig> = {
        maxRetries: 10,
        baseDelayMs: 60000,
        maxDelayMs: 300000, // 5 minutes max
        backoffMultiplier: 2,
      };
      const scheduler = new BillingScheduler(customConfig) as any;

      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      // Schedule multiple retries to exceed max delay
      for (let i = 0; i < 5; i++) {
        await scheduler.schedulePaymentRetry(
          mockSubscription,
          'Payment failed',
          'test-correlation-id'
        );
      }

      // The last call should have delay capped at maxDelayMs
      expect(mockLogger.info).toHaveBeenLastCalledWith(
        'Scheduled payment retry',
        expect.objectContaining({
          delay_ms: 300000, // Capped at maxDelayMs
        })
      );
    });
  });

  describe('Failed Payment Retry Processing', () => {
    beforeEach(() => {
      // Add a retry to the scheduler
      const scheduler = billingScheduler as any;
      const pastDate = new Date(Date.now() - 60000); // 1 minute ago
      scheduler.failedPaymentRetries.set(mockSubscription.id, {
        subscription_id: mockSubscription.subscription_id,
        attempt_count: 1,
        next_retry_date: pastDate,
        last_error: 'Payment failed',
        created_at: pastDate,
      });
    });

    it('should process due payment retries', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(
        mockSubscription
      );
      mockSubscriptionService.processBilling.mockResolvedValue(true);
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.processFailedPaymentRetries('test-correlation-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Processing failed payment retries',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          retries_count: 1,
        })
      );
    });

    it('should handle successful payment retry', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(
        mockSubscription
      );
      mockSubscriptionService.processBilling.mockResolvedValue(true);
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.processFailedPaymentRetries('test-correlation-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Payment retry successful',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
          attempt_count: 1,
        })
      );

      // Should clear retry metadata
      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith(
        mockSubscription.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            payment_retry: undefined,
            last_successful_retry: expect.objectContaining({
              attempt_count: 1,
            }),
          }),
        })
      );
    });

    it('should handle failed payment retry', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(
        mockSubscription
      );
      mockSubscriptionService.processBilling.mockResolvedValue(false);
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.processFailedPaymentRetries('test-correlation-id');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Payment retry failed',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
          attempt_count: 1,
        })
      );
    });

    it('should skip retry for non-existent subscription', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.processFailedPaymentRetries('test-correlation-id');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Subscription not found for retry',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
        })
      );

      // Should remove from retry queue
      const stats = billingScheduler.getRetryStatistics();
      expect(stats.total_retries).toBe(0);
    });

    it('should skip retry for non-active subscription', async () => {
      const inactiveSubscription = {
        ...mockSubscription,
        status: SubscriptionStatus.CANCELLED,
      };
      mockSubscriptionService.getSubscription.mockResolvedValue(
        inactiveSubscription
      );

      const scheduler = billingScheduler as any;
      await scheduler.processFailedPaymentRetries('test-correlation-id');

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Skipping retry for non-active subscription',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
          status: SubscriptionStatus.CANCELLED,
        })
      );
    });

    it('should handle errors during payment retry processing', async () => {
      mockSubscriptionService.getSubscription.mockRejectedValue(
        new Error('Database error')
      );

      const scheduler = billingScheduler as any;
      try {
        await scheduler.processFailedPaymentRetries('test-correlation-id');
      } catch (error) {
        // Expected to throw
      }

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing payment retry',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          error: 'Database error',
          subscription_id: 'subscription-123',
          attempt_count: 1,
        })
      );
    });
  });

  describe('Retry Statistics', () => {
    it('should return empty statistics when no retries exist', () => {
      const stats = billingScheduler.getRetryStatistics();

      expect(stats).toEqual({
        total_retries: 0,
        retries_by_attempt: {},
        oldest_retry: null,
        newest_retry: null,
      });
    });

    it('should return correct statistics with retries', async () => {
      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;

      // Add multiple retries
      await scheduler.schedulePaymentRetry(
        mockSubscription,
        'Error 1',
        'test-correlation-id'
      );

      const subscription2 = {
        ...mockSubscription,
        id: 'sub-456',
        subscription_id: 'subscription-456',
      };
      await scheduler.schedulePaymentRetry(
        subscription2,
        'Error 2',
        'test-correlation-id'
      );
      await scheduler.schedulePaymentRetry(
        subscription2,
        'Error 3',
        'test-correlation-id'
      );

      const stats = billingScheduler.getRetryStatistics();

      expect(stats.total_retries).toBe(2);
      expect(stats.retries_by_attempt[1]).toBe(1);
      expect(stats.retries_by_attempt[2]).toBe(1);
      expect(stats.oldest_retry).toBeInstanceOf(Date);
      expect(stats.newest_retry).toBeInstanceOf(Date);
    });
  });

  describe('Manual Billing Trigger', () => {
    it('should successfully trigger billing for existing subscription', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(
        mockSubscription
      );
      mockSubscriptionService.processBilling.mockResolvedValue(true);

      const result = await billingScheduler.triggerBilling('sub-123');

      expect(result).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Manually triggering billing',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: mockSubscription.subscription_id,
        })
      );
    });

    it('should return false for non-existent subscription', async () => {
      mockSubscriptionService.getSubscription.mockResolvedValue(null);

      const result = await billingScheduler.triggerBilling('non-existent');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Subscription not found for manual billing trigger',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: 'non-existent',
        })
      );
    });

    it('should handle errors during manual billing trigger', async () => {
      mockSubscriptionService.getSubscription.mockRejectedValue(
        new Error('Database error')
      );

      const result = await billingScheduler.triggerBilling('sub-123');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error in manual billing trigger',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          subscription_id: 'sub-123',
          error: 'Database error',
        })
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle non-Error exceptions gracefully', async () => {
      mockSubscriptionService.getSubscriptionsDueForBilling.mockRejectedValue(
        'Unknown error'
      );

      const scheduler = billingScheduler as any;
      await scheduler.processBillingCycle('test-correlation-id');

      await Promise.resolve();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing regular billing',
        expect.objectContaining({
          correlationId: 'test-correlation-id',
          error: 'Unknown error',
        })
      );
    });

    it('should handle missing correlation ID gracefully', async () => {
      mockRandomUUID.mockReturnValue(undefined as any);
      mockSubscriptionService.getSubscriptionsDueForBilling.mockResolvedValue(
        []
      );

      billingScheduler.start();
      await Promise.resolve();

      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should handle subscription with missing metadata', async () => {
      const subscriptionWithoutMetadata = {
        ...mockSubscription,
        metadata: undefined as any,
      };

      mockSubscriptionService.updateSubscription.mockResolvedValue(null);

      const scheduler = billingScheduler as any;
      await scheduler.schedulePaymentRetry(
        subscriptionWithoutMetadata,
        'Error',
        'test-correlation-id'
      );

      expect(mockSubscriptionService.updateSubscription).toHaveBeenCalledWith(
        subscriptionWithoutMetadata.id,
        expect.objectContaining({
          metadata: expect.objectContaining({
            payment_retry: expect.any(Object),
          }),
        })
      );
    });

    it('should handle empty retry queue processing', async () => {
      const scheduler = billingScheduler as any;
      await scheduler.processFailedPaymentRetries('test-correlation-id');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'No payment retries due for processing',
        { correlationId: 'test-correlation-id' }
      );
    });

    it('should handle future retry dates correctly', () => {
      const scheduler = billingScheduler as any;
      const futureDate = new Date(Date.now() + 60000); // 1 minute in future

      scheduler.failedPaymentRetries.set('future-retry', {
        subscription_id: 'future-sub',
        attempt_count: 1,
        next_retry_date: futureDate,
        last_error: 'Payment failed',
        created_at: new Date(),
      });

      const stats = billingScheduler.getRetryStatistics();
      expect(stats.total_retries).toBe(1);
    });
  });
});
