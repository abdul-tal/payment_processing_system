import Bull from 'bull';
import { logger } from '../config/logger';
import { AppDataSource } from '../config/database';
import { WebhookEvent, WebhookStatus } from '../entities/WebhookEvent';
import { webhookProcessor } from './webhookProcessor';

// Create webhook processing queue
export const webhookQueue = new Bull('webhook-processing', {
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    ...(process.env['REDIS_PASSWORD'] && {
      password: process.env['REDIS_PASSWORD'],
    }),
  },
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

// Create dead letter queue for failed events
export const deadLetterQueue = new Bull('webhook-dead-letter', {
  redis: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: parseInt(process.env['REDIS_PORT'] || '6379'),
    ...(process.env['REDIS_PASSWORD'] && {
      password: process.env['REDIS_PASSWORD'],
    }),
  },
  defaultJobOptions: {
    removeOnComplete: 1000,
    removeOnFail: 1000,
  },
});

// Job data interfaces
export interface WebhookJobData {
  webhookEventId: string;
  eventType: string;
  payload: any;
}

export interface DeadLetterJobData extends WebhookJobData {
  originalError: string;
  failedAt: Date;
  totalAttempts: number;
}

// Process webhook events
webhookQueue.process('process-webhook', async job => {
  const { webhookEventId, eventType, payload } = job.data as WebhookJobData;

  logger.info('Processing webhook event', {
    jobId: job.id,
    webhookEventId,
    eventType,
  });

  const webhookEventRepository = AppDataSource.getRepository(WebhookEvent);

  try {
    // Update status to processing
    await webhookEventRepository.update(webhookEventId, {
      status: WebhookStatus.PROCESSING,
    });

    // Process the webhook event
    await webhookProcessor.processWebhookEvent(
      webhookEventId,
      eventType,
      payload
    );

    // Update status to processed
    await webhookEventRepository.update(webhookEventId, {
      status: WebhookStatus.PROCESSED,
      processed_at: new Date(),
    });

    logger.info('Webhook event processed successfully', {
      jobId: job.id,
      webhookEventId,
      eventType,
    });
    logger.info('Webhook queue initialized');
  } catch (error) {
    logger.error('Failed to initialize webhook queue:', error);
    logger.error('Error processing webhook event', {
      jobId: job.id,
      webhookEventId,
      eventType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    // Update retry count and status
    const webhookEvent = await webhookEventRepository.findOne({
      where: { id: webhookEventId },
    });

    if (webhookEvent) {
      const newRetryCount = webhookEvent.retry_count + 1;
      const isMaxRetriesReached = newRetryCount >= webhookEvent.max_retries;

      await webhookEventRepository.update(webhookEventId, {
        status: isMaxRetriesReached
          ? WebhookStatus.FAILED
          : WebhookStatus.RETRYING,
        retry_count: newRetryCount,
        error_message: error instanceof Error ? error.message : 'Unknown error',
        ...(isMaxRetriesReached
          ? {}
          : { next_retry_at: new Date(Date.now() + newRetryCount * 60000) }), // Exponential backoff
      });

      // Move to dead letter queue if max retries reached
      if (isMaxRetriesReached) {
        await deadLetterQueue.add('dead-letter-event', {
          webhookEventId,
          eventType,
          payload,
          originalError:
            error instanceof Error ? error.message : 'Unknown error',
          failedAt: new Date(),
          totalAttempts: newRetryCount,
        } as DeadLetterJobData);

        logger.warn('Webhook event moved to dead letter queue', {
          webhookEventId,
          eventType,
          totalAttempts: newRetryCount,
        });
      }
    }

    throw error; // Re-throw to trigger Bull's retry mechanism
  }
});

// Process dead letter queue events (for manual inspection/reprocessing)
deadLetterQueue.process('dead-letter-event', async job => {
  const { webhookEventId, eventType, originalError, failedAt, totalAttempts } =
    job.data as DeadLetterJobData;

  logger.info('Processing dead letter event', {
    jobId: job.id,
    webhookEventId,
    eventType,
    originalError,
    failedAt,
    totalAttempts,
  });

  // This is mainly for logging and monitoring
  // Dead letter events can be manually reprocessed or investigated
  return { processed: true, timestamp: new Date() };
});

// Queue event handlers
webhookQueue.on('completed', job => {
  logger.debug('Webhook job completed', {
    jobId: job.id,
    webhookEventId: job.data.webhookEventId,
  });
});

webhookQueue.on('failed', (job, error) => {
  logger.error('Webhook job failed', {
    jobId: job.id,
    webhookEventId: job.data?.webhookEventId,
    error: error.message,
    attempts: job.attemptsMade,
  });
});

webhookQueue.on('stalled', job => {
  logger.warn('Webhook job stalled', {
    jobId: job.id,
    webhookEventId: job.data?.webhookEventId,
  });
});

deadLetterQueue.on('completed', job => {
  logger.debug('Dead letter job processed', {
    jobId: job.id,
    webhookEventId: job.data.webhookEventId,
  });
});

// Graceful shutdown
export const closeQueues = async (): Promise<void> => {
  logger.info('Closing webhook queues...');
  await webhookQueue.close();
  await deadLetterQueue.close();
  logger.info('Webhook queues closed');
};

// Queue health check
export const getQueueHealth = async () => {
  try {
    const [webhookWaiting, webhookActive, webhookCompleted, webhookFailed] =
      await Promise.all([
        webhookQueue.getWaiting(),
        webhookQueue.getActive(),
        webhookQueue.getCompleted(),
        webhookQueue.getFailed(),
      ]);

    const [deadLetterWaiting, deadLetterActive, deadLetterCompleted] =
      await Promise.all([
        deadLetterQueue.getWaiting(),
        deadLetterQueue.getActive(),
        deadLetterQueue.getCompleted(),
      ]);

    return {
      webhookQueue: {
        waiting: webhookWaiting.length,
        active: webhookActive.length,
        completed: webhookCompleted.length,
        failed: webhookFailed.length,
      },
      deadLetterQueue: {
        waiting: deadLetterWaiting.length,
        active: deadLetterActive.length,
        completed: deadLetterCompleted.length,
      },
    };
  } catch (error) {
    logger.error('Error getting queue health:', error);
    throw error;
  }
};

// Webhook queue worker is already initialized above with webhookQueue.process()
logger.info('Webhook queue worker initialized');
