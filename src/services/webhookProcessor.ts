import { AppDataSource } from '../config/database';
import { WebhookEvent, WebhookEventType } from '../entities/WebhookEvent';
import { Transaction, TransactionStatus } from '../entities/Transaction';
import { Subscription, SubscriptionStatus } from '../entities/Subscription';
import { logger } from '../config/logger';

/**
 * Service for processing different types of webhook events
 */
export class WebhookProcessor {
  private webhookEventRepository = AppDataSource.getRepository(WebhookEvent);
  private transactionRepository = AppDataSource.getRepository(Transaction);
  private subscriptionRepository = AppDataSource.getRepository(Subscription);

  /**
   * Main entry point for processing webhook events
   */
  public async processWebhookEvent(
    webhookEventId: string,
    eventType: string,
    payload: any
  ): Promise<void> {
    logger.info('Processing webhook event', { webhookEventId, eventType });

    const webhookEvent = await this.webhookEventRepository.findOne({
      where: { id: webhookEventId },
    });

    if (!webhookEvent) {
      throw new Error(`Webhook event not found: ${webhookEventId}`);
    }

    switch (webhookEvent.event_type) {
      case WebhookEventType.PAYMENT_COMPLETED:
        await this.processPaymentCompleted(webhookEvent, payload);
        break;

      case WebhookEventType.PAYMENT_FAILED:
        await this.processPaymentFailed(webhookEvent, payload);
        break;

      case WebhookEventType.REFUND_COMPLETED:
        await this.processRefundCompleted(webhookEvent, payload);
        break;

      case WebhookEventType.SUBSCRIPTION_CREATED:
        await this.processSubscriptionCreated(webhookEvent, payload);
        break;

      case WebhookEventType.SUBSCRIPTION_UPDATED:
        await this.processSubscriptionUpdated(webhookEvent, payload);
        break;

      case WebhookEventType.SUBSCRIPTION_CANCELLED:
        await this.processSubscriptionCancelled(webhookEvent, payload);
        break;

      case WebhookEventType.CHARGEBACK_CREATED:
        await this.processChargebackCreated(webhookEvent, payload);
        break;

      default:
        logger.warn('Unknown webhook event type', {
          eventType: webhookEvent.event_type,
          webhookEventId,
        });
    }

    logger.info('Webhook event processed successfully', {
      webhookEventId,
      eventType,
    });
  }

  /**
   * Process payment completed events
   */
  private async processPaymentCompleted(
    webhookEvent: WebhookEvent,
    payload: any
  ): Promise<void> {
    const transactionId = this.extractTransactionId(payload);

    if (!transactionId) {
      logger.warn('No transaction ID found in payment completed webhook', {
        webhookEventId: webhookEvent.id,
      });
      return;
    }

    // Find the transaction by Authorize.Net transaction ID
    const transaction = await this.transactionRepository.findOne({
      where: { authorize_net_transaction_id: transactionId },
    });

    if (transaction) {
      // Update transaction status
      await this.transactionRepository.update(transaction.id, {
        status: TransactionStatus.COMPLETED,
        updated_at: new Date(),
      });

      logger.info('Transaction updated to completed', {
        transactionId: transaction.id,
        authorizeNetTransactionId: transactionId,
      });
    } else {
      logger.warn('Transaction not found for completed payment webhook', {
        authorizeNetTransactionId: transactionId,
        webhookEventId: webhookEvent.id,
      });
    }
  }

  /**
   * Process payment failed events
   */
  private async processPaymentFailed(
    webhookEvent: WebhookEvent,
    payload: any
  ): Promise<void> {
    const transactionId = this.extractTransactionId(payload);

    if (!transactionId) {
      logger.warn('No transaction ID found in payment failed webhook', {
        webhookEventId: webhookEvent.id,
      });
      return;
    }

    const transaction = await this.transactionRepository.findOne({
      where: { authorize_net_transaction_id: transactionId },
    });

    if (transaction) {
      await this.transactionRepository.update(transaction.id, {
        status: TransactionStatus.FAILED,
        updated_at: new Date(),
      });

      logger.info('Transaction updated to failed', {
        transactionId: transaction.id,
        authorizeNetTransactionId: transactionId,
      });
    } else {
      logger.warn('Transaction not found for failed payment webhook', {
        authorizeNetTransactionId: transactionId,
        webhookEventId: webhookEvent.id,
      });
    }
  }

  /**
   * Process refund completed events
   */
  private async processRefundCompleted(
    webhookEvent: WebhookEvent,
    payload: any
  ): Promise<void> {
    const transactionId = this.extractTransactionId(payload);

    if (!transactionId) {
      logger.warn('No transaction ID found in refund completed webhook', {
        webhookEventId: webhookEvent.id,
      });
      return;
    }

    // Find the refund transaction
    const refundTransaction = await this.transactionRepository.findOne({
      where: { authorize_net_transaction_id: transactionId },
    });

    if (refundTransaction) {
      await this.transactionRepository.update(refundTransaction.id, {
        status: TransactionStatus.COMPLETED,
        updated_at: new Date(),
      });

      logger.info('Refund transaction updated to completed', {
        transactionId: refundTransaction.id,
        authorizeNetTransactionId: transactionId,
      });
    } else {
      logger.warn('Refund transaction not found for completed refund webhook', {
        authorizeNetTransactionId: transactionId,
        webhookEventId: webhookEvent.id,
      });
    }
  }

