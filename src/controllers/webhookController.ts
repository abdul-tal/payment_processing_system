import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../config/database';
import {
  WebhookEvent,
  WebhookEventType,
  WebhookStatus,
} from '../entities/WebhookEvent';
import { logger } from '../config/logger';
import { webhookQueue } from '../services/webhookQueue';

export interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Controller for handling Authorize.Net webhooks
 */
export class WebhookController {
  private webhookEventRepository = AppDataSource.getRepository(WebhookEvent);

  /**
   * Handle incoming Authorize.Net webhook events
   */
  public handleAuthorizeNetWebhook = async (
    req: WebhookRequest,
    res: Response
  ): Promise<void> => {
    try {
      // Parse the raw body to JSON since we're using express.raw()
      let payload;
      try {
        payload = JSON.parse(req.body.toString());
      } catch (parseError) {
        logger.warn('Failed to parse webhook payload as JSON', {
          error: parseError,
        });
        res.status(400).json({ error: 'Invalid JSON payload' });
        return;
      }

      if (!payload || !payload.eventType) {
        logger.warn('Webhook received without eventType', { payload });
        res.status(400).json({ error: 'Invalid webhook payload' });
        return;
      }

      // Extract event information
      const eventType = this.mapAuthorizeNetEventType(payload.eventType);
      const eventId = payload.id || randomUUID();
      const externalId =
        payload.payload?.id || payload.payload?.transId || null;

      // Check for duplicate events
      const existingEvent = await this.webhookEventRepository.findOne({
        where: { event_id: eventId },
      });

      if (existingEvent) {
        logger.info('Duplicate webhook event received', { eventId, eventType });
        res.status(200).json({ message: 'Event already processed', eventId });
        return;
      }

      // Create webhook event record
      const webhookEvent = new WebhookEvent();
      webhookEvent.event_id = eventId;
      webhookEvent.external_id = externalId;
      webhookEvent.event_type = eventType;
      webhookEvent.status = WebhookStatus.PENDING;
      webhookEvent.payload = payload;
      webhookEvent.source = 'authorize_net';
      webhookEvent.related_transaction_id =
        this.extractTransactionId(payload) || null;
      webhookEvent.related_subscription_id =
        this.extractSubscriptionId(payload) || null;
      webhookEvent.retry_count = 0;
      webhookEvent.max_retries = 3;

      // Save to database
      await this.webhookEventRepository.save(webhookEvent);

      // Add to processing queue
      await webhookQueue.add(
        'process-webhook',
        {
          webhookEventId: webhookEvent.id,
          eventType: eventType,
          payload: payload,
        },
        {
          delay: 0,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: 100,
          removeOnFail: 50,
        }
      );

      logger.info('Webhook event queued for processing', {
        eventId: webhookEvent.id,
        eventType,
        externalId,
      });

      res.status(200).json({
        message: 'Webhook received and queued for processing',
        eventId: webhookEvent.id,
      });
    } catch (error) {
      logger.error('Error processing webhook:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * Map Authorize.Net event types to our internal event types
   */
  private mapAuthorizeNetEventType(
    authorizeNetEventType: string
  ): WebhookEventType {
    const eventTypeMap: Record<string, WebhookEventType> = {
      'net.authorize.payment.authcapture.created':
        WebhookEventType.PAYMENT_COMPLETED,
      'net.authorize.payment.authorization.created':
        WebhookEventType.PAYMENT_COMPLETED,
      'net.authorize.payment.capture.created':
        WebhookEventType.PAYMENT_COMPLETED,
      'net.authorize.payment.void.created': WebhookEventType.PAYMENT_FAILED,
      'net.authorize.payment.refund.created': WebhookEventType.REFUND_COMPLETED,
      'net.authorize.customer.subscription.created':
        WebhookEventType.SUBSCRIPTION_CREATED,
      'net.authorize.customer.subscription.updated':
        WebhookEventType.SUBSCRIPTION_UPDATED,
      'net.authorize.customer.subscription.cancelled':
        WebhookEventType.SUBSCRIPTION_CANCELLED,
      'net.authorize.customer.subscription.suspended':
        WebhookEventType.SUBSCRIPTION_CANCELLED,
      'net.authorize.customer.subscription.terminated':
        WebhookEventType.SUBSCRIPTION_CANCELLED,
    };

    return (
      eventTypeMap[authorizeNetEventType] || WebhookEventType.PAYMENT_COMPLETED
    );
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

  /**
   * Get webhook event status
   */
  public getWebhookEventStatus = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { eventId } = req.params;

      if (!eventId) {
        res.status(400).json({ error: 'Event ID is required' });
        return;
      }

      const webhookEvent = await this.webhookEventRepository.findOne({
        where: { event_id: eventId },
      });

      if (!webhookEvent) {
        res.status(404).json({ error: 'Webhook event not found' });
        return;
      }

      res.status(200).json({
        eventId: webhookEvent.id,
        eventType: webhookEvent.event_type,
        status: webhookEvent.status,
        retryCount: webhookEvent.retry_count,
        createdAt: webhookEvent.created_at,
        processedAt: webhookEvent.processed_at,
        errorMessage: webhookEvent.error_message,
      });
    } catch (error) {
      logger.error('Error retrieving webhook event status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };

  /**
   * List webhook events with filtering
   */
  public listWebhookEvents = async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { status, eventType, limit = 50, offset = 0 } = req.query;

      const queryBuilder =
        this.webhookEventRepository.createQueryBuilder('webhook_event');

      if (status) {
        queryBuilder.andWhere('webhook_event.status = :status', { status });
      }

      if (eventType) {
        queryBuilder.andWhere('webhook_event.event_type = :eventType', {
          eventType,
        });
      }

      const [events, total] = await queryBuilder
        .orderBy('webhook_event.created_at', 'DESC')
        .limit(Number(limit))
        .offset(Number(offset))
        .getManyAndCount();

      res.status(200).json({
        events: events.map((event: WebhookEvent) => ({
          id: event.id,
          eventId: event.event_id,
          eventType: event.event_type,
          status: event.status,
          retryCount: event.retry_count,
          createdAt: event.created_at,
          processedAt: event.processed_at,
        })),
        total,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error) {
      logger.error('Error listing webhook events:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}
