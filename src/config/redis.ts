import Redis from 'ioredis';
import { config } from 'dotenv';
import { logger } from './logger';

config();

// Redis connection configuration
const redisConfig = {
  host: process.env['REDIS_HOST'] || 'localhost',
  port: parseInt(process.env['REDIS_PORT'] || '6379'),
  ...(process.env['REDIS_PASSWORD'] && {
    password: process.env['REDIS_PASSWORD'],
  }),
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
  retryDelayOnClusterDown: 300,
};

// Main Redis connection for general operations
export const redis = new Redis(redisConfig);

// Separate Redis connection for Bull queues
export const queueRedis = new Redis(redisConfig);

// Redis connection event handlers
redis.on('connect', () => {
  logger.info('Redis connected successfully');
});

redis.on('ready', () => {
  logger.info('Redis is ready to accept commands');
});

redis.on('error', error => {
  logger.error('Redis connection error:', error);
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

redis.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

queueRedis.on('connect', () => {
  logger.info('Queue Redis connected successfully');
});

queueRedis.on('error', error => {
  logger.error('Queue Redis connection error:', error);
});

// Initialize Redis connections
export const initializeRedis = async (): Promise<void> => {
  try {
    await redis.connect();
    await queueRedis.connect();
    logger.info('Redis connections initialized successfully');
  } catch (error) {
    logger.error('Error during Redis initialization:', error);
    throw error;
  }
};

// Close Redis connections
export const closeRedis = async (): Promise<void> => {
  try {
    await redis.quit();
    await queueRedis.quit();
    logger.info('Redis connections closed successfully');
  } catch (error) {
    logger.error('Error during Redis closure:', error);
    throw error;
  }
};

// Health check for Redis
export const checkRedisHealth = async (): Promise<boolean> => {
  try {
    const result = await redis.ping();
    return result === 'PONG';
  } catch (error) {
    logger.error('Redis health check failed:', error);
    return false;
  }
};
