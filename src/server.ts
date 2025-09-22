import './config/tracing'; // Initialize tracing first
import { createApp } from './app';
import { AppDataSource } from './config/database';
import { logger } from './config/logger';
import { metricsService } from './services/MetricsService';
import { alertService } from './services/AlertService';
// import { redisClient } from './config/redis';

const PORT = process.env['PORT'] || 3000;

async function startServer(): Promise<void> {
  try {
    // Initialize database connection
    logger.info('Initializing database connection...');
    await AppDataSource.initialize();
    logger.info('Database connection established');

    // Initialize Redis connection
    // logger.info('Initializing Redis connection...');
    // await redisClient.connect();
    // logger.info('Redis connection established');

    // Initialize metrics service
    logger.info('Initializing metrics service...');
    metricsService.initialize();
    logger.info('Metrics service initialized');

    // Initialize alert service
    logger.info('Initializing alert service...');
    alertService.initialize();
    logger.info('Alert service initialized');

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Server started successfully`, {
        port: PORT,
        environment: process.env['NODE_ENV'] || 'development',
        timestamp: new Date().toISOString(),
      });

      // Record server start metric
      metricsService.recordMetric('server_start', 1, 'count', {
        port: PORT.toString(),
        environment: process.env['NODE_ENV'] || 'development',
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      // Stop accepting new connections
      server.close(async () => {
        try {
          // Shutdown services in reverse order
          logger.info('Shutting down alert service...');
          alertService.shutdown();

          logger.info('Shutting down metrics service...');
          metricsService.shutdown();

          // logger.info('Closing Redis connection...');
          // await redisClient.quit();

          logger.info('Closing database connection...');
          await AppDataSource.destroy();

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown:', error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle uncaught exceptions and unhandled rejections
    process.on('uncaughtException', (error: Error) => {
      logger.error('Uncaught Exception:', error);
      alertService.createAlert(
        'CRITICAL' as any,
        'CRITICAL' as any,
        'Uncaught Exception occurred',
        { error: error.message, stack: error.stack }
      );
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
      alertService.createAlert(
        'HIGH' as any,
        'HIGH' as any,
        'Unhandled Promise Rejection occurred',
        { reason: String(reason) }
      );
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
