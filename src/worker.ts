import 'reflect-metadata';
import { config } from 'dotenv';
import { DataSource } from 'typeorm';
import { initializeRedis } from './config/redis';
import { logger } from './config/logger';
import {
  webhookQueue,
  deadLetterQueue,
  closeQueues,
} from './services/webhookQueue';

// Load environment variables
config();

// Check if we're running compiled JS files
const isCompiled = __filename.endsWith('.js');

// Create DataSource for worker
const WorkerDataSource = new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  username: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || '',
  database: process.env['DB_NAME'] || 'payment_backend',
  ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: process.env['NODE_ENV'] === 'development',
  entities: isCompiled ? ['dist/entities/**/*.js'] : ['src/entities/**/*.ts'],
  migrations: isCompiled ? ['dist/migrations/**/*.js'] : ['migrations/**/*.ts'],
  subscribers: isCompiled
    ? ['dist/subscribers/**/*.js']
    : ['src/subscribers/**/*.ts'],
});

/**
 * Background worker for processing webhook events
 */
export class WebhookWorker {
  private isShuttingDown = false;

  async start(): Promise<void> {
    try {
      logger.info('Starting webhook worker...');

      // Initialize database connection
      await WorkerDataSource.initialize();
      logger.info('Database initialized for worker');

      // Initialize Redis connection
      await initializeRedis();
      logger.info('Redis initialized for worker');

      // Setup graceful shutdown handlers
      this.setupGracefulShutdown();

      logger.info('Webhook worker started successfully');
      logger.info('Worker is now processing webhook events...');

      // Keep the process alive
      this.keepAlive();
    } catch (error) {
      logger.error('Failed to start webhook worker:', error);
      process.exit(1);
    }
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) {
        logger.warn('Force shutdown initiated');
        process.exit(1);
      }

      this.isShuttingDown = true;
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      try {
        // Stop accepting new jobs
        await webhookQueue.pause();
        await deadLetterQueue.pause();
        logger.info('Queues paused, no new jobs will be processed');

        // Wait for active jobs to complete (with timeout)
        const activeJobs = await webhookQueue.getActive();
        if (activeJobs.length > 0) {
          logger.info(
            `Waiting for ${activeJobs.length} active jobs to complete...`
          );

          // Wait up to 30 seconds for jobs to complete
          const timeout = setTimeout(() => {
            logger.warn('Timeout reached, forcing shutdown');
            process.exit(1);
          }, 30000);

          // Check every second if jobs are done
          const checkInterval = setInterval(async () => {
            const stillActive = await webhookQueue.getActive();
            if (stillActive.length === 0) {
              clearInterval(checkInterval);
              clearTimeout(timeout);
              await this.finalizeShutdown();
            }
          }, 1000);
        } else {
          await this.finalizeShutdown();
        }
      } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGUSR2', () => shutdown('SIGUSR2')); // For nodemon
  }

  private async finalizeShutdown(): Promise<void> {
    try {
      // Close queues
      await closeQueues();
      logger.info('Queues closed');

      // Close database connection
      const { closeDatabase } = await import('./config/database');
      await closeDatabase();
      logger.info('Database connection closed');

      // Close Redis connections
      const { closeRedis } = await import('./config/redis');
      await closeRedis();
      logger.info('Redis connections closed');

      logger.info('Webhook worker shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during final shutdown:', error);
      process.exit(1);
    }
  }

  private keepAlive(): void {
    // Log worker status periodically
    setInterval(async () => {
      try {
        const { getQueueHealth } = await import('./services/webhookQueue');
        const health = await getQueueHealth();

        logger.info('Worker status', {
          webhookQueue: health.webhookQueue,
          deadLetterQueue: health.deadLetterQueue,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        logger.error('Error getting worker status:', error);
      }
    }, 60000); // Log every minute

    // Keep process alive
    process.stdin.resume();
  }
}

// Handle uncaught exceptions and rejections
process.on('uncaughtException', error => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the worker
const worker = new WebhookWorker();
worker.start().catch(error => {
  logger.error('Failed to start worker:', error);
  process.exit(1);
});
