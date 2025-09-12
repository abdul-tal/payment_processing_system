import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

// In-memory store for idempotency keys and their responses
interface IdempotencyEntry {
  response: any;
  status: number;
  timestamp: number;
}

const idempotencyStore = new Map<string, IdempotencyEntry>();

// Cache cleanup interval (5 minutes)
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000;
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// Helper function to validate idempotency key format
function isValidIdempotencyKey(key: string): boolean {
  // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(key);
}

// Periodic cleanup of expired entries
let cleanupInterval: ReturnType<typeof setInterval> | null = null;

const startCleanupInterval = () => {
  if (cleanupInterval) return; // Already started

  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of idempotencyStore.entries()) {
      if (now - entry.timestamp > CACHE_TTL) {
        idempotencyStore.delete(key);
      }
    }
  }, CACHE_CLEANUP_INTERVAL);
};

// Allow cleanup interval to be cleared for testing
export const clearCleanupInterval = () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
};

// Start cleanup interval only in production/non-test environments
const nodeEnv = process.env['NODE_ENV'];
if (nodeEnv !== 'test') {
  startCleanupInterval();
}

// Extend Request interface to include idempotency key
export interface IdempotentRequest extends Request {
  idempotencyKey?: string;
}

export const idempotencyMiddleware = (
  req: IdempotentRequest,
  res: Response,
  next: NextFunction
): void => {
  // Only apply to POST requests
  if (req.method !== 'POST') {
    return next();
  }

  const idempotencyKey =
    (req.headers['idempotency-key'] as string) || req.body.idempotencyKey;

  if (!idempotencyKey) {
    // Idempotency key is optional, continue without it
    return next();
  }

  // Validate idempotency key format (should be UUID-like)
  if (!isValidIdempotencyKey(idempotencyKey)) {
    res.status(400).json({
      error: 'Invalid idempotency key format',
      message: 'Idempotency key must be a UUID v4',
    });
    return;
  }

  // Check if we've seen this idempotency key before
  const existingResponse = idempotencyStore.get(idempotencyKey);
  if (existingResponse) {
    logger.info('Returning cached response for idempotency key', {
      correlationId: req.correlationId,
      idempotencyKey,
      cachedStatus: existingResponse.status,
    });
    res.status(existingResponse.status).json(existingResponse.response);
    return;
  }

  // Store the idempotency key for this request
  req.idempotencyKey = idempotencyKey;

  // Override res.json to cache the response
  const originalJson = res.json.bind(res);
  res.json = function (body: any) {
    // Only cache successful responses (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyStore.set(idempotencyKey, {
        response: body,
        timestamp: Date.now(),
        status: res.statusCode,
      });

      logger.info('Cached response for idempotency key', {
        correlationId: req.correlationId,
        idempotencyKey,
        status: res.statusCode,
      });
    }

    return originalJson(body);
  };

  next();
};

// Helper function to get cache statistics (useful for monitoring)
export const getIdempotencyCacheStats = () => {
  return {
    totalKeys: idempotencyStore.size,
    oldestEntry: Math.min(
      ...Array.from(idempotencyStore.values()).map(v => v.timestamp)
    ),
    newestEntry: Math.max(
      ...Array.from(idempotencyStore.values()).map(v => v.timestamp)
    ),
  };
};
