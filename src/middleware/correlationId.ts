import { Request, Response, NextFunction } from 'express';

// Extend Request interface to include custom properties
declare global {
  namespace Express {
    interface Request {
      traceContext?: {
        correlationId: string;
        traceId: string;
        spanId: string;
      };
      startTime?: number;
    }
  }
}
import { randomUUID } from 'crypto';
import { tracingService } from '../services/TracingService';
import { logger } from '../config/logger';

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Check if correlation ID is provided in headers, otherwise generate one
  const correlationId =
    (req.headers['x-correlation-id'] as string) || randomUUID();

  // Attach correlation ID to request object
  req.correlationId = correlationId;

  // Set correlation ID in response headers
  res.setHeader('X-Correlation-ID', correlationId);

  // Get trace context information
  const traceId = tracingService.getCurrentTraceId();
  const spanId = tracingService.getCurrentSpanId();

  // Add trace information to response headers for debugging
  if (traceId) {
    res.setHeader('X-Trace-ID', traceId);
  }
  if (spanId) {
    res.setHeader('X-Span-ID', spanId);
  }

  // Add correlation and trace context to the active span
  tracingService.addAttributesToActiveSpan({
    'correlation.id': correlationId,
    'http.method': req.method,
    'http.url': req.url,
    'http.route': req.route?.path || req.path,
    'user.agent': req.get('User-Agent') || 'unknown',
  });

  // Create enhanced logger context with trace information
  const logContext = {
    correlationId,
    traceId,
    spanId,
    method: req.method,
    url: req.url,
    userAgent: req.get('User-Agent'),
  };

  // Attach enhanced context to request for use in other middleware/controllers
  (req as any).traceContext = {
    correlationId,
    traceId,
    spanId,
    logContext,
  };

  // Log request start with trace context
  logger.info('Request started', logContext);

  // Capture response finish to log request completion
  const originalSend = res.send;
  res.send = function (body) {
    const endTime = Date.now();
    const duration = endTime - ((req as any).startTime || endTime);

    // Add response information to span
    tracingService.addAttributesToActiveSpan({
      'http.status_code': res.statusCode,
      'http.response_size': Buffer.byteLength(body || ''),
      'http.duration_ms': duration,
    });

    // Log request completion
    logger.info('Request completed', {
      ...logContext,
      statusCode: res.statusCode,
      duration,
      responseSize: Buffer.byteLength(body || ''),
    });

    return originalSend.call(this, body);
  };

  // Record request start time
  (req as any).startTime = Date.now();

  next();
}
