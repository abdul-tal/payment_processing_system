import { SubscriptionService } from './subscriptionService';
import { Subscription, SubscriptionStatus } from '../entities/Subscription';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface FailedPaymentRetry {
  subscription_id: string;
  attempt_count: number;
  next_retry_date: Date;
  last_error: string;
  created_at: Date;
}

export class BillingScheduler {
  private subscriptionService: SubscriptionService;
  private retryConfig: RetryConfig;
  private failedPaymentRetries: Map<string, FailedPaymentRetry>;
  private isRunning: boolean = false;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(retryConfig?: Partial<RetryConfig>) {
    this.subscriptionService = new SubscriptionService();
    this.retryConfig = {
      maxRetries: 5,
      baseDelayMs: 60000, // 1 minute
      maxDelayMs: 86400000, // 24 hours
      backoffMultiplier: 2,
      ...retryConfig,
    };
    this.failedPaymentRetries = new Map();
  }

  /**
   * Start the billing scheduler
   * Runs every minute to check for due subscriptions and retries
   */
  start(): void {
    if (this.isRunning) {
      logger.warn('Billing scheduler is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting billing scheduler', {
      check_interval_ms: 60000,
      retry_config: this.retryConfig,
    });

    // Run immediately, then every minute
    this.processBillingCycle();
    this.intervalId = setInterval(() => {
      this.processBillingCycle();
    }, 60000); // Check every minute
  }

  /**
   * Stop the billing scheduler
   */
  stop(): void {
    if (!this.isRunning) {
      logger.warn('Billing scheduler is not running');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    logger.info('Billing scheduler stopped');
  }

  /**
   * Process billing cycle - check for due subscriptions and retries
   */
  private async processBillingCycle(): Promise<void> {
    const correlationId = randomUUID();

    try {
      logger.debug('Processing billing cycle', { correlationId });

      // Process regular billing
      await this.processRegularBilling(correlationId);

      // Process failed payment retries
      await this.processFailedPaymentRetries(correlationId);
    } catch (error) {
      logger.error('Error in billing cycle processing', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
  }

  /**
   * Process regular billing for subscriptions due for payment
   */
  private async processRegularBilling(correlationId: string): Promise<void> {
    try {
      const dueSubscriptions =
        await this.subscriptionService.getSubscriptionsDueForBilling();

      if (dueSubscriptions.length === 0) {
        logger.debug('No subscriptions due for billing', { correlationId });
        return;
      }

      logger.info('Processing regular billing', {
        correlationId,
        subscriptions_count: dueSubscriptions.length,
      });

      for (const subscription of dueSubscriptions) {
        await this.processSingleSubscription(subscription, correlationId);
      }
    } catch (error) {
      logger.error('Error processing regular billing', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Process a single subscription billing
   */
  private async processSingleSubscription(
    subscription: Subscription,
    correlationId: string
  ): Promise<void> {
    try {
      logger.info('Processing subscription billing', {
        correlationId,
        subscription_id: subscription.subscription_id,
        amount: subscription.amount,
        next_billing_date: subscription.next_billing_date,
      });

      const success =
        await this.subscriptionService.processBilling(subscription);

      if (success) {
        logger.info('Subscription billing successful', {
          correlationId,
          subscription_id: subscription.subscription_id,
        });

        // Remove from failed retries if it was there
        this.failedPaymentRetries.delete(subscription.id);
      } else {
        logger.warn('Subscription billing failed', {
          correlationId,
          subscription_id: subscription.subscription_id,
        });

        // Add to retry queue
        await this.schedulePaymentRetry(
          subscription,
          'Billing failed',
          correlationId
        );
      }
    } catch (error) {
      logger.error('Error processing single subscription', {
        correlationId,
        subscription_id: subscription.subscription_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Add to retry queue
      await this.schedulePaymentRetry(
        subscription,
        error instanceof Error ? error.message : 'Unknown error',
        correlationId
      );
    }
  }

  /**
   * Schedule a payment retry with exponential backoff
   */
  private async schedulePaymentRetry(
    subscription: Subscription,
    errorMessage: string,
    correlationId: string
  ): Promise<void> {
    const existingRetry = this.failedPaymentRetries.get(subscription.id);
    const attemptCount = existingRetry ? existingRetry.attempt_count + 1 : 1;

    if (attemptCount > this.retryConfig.maxRetries) {
      logger.warn('Maximum retry attempts reached, suspending subscription', {
        correlationId,
        subscription_id: subscription.subscription_id,
        attempt_count: attemptCount,
        max_retries: this.retryConfig.maxRetries,
      });

      // Suspend subscription after max retries
      await this.subscriptionService.updateSubscription(subscription.id, {
        status: SubscriptionStatus.SUSPENDED,
        metadata: {
          ...subscription.metadata,
          suspension_reason: 'Maximum payment retry attempts exceeded',
          suspended_at: new Date().toISOString(),
          last_payment_error: errorMessage,
        },
      });

      // Remove from retry queue
      this.failedPaymentRetries.delete(subscription.id);
      return;
    }

    // Calculate next retry delay with exponential backoff
    const delayMs = Math.min(
      this.retryConfig.baseDelayMs *
        Math.pow(this.retryConfig.backoffMultiplier, attemptCount - 1),
      this.retryConfig.maxDelayMs
    );

    const nextRetryDate = new Date(Date.now() + delayMs);

    const retryInfo: FailedPaymentRetry = {
      subscription_id: subscription.subscription_id,
      attempt_count: attemptCount,
      next_retry_date: nextRetryDate,
      last_error: errorMessage,
      created_at: existingRetry?.created_at || new Date(),
    };

    this.failedPaymentRetries.set(subscription.id, retryInfo);

    logger.info('Scheduled payment retry', {
      correlationId,
      subscription_id: subscription.subscription_id,
      attempt_count: attemptCount,
      next_retry_date: nextRetryDate,
      delay_ms: delayMs,
    });

    // Update subscription metadata with retry info
    await this.subscriptionService.updateSubscription(subscription.id, {
      metadata: {
        ...subscription.metadata,
        payment_retry: {
          attempt_count: attemptCount,
          next_retry_date: nextRetryDate.toISOString(),
          last_error: errorMessage,
          scheduled_at: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Process failed payment retries
   */
  private async processFailedPaymentRetries(
    correlationId: string
  ): Promise<void> {
    const now = new Date();
    const retriesToProcess: Array<{
      subscriptionId: string;
      retry: FailedPaymentRetry;
    }> = [];

    // Find retries that are due
    for (const [subscriptionId, retry] of this.failedPaymentRetries.entries()) {
      if (retry.next_retry_date <= now) {
        retriesToProcess.push({ subscriptionId, retry });
      }
    }

    if (retriesToProcess.length === 0) {
      logger.debug('No payment retries due for processing', { correlationId });
      return;
    }

    logger.info('Processing failed payment retries', {
      correlationId,
      retries_count: retriesToProcess.length,
    });

    for (const { subscriptionId, retry } of retriesToProcess) {
      await this.processPaymentRetry(subscriptionId, retry, correlationId);
    }
  }

  /**
   * Process a single payment retry
   */
  private async processPaymentRetry(
    subscriptionId: string,
    retry: FailedPaymentRetry,
    correlationId: string
  ): Promise<void> {
    try {
      logger.info('Processing payment retry', {
        correlationId,
        subscription_id: retry.subscription_id,
        attempt_count: retry.attempt_count,
      });

      const subscription =
        await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        logger.warn('Subscription not found for retry', {
          correlationId,
          subscription_id: retry.subscription_id,
        });
        this.failedPaymentRetries.delete(subscriptionId);
        return;
      }

      // Skip if subscription is no longer active
      if (subscription.status !== SubscriptionStatus.ACTIVE) {
        logger.info('Skipping retry for non-active subscription', {
          correlationId,
          subscription_id: retry.subscription_id,
          status: subscription.status,
        });
        this.failedPaymentRetries.delete(subscriptionId);
        return;
      }

      const success =
        await this.subscriptionService.processBilling(subscription);

      if (success) {
        logger.info('Payment retry successful', {
          correlationId,
          subscription_id: retry.subscription_id,
          attempt_count: retry.attempt_count,
        });

        // Remove from retry queue
        this.failedPaymentRetries.delete(subscriptionId);

        // Clear retry metadata
        await this.subscriptionService.updateSubscription(subscriptionId, {
          metadata: {
            ...subscription.metadata,
            payment_retry: undefined,
            last_successful_retry: {
              attempt_count: retry.attempt_count,
              succeeded_at: new Date().toISOString(),
            },
          },
        });
      } else {
        logger.warn('Payment retry failed', {
          correlationId,
          subscription_id: retry.subscription_id,
          attempt_count: retry.attempt_count,
        });

        // Schedule next retry
        await this.schedulePaymentRetry(
          subscription,
          'Retry payment failed',
          correlationId
        );
      }
    } catch (error) {
      logger.error('Error processing payment retry', {
        correlationId,
        subscription_id: retry.subscription_id,
        attempt_count: retry.attempt_count,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Schedule next retry
      const subscription =
        await this.subscriptionService.getSubscription(subscriptionId);
      if (subscription) {
        await this.schedulePaymentRetry(
          subscription,
          error instanceof Error ? error.message : 'Unknown error',
          correlationId
        );
      }
    }
  }

  /**
   * Get current retry statistics
   */
  getRetryStatistics(): {
    total_retries: number;
    retries_by_attempt: Record<number, number>;
    oldest_retry: Date | null;
    newest_retry: Date | null;
  } {
    const retries = Array.from(this.failedPaymentRetries.values());
    const retriesByAttempt: Record<number, number> = {};

    for (const retry of retries) {
      retriesByAttempt[retry.attempt_count] =
        (retriesByAttempt[retry.attempt_count] || 0) + 1;
    }

    const dates = retries.map(r => r.created_at);

    return {
      total_retries: retries.length,
      retries_by_attempt: retriesByAttempt,
      oldest_retry:
        dates.length > 0
          ? new Date(Math.min(...dates.map(d => d.getTime())))
          : null,
      newest_retry:
        dates.length > 0
          ? new Date(Math.max(...dates.map(d => d.getTime())))
          : null,
    };
  }

  /**
   * Manually trigger billing for a specific subscription
   */
  async triggerBilling(subscriptionId: string): Promise<boolean> {
    const correlationId = randomUUID();

    try {
      const subscription =
        await this.subscriptionService.getSubscription(subscriptionId);
      if (!subscription) {
        logger.warn('Subscription not found for manual billing trigger', {
          correlationId,
          subscription_id: subscriptionId,
        });
        return false;
      }

      logger.info('Manually triggering billing', {
        correlationId,
        subscription_id: subscription.subscription_id,
      });

      await this.processSingleSubscription(subscription, correlationId);
      return true;
    } catch (error) {
      logger.error('Error in manual billing trigger', {
        correlationId,
        subscription_id: subscriptionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }
}
