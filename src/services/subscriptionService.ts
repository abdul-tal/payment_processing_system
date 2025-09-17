import { Repository } from 'typeorm';
import { AppDataSource } from '../config/database';
import {
  Subscription,
  SubscriptionStatus,
  BillingInterval,
} from '../entities/Subscription';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';
import { paymentService, SubscriptionRequest } from './paymentService';

export interface CreateSubscriptionRequest {
  customer_email: string;
  customer_name?: string;
  plan_name: string;
  amount: number;
  currency?: string;
  billing_interval: BillingInterval;
  start_date?: Date;
  total_billing_cycles?: number;
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
  billing_address?: {
    first_name?: string;
    last_name?: string;
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    country?: string;
  };
  metadata?: Record<string, unknown>;
}

export interface UpdateSubscriptionRequest {
  plan_name?: string;
  amount?: number;
  billing_interval?: BillingInterval;
  status?: SubscriptionStatus;
  metadata?: Record<string, unknown>;
}

export class SubscriptionService {
  private subscriptionRepository: Repository<Subscription>;

  constructor() {
    this.subscriptionRepository = AppDataSource.getRepository(Subscription);
  }

  async createSubscription(
    request: CreateSubscriptionRequest
  ): Promise<Subscription> {
    const correlationId = randomUUID();

    logger.info('Creating new subscription', {
      correlationId,
      customer_email: request.customer_email,
      plan_name: request.plan_name,
      amount: request.amount,
      billing_interval: request.billing_interval,
    });

    try {
      // Generate unique subscription ID
      const subscriptionId = `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Calculate start date and next billing date
      const startDate = request.start_date || new Date();
      const nextBillingDate = this.calculateNextBillingDate(
        startDate,
        request.billing_interval
      );

      // Create subscription entity
      const subscription = new Subscription();
      subscription.subscription_id = subscriptionId;
      subscription.customer_email = request.customer_email;
      subscription.customer_name = request.customer_name || '';
      subscription.plan_name = request.plan_name;
      subscription.amount = request.amount;
      subscription.currency = request.currency || 'USD';
      subscription.billing_interval = request.billing_interval;
      subscription.start_date = startDate;
      subscription.next_billing_date = nextBillingDate;
      subscription.total_billing_cycles = request.total_billing_cycles || null;
      subscription.status = SubscriptionStatus.ACTIVE;
      subscription.metadata = request.metadata || {};

      // Create Authorize.Net subscription
      const subscriptionRequest: SubscriptionRequest = {
        name: `${request.plan_name} - ${request.customer_email}`,
        length:
          request.billing_interval === 'monthly'
            ? 1
            : request.billing_interval === 'yearly'
              ? 12
              : 1,
        unit: request.billing_interval === 'yearly' ? 'months' : 'months',
        startDate: startDate,
        totalOccurrences: request.total_billing_cycles || undefined,
        amount: request.amount,
        paymentMethod: {
          cardNumber: request.card_number,
          expirationDate: `${request.expiry_month}${request.expiry_year.slice(-2)}`,
          cardCode: request.cvv,
          cardholderName: request.customer_name,
        },
        customerEmail: request.customer_email,
        customerName: request.customer_name,
        description: `Subscription for ${request.plan_name}`,
        merchantSubscriptionId: subscriptionId,
      };

      const authNetResult = await paymentService.createSubscription(
        subscriptionRequest,
        correlationId
      );

      if (!authNetResult.success) {
        logger.error('Failed to create Authorize.Net subscription', {
          correlationId,
          error: authNetResult.message,
          customer_email: request.customer_email,
        });
        throw new Error(`Payment processing failed: ${authNetResult.message}`);
      }

      const paymentResult = {
        transaction_id: authNetResult.subscriptionId,
        card_last_four: request.card_number.slice(-4),
        card_type: 'Visa', // This would be determined from card number
      };

      // Store card information (last 4 digits only)
      if (paymentResult.card_last_four) {
        subscription.card_last_four = paymentResult.card_last_four;
      }
      if (paymentResult.card_type) {
        subscription.card_type = paymentResult.card_type;
      }

      // Store Authorize.Net subscription ID
      subscription.authorize_net_subscription_id = authNetResult.subscriptionId;

      // Save subscription
      const savedSubscription =
        await this.subscriptionRepository.save(subscription);

      // Update billing cycles completed
      savedSubscription.billing_cycles_completed = 1;
      savedSubscription.last_billing_date = new Date();
      await this.subscriptionRepository.save(savedSubscription);

      logger.info('Subscription created successfully', {
        correlationId,
        subscription_id: subscriptionId,
        transaction_id: paymentResult.transaction_id,
      });

      return savedSubscription;
    } catch (error) {
      logger.error('Failed to create subscription', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        customer_email: request.customer_email,
      });
      throw error;
    }
  }

  async getSubscription(id: string): Promise<Subscription | null> {
    try {
      const subscription = await this.subscriptionRepository.findOne({
        where: { id },
      });

      if (!subscription) {
        logger.warn('Subscription not found', { subscription_id: id });
        return null;
      }

      return subscription;
    } catch (error) {
      logger.error('Failed to get subscription', {
        subscription_id: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async updateSubscription(
    id: string,
    request: UpdateSubscriptionRequest
  ): Promise<Subscription | null> {
    const correlationId = randomUUID();

    logger.info('Updating subscription', {
      correlationId,
      subscription_id: id,
      updates: request,
    });

    try {
      const subscription = await this.subscriptionRepository.findOne({
        where: { id },
      });

      if (!subscription) {
        logger.warn('Subscription not found for update', {
          subscription_id: id,
        });
        return null;
      }

      // Update fields
      if (request.plan_name !== undefined) {
        subscription.plan_name = request.plan_name;
      }
      if (request.amount !== undefined) {
        subscription.amount = request.amount;
      }
      if (request.billing_interval !== undefined) {
        subscription.billing_interval = request.billing_interval;
        // Recalculate next billing date if interval changed
        subscription.next_billing_date = this.calculateNextBillingDate(
          subscription.last_billing_date || subscription.start_date,
          request.billing_interval
        );
      }
      if (request.status !== undefined) {
        subscription.status = request.status;

        // Handle status changes
        if (request.status === SubscriptionStatus.CANCELLED) {
          subscription.cancelled_at = new Date();
          subscription.end_date = new Date();
        }
      }
      if (request.metadata !== undefined) {
        subscription.metadata = {
          ...subscription.metadata,
          ...request.metadata,
        };
      }

      const updatedSubscription =
        await this.subscriptionRepository.save(subscription);

      logger.info('Subscription updated successfully', {
        correlationId,
        subscription_id: id,
      });

      return updatedSubscription;
    } catch (error) {
      logger.error('Failed to update subscription', {
        correlationId,
        subscription_id: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async cancelSubscription(
    id: string,
    reason?: string
  ): Promise<Subscription | null> {
    const correlationId = randomUUID();

    logger.info('Cancelling subscription', {
      correlationId,
      subscription_id: id,
      reason,
    });

    try {
      const subscription = await this.subscriptionRepository.findOne({
        where: { id },
      });

      if (!subscription) {
        logger.warn('Subscription not found for cancellation', {
          subscription_id: id,
        });
        return null;
      }

      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.cancelled_at = new Date();
      subscription.end_date = new Date();
      subscription.cancellation_reason =
        reason || 'User requested cancellation';

      const cancelledSubscription =
        await this.subscriptionRepository.save(subscription);

      logger.info('Subscription cancelled successfully', {
        correlationId,
        subscription_id: id,
      });

      return cancelledSubscription;
    } catch (error) {
      logger.error('Failed to cancel subscription', {
        correlationId,
        subscription_id: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getSubscriptionsByCustomer(
    customerEmail: string
  ): Promise<Subscription[]> {
    try {
      return await this.subscriptionRepository.find({
        where: { customer_email: customerEmail },
        order: { created_at: 'DESC' },
      });
    } catch (error) {
      logger.error('Failed to get subscriptions by customer', {
        customer_email: customerEmail,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async getSubscriptionsDueForBilling(): Promise<Subscription[]> {
    try {
      const now = new Date();
      return await this.subscriptionRepository
        .createQueryBuilder('subscription')
        .where('subscription.status = :status', {
          status: SubscriptionStatus.ACTIVE,
        })
        .andWhere('subscription.next_billing_date <= :now', { now })
        .getMany();
    } catch (error) {
      logger.error('Failed to get subscriptions due for billing', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async processBilling(subscription: Subscription): Promise<boolean> {
    const correlationId = randomUUID();

    logger.info('Processing billing for subscription', {
      correlationId,
      subscription_id: subscription.subscription_id,
      amount: subscription.amount,
      billing_cycle: subscription.billing_cycles_completed + 1,
    });

    try {
      // Check if subscription has reached max billing cycles
      if (
        subscription.total_billing_cycles &&
        subscription.billing_cycles_completed >=
          subscription.total_billing_cycles
      ) {
        logger.info('Subscription has reached maximum billing cycles', {
          correlationId,
          subscription_id: subscription.subscription_id,
          cycles_completed: subscription.billing_cycles_completed,
          total_cycles: subscription.total_billing_cycles,
        });

        await this.updateSubscription(subscription.id, {
          status: SubscriptionStatus.EXPIRED,
        });
        return false;
      }

      // For now, simulate successful payment processing
      // In a real implementation, this would use stored payment methods
      const paymentResult = {
        transaction_id: `txn_${Date.now()}`,
        success: true,
      };

      if (!paymentResult.success) {
        throw new Error('Payment processing failed');
      }

      // Update subscription after successful payment
      subscription.billing_cycles_completed += 1;
      subscription.last_billing_date = new Date();
      subscription.next_billing_date = this.calculateNextBillingDate(
        new Date(),
        subscription.billing_interval
      );

      await this.subscriptionRepository.save(subscription);

      logger.info('Billing processed successfully', {
        correlationId,
        subscription_id: subscription.subscription_id,
        transaction_id: paymentResult.transaction_id,
        billing_cycle: subscription.billing_cycles_completed,
      });

      return true;
    } catch (error) {
      logger.error('Failed to process billing', {
        correlationId,
        subscription_id: subscription.subscription_id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Handle failed payment - this will be enhanced with retry logic
      await this.handleFailedPayment(subscription, error as Error);
      return false;
    }
  }

  private async handleFailedPayment(
    subscription: Subscription,
    error: Error
  ): Promise<void> {
    logger.warn('Handling failed payment', {
      subscription_id: subscription.subscription_id,
      error: error.message,
    });

    // For now, just log the failure
    // This will be enhanced with retry logic in the next step
    subscription.metadata = {
      ...subscription.metadata,
      last_payment_failure: {
        date: new Date().toISOString(),
        error: error.message,
        retry_count: ((subscription.metadata?.retry_count as number) || 0) + 1,
      },
    };

    await this.subscriptionRepository.save(subscription);
  }

  private calculateNextBillingDate(
    fromDate: Date,
    interval: BillingInterval
  ): Date {
    const nextDate = new Date(fromDate);

    switch (interval) {
      case BillingInterval.MONTHLY:
        nextDate.setMonth(nextDate.getMonth() + 1);
        break;
      case BillingInterval.QUARTERLY:
        nextDate.setMonth(nextDate.getMonth() + 3);
        break;
      case BillingInterval.YEARLY:
        nextDate.setFullYear(nextDate.getFullYear() + 1);
        break;
    }

    return nextDate;
  }
}