  /**
   * Process subscription created events
   */
  private async processSubscriptionCreated(
    webhookEvent: WebhookEvent,
    payload: any
  ): Promise<void> {
    const subscriptionId = this.extractSubscriptionId(payload);

    if (!subscriptionId) {
      logger.warn('No subscription ID found in subscription created webhook', {
        webhookEventId: webhookEvent.id,
      });
      return;
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { authorize_net_subscription_id: subscriptionId },
    });

    if (subscription) {
      await this.subscriptionRepository.update(subscription.id, {
        status: SubscriptionStatus.ACTIVE,
        updated_at: new Date(),
      });

      logger.info('Subscription updated to active', {
        subscriptionId: subscription.id,
        authorizeNetSubscriptionId: subscriptionId,
      });
    } else {
      logger.warn('Subscription not found for created subscription webhook', {
        authorizeNetSubscriptionId: subscriptionId,
        webhookEventId: webhookEvent.id,
      });
    }
  }

  /**
   * Process subscription updated events
   */
  private async processSubscriptionUpdated(
    webhookEvent: WebhookEvent,
    payload: any
  ): Promise<void> {
    const subscriptionId = this.extractSubscriptionId(payload);

    if (!subscriptionId) {
      logger.warn('No subscription ID found in subscription updated webhook', {
        webhookEventId: webhookEvent.id,
      });
      return;
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { authorize_net_subscription_id: subscriptionId },
    });

    if (subscription) {
      // Extract updated information from payload
      const updates: Partial<Subscription> = {
        updated_at: new Date(),
      };

      // Update amount if provided
      if (payload.payload?.amount) {
        updates.amount = parseFloat(payload.payload.amount);
      }

      await this.subscriptionRepository.update(subscription.id, updates as any);

      logger.info('Subscription updated', {
        subscriptionId: subscription.id,
        authorizeNetSubscriptionId: subscriptionId,
        updates,
      });
    } else {
      logger.warn('Subscription not found for updated subscription webhook', {
        authorizeNetSubscriptionId: subscriptionId,
        webhookEventId: webhookEvent.id,
      });
    }
  }

  /**
   * Process subscription cancelled events
   */
  private async processSubscriptionCancelled(
    webhookEvent: WebhookEvent,
    payload: any
  ): Promise<void> {
    const subscriptionId = this.extractSubscriptionId(payload);

    if (!subscriptionId) {
      logger.warn(
        'No subscription ID found in subscription cancelled webhook',
        { webhookEventId: webhookEvent.id }
      );
      return;
    }

    const subscription = await this.subscriptionRepository.findOne({
      where: { authorize_net_subscription_id: subscriptionId },
    });

    if (subscription) {
      await this.subscriptionRepository.update(subscription.id, {
        status: SubscriptionStatus.CANCELLED,
        cancelled_at: new Date(),
        updated_at: new Date(),
      });

      logger.info('Subscription updated to cancelled', {
        subscriptionId: subscription.id,
        authorizeNetSubscriptionId: subscriptionId,
      });
    } else {
      logger.warn('Subscription not found for cancelled subscription webhook', {
        authorizeNetSubscriptionId: subscriptionId,
        webhookEventId: webhookEvent.id,
      });
    }
  }

  /**
   * Process chargeback created events
   */
  private async processChargebackCreated(
    webhookEvent: WebhookEvent,
    payload: any
  ): Promise<void> {
    const transactionId = this.extractTransactionId(payload);

    if (!transactionId) {
      logger.warn('No transaction ID found in chargeback created webhook', {
        webhookEventId: webhookEvent.id,
      });
      return;
    }

    const transaction = await this.transactionRepository.findOne({
      where: { authorize_net_transaction_id: transactionId },
    });

    if (transaction) {
      // Create a chargeback record (you might want to create a separate Chargeback entity)
      // For now, we'll just log it and potentially update the transaction
      logger.warn('Chargeback created for transaction', {
        transactionId: transaction.id,
        authorizeNetTransactionId: transactionId,
        chargebackAmount: payload.payload?.amount,
      });

      // You might want to update transaction status or create a separate chargeback record
      // await this.transactionRepository.update(transaction.id, {
      //   status: TransactionStatus.CHARGEBACK,
      //   updated_at: new Date(),
      // });
    } else {
      logger.warn('Transaction not found for chargeback webhook', {
        authorizeNetTransactionId: transactionId,
        webhookEventId: webhookEvent.id,
      });
    }
  }

  /**
   * Extract transaction ID from webhook payload
   */
  private extractTransactionId(payload: any): string | null {
    if (payload.payload?.transId) {
      return payload.payload.transId.toString();
    }

    if (payload.payload?.id && payload.eventType?.includes('payment')) {
      return payload.payload.id.toString();
    }

    return null;
  }

  /**
   * Extract subscription ID from webhook payload
   */
  private extractSubscriptionId(payload: any): string | null {
    if (payload.payload?.subscriptionId) {
      return payload.payload.subscriptionId.toString();
    }

    if (payload.payload?.id && payload.eventType?.includes('subscription')) {
      return payload.payload.id.toString();
    }

    return null;
  }
}

// Export singleton instance
export const webhookProcessor = new WebhookProcessor();
