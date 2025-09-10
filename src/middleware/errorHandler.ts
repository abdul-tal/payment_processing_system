import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  // eslint-disable-next-line no-unused-vars
  _next: NextFunction // eslint-disable-line @typescript-eslint/no-unused-vars
): void {
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let isOperational = err.isOperational || false;

  // Handle specific error types
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = 'Validation Error';
    isOperational = true;
  } else if (err.name === 'UnauthorizedError') {
    statusCode = 401;
    message = 'Unauthorized';
    isOperational = true;
  } else if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Invalid ID format';
    isOperational = true;
  } else if (err.name === 'MongoError' && (err as any).code === 11000) {
    statusCode = 409;
    message = 'Duplicate field value';
    isOperational = true;
  }

  // Log error details
  const logLevel = statusCode >= 500 ? 'error' : 'warn';
  logger[logLevel]('Request error occurred', {
    correlationId: req.correlationId,
    error: {
      name: err.name,
      message: err.message,
      stack: err.stack,
      statusCode,
      isOperational,
    },
    request: {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    },
  });

  // Prepare error response
  const errorResponse: Record<string, any> = {
    error: statusCode >= 500 ? 'Internal Server Error' : message,
    correlationId: req.correlationId,
    timestamp: new Date().toISOString(),
  };

  // Include additional details in development
  if (process.env['NODE_ENV'] === 'development') {
    errorResponse['details'] = {
      message: err.message,
      stack: err.stack,
      name: err.name,
    };
  }

  // Include message for operational errors
  if (isOperational && statusCode < 500) {
    errorResponse['message'] = message;
  }

  res.status(statusCode).json(errorResponse);
}

export function createError(
  message: string,
  statusCode: number = 500,
  isOperational: boolean = true
): AppError {
  const error = new Error(message) as AppError;
  error.statusCode = statusCode;
  error.isOperational = isOperational;
  return error;
}

export function asyncHandler(fn: any) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
