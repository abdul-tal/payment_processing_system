import { Router } from 'express';
import { WebhookController } from '../controllers/webhookController';
import {
  verifyWebhookSignature,
  captureRawBody,
} from '../middleware/webhookSignature';
import { getQueueHealth } from '../services/webhookQueue';
import { logger } from '../config/logger';

const router = Router();
const webhookController = new WebhookController();

/**
 * POST /api/v1/webhooks/authorize-net
 * Receive and process Authorize.Net webhooks
 */
router.post(
  '/authorize-net',
  captureRawBody,
  verifyWebhookSignature,
  webhookController.handleAuthorizeNetWebhook
);

/**
 * GET /api/v1/webhooks/events/:eventId
 * Get webhook event status
 */
router.get('/events/:eventId', webhookController.getWebhookEventStatus);

/**
 * GET /api/v1/webhooks/events
 * List webhook events with filtering
 */
router.get('/events', webhookController.listWebhookEvents);

/**
 * GET /api/v1/webhooks/health
 * Get webhook system health status
 */
router.get('/health', async (_req, res) => {
  try {
    const queueHealth = await getQueueHealth();

    res.status(200).json({
      status: 'healthy',
      queues: queueHealth,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('Webhook health check failed:', error);
    res.status(500).json({
      status: 'unhealthy',
      error: 'Queue health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
