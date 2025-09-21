import 'reflect-metadata';
import dotenv from 'dotenv';
import { createApp } from './app';
import { initializeDatabase } from './config/database';
import { initializeRedis } from './config/redis';
import { logger } from './config/logger';

// Load environment variables
dotenv.config();

const PORT = process.env['PORT'] || 3000;

// Initialize database and start server
async function startServer(): Promise<void> {
  try {
    logger.info('Starting payment backend server...');

    // Initialize database connection
    logger.info('Initializing database connection...');
    await initializeDatabase();
    logger.info('Database connected successfully');

    // Initialize Redis connection
    logger.info('Initializing Redis connection...');
    await initializeRedis();
    logger.info('Redis connected successfully');

    // Create Express app with all middleware and routes
    const app = createApp();

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`Payment backend server running on port ${PORT}`, {
        port: PORT,
        environment: process.env['NODE_ENV'] || 'development',
        nodeVersion: process.version,
      });
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal: string) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);

      server.close(async err => {
        if (err) {
          logger.error('Error during server shutdown', { error: err.message });
          process.exit(1);
        }

        try {
          // Close Redis connections
          const { closeRedis } = await import('./config/redis');
          await closeRedis();
          logger.info('Redis connections closed');

          // Close database connection
          if (require('./config/database').AppDataSource.isInitialized) {
            await require('./config/database').AppDataSource.destroy();
            logger.info('Database connection closed');
          }

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during graceful shutdown', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          process.exit(1);
        }
      });
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

startServer();

export { createApp };
