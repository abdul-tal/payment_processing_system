import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { tracingService } from '../services/TracingService';

export interface LoggingRequest extends Request {
  traceContext: {
    correlationId: string;
    traceId: string;
    spanId: string;
    logContext: Record<string, any>;
  };
  startTime: number;
}

/**
 * Enhanced request/response logging middleware with trace context
 */
export function requestLoggingMiddleware(
  req: LoggingRequest,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();
  req.startTime = startTime;

  // Extract trace context
  const traceId = tracingService.getCurrentTraceId();
  const spanId = tracingService.getCurrentSpanId();
  const correlationId = req.correlationId || 'unknown';

  // Create enriched log context
  const baseLogContext = {
    correlationId,
    traceId,
    spanId,
    method: req.method,
    url: req.url,
    path: req.path,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    remoteAddress: req.ip || req.connection.remoteAddress,
    referer: req.get('Referer'),
    timestamp: new Date().toISOString(),
  };

  // Add trace attributes for the request
  tracingService.addAttributesToActiveSpan({
    'http.request.method': req.method,
    'http.request.url': req.url,
    'http.request.path': req.path,
    'http.request.user_agent': req.get('User-Agent') || 'unknown',
    'http.request.content_type': req.get('Content-Type') || 'unknown',
    'http.request.content_length': parseInt(
      req.get('Content-Length') || '0',
      10
    ),
    'http.request.remote_address': req.ip || 'unknown',
  });

  // Log request start
  logger.info('HTTP Request Started', {
    ...baseLogContext,
    event: 'request_start',
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    params: Object.keys(req.params).length > 0 ? req.params : undefined,
  });

  // Capture original response methods
  const originalSend = res.send;
  const originalJson = res.json;
  const originalEnd = res.end;

  let responseBody: any;
  let responseSize = 0;

  // Override res.send to capture response data
  res.send = function (body: any) {
    responseBody = body;
    responseSize = Buffer.byteLength(body || '', 'utf8');
    return originalSend.call(this, body);
  };

  // Override res.json to capture JSON response data
  res.json = function (obj: any) {
    responseBody = obj;
    const jsonString = JSON.stringify(obj);
    responseSize = Buffer.byteLength(jsonString, 'utf8');
    return originalJson.call(this, obj);
  };

  // Override res.end to capture final response
  res.end = function (chunk?: any, encoding?: any) {
    if (chunk && !responseBody) {
      responseBody = chunk;
      responseSize = Buffer.byteLength(chunk || '', encoding || 'utf8');
    }
    return originalEnd.call(this, chunk, encoding);
  };

  // Handle response completion
  res.on('finish', () => {
    const endTime = Date.now();
    const duration = endTime - startTime;
    const statusCode = res.statusCode;

    // Determine log level based on status code
    let logLevel: 'info' | 'warn' | 'error' = 'info';
    if (statusCode >= 400 && statusCode < 500) {
      logLevel = 'warn';
    } else if (statusCode >= 500) {
      logLevel = 'error';
    }

    // Add response attributes to trace
    tracingService.addAttributesToActiveSpan({
      'http.response.status_code': statusCode,
      'http.response.size': responseSize,
      'http.response.duration_ms': duration,
      'http.response.content_type': res.get('Content-Type') || 'unknown',
    });

    // Create response log context
    const responseLogContext = {
      ...baseLogContext,
      event: 'request_complete',
      statusCode,
      duration,
      responseSize,
      responseContentType: res.get('Content-Type'),
      // Only log response body for errors or if explicitly enabled
      responseBody:
        statusCode >= 400 && process.env['LOG_RESPONSE_BODY'] === 'true'
          ? responseBody
          : undefined,
    };

    // Log response completion
    logger[logLevel]('HTTP Request Completed', responseLogContext);

    // Add performance metrics event to trace
    tracingService.addEventToActiveSpan('request_completed', {
      'http.status_code': statusCode.toString(),
      duration_ms: duration.toString(),
      response_size: responseSize.toString(),
    });

    // Log slow requests
    const slowRequestThreshold = parseInt(
      process.env['SLOW_REQUEST_THRESHOLD_MS'] || '5000',
      10
    );
    if (duration > slowRequestThreshold) {
      logger.warn('Slow Request Detected', {
        ...responseLogContext,
        event: 'slow_request',
        threshold: slowRequestThreshold,
      });

      tracingService.addEventToActiveSpan('slow_request_detected', {
        duration_ms: duration.toString(),
        threshold_ms: slowRequestThreshold.toString(),
      });
    }
  });

  // Handle response errors
  res.on('error', (error: Error) => {
    const endTime = Date.now();
    const duration = endTime - startTime;

    logger.error('HTTP Response Error', {
      ...baseLogContext,
      event: 'response_error',
      error: error.message,
      stack: error.stack,
      duration,
    });

    // Record exception in trace
    // tracingService.recordExceptionInActiveSpan(error);
  });

  next();
}

/**
 * Middleware for logging database queries with trace context
 */
export function databaseLoggingMiddleware() {
  return {
    beforeQuery: (query: string, parameters?: any[]) => {
      const traceId = tracingService.getCurrentTraceId();
      const spanId = tracingService.getCurrentSpanId();

      logger.debug('Database Query Started', {
        event: 'db_query_start',
        traceId,
        spanId,
        query: query.substring(0, 500), // Truncate long queries
        parameterCount: parameters?.length || 0,
        timestamp: new Date().toISOString(),
      });
    },

    afterQuery: (
      query: string,
      parameters?: any[],
      duration?: number,
      error?: Error
    ) => {
      const traceId = tracingService.getCurrentTraceId();
      const spanId = tracingService.getCurrentSpanId();

      if (error) {
        logger.error('Database Query Failed', {
          event: 'db_query_error',
          traceId,
          spanId,
          query: query.substring(0, 500),
          parameterCount: parameters?.length || 0,
          duration,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.debug('Database Query Completed', {
          event: 'db_query_complete',
          traceId,
          spanId,
          query: query.substring(0, 500),
          parameterCount: parameters?.length || 0,
          duration,
          timestamp: new Date().toISOString(),
        });
      }
    },
  };
}

/**
 * Middleware for logging external API calls with trace context
 */
export function externalApiLoggingMiddleware() {
  return {
    beforeRequest: (
      url: string,
      method: string,
      headers?: Record<string, string>
    ) => {
      const traceId = tracingService.getCurrentTraceId();
      const spanId = tracingService.getCurrentSpanId();

      logger.info('External API Request Started', {
        event: 'external_api_request_start',
        traceId,
        spanId,
        url,
        method,
        headers: headers ? Object.keys(headers) : undefined,
        timestamp: new Date().toISOString(),
      });
    },

    afterRequest: (
      url: string,
      method: string,
      statusCode?: number,
      duration?: number,
      error?: Error
    ) => {
      const traceId = tracingService.getCurrentTraceId();
      const spanId = tracingService.getCurrentSpanId();

      if (error) {
        logger.error('External API Request Failed', {
          event: 'external_api_request_error',
          traceId,
          spanId,
          url,
          method,
          duration,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      } else {
        logger.info('External API Request Completed', {
          event: 'external_api_request_complete',
          traceId,
          spanId,
          url,
          method,
          statusCode,
          duration,
          timestamp: new Date().toISOString(),
        });
      }
    },
  };
}
