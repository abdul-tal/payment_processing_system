import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';
import { securityAuditService } from '../services/SecurityAuditService';

export interface SecureError extends Error {
  statusCode?: number;
  code?: string;
  isOperational?: boolean;
  sensitive?: boolean;
  details?: Record<string, any>;
}

export interface ErrorResponse {
  error: string;
  message: string;
  code?: string;
  timestamp: string;
  correlationId?: string;
}

class SecureErrorHandler {
  private static instance: SecureErrorHandler;

  // Sensitive patterns that should never be exposed
  private sensitivePatterns = [
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, // Credit card numbers
    /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/g, // SSN
    /\b\d{9}\b/g, // Routing numbers
    /cvv\s*[:=]\s*\d{3,4}/gi, // CVV
    /password\s*[:=]\s*[^\s]+/gi, // Passwords
    /api[_-]?key\s*[:=]\s*[^\s]+/gi, // API keys
    /secret\s*[:=]\s*[^\s]+/gi, // Secrets
    /token\s*[:=]\s*[^\s]+/gi, // Tokens
    /authorization\s*:\s*bearer\s+[^\s]+/gi, // Bearer tokens
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses (in some contexts)
  ];

  // Error codes that should have generic messages
  private sensitiveErrorCodes = [
    'PAYMENT_DECLINED',
    'INSUFFICIENT_FUNDS',
    'CARD_EXPIRED',
    'INVALID_CARD',
    'FRAUD_DETECTED',
    'ACCOUNT_LOCKED',
    'AUTHENTICATION_FAILED',
    'AUTHORIZATION_FAILED',
  ];

  private constructor() {}

  public static getInstance(): SecureErrorHandler {
    if (!SecureErrorHandler.instance) {
      SecureErrorHandler.instance = new SecureErrorHandler();
    }
    return SecureErrorHandler.instance;
  }

  /**
   * Main error handling middleware
   */
  public handleError = async (
    error: SecureError,
    req: Request,
    res: Response,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    _next: NextFunction
  ): Promise<void> => {
    try {
      // Generate correlation ID if not present
      const correlationId =
        (req as any).correlationId || this.generateCorrelationId();

      // Log the full error details securely
      await this.logError(error, req, correlationId);

      // Create secure error response
      const errorResponse = this.createSecureErrorResponse(
        error,
        correlationId
      );

      // Set appropriate status code
      const statusCode = error.statusCode || 500;

      // Log security event for critical errors
      if (statusCode >= 500 || error.sensitive) {
        await securityAuditService.logSecurityEvent({
          event_type: 'ERROR_OCCURRED',
          severity: statusCode >= 500 ? 'HIGH' : 'MEDIUM',
          user_id: (req as any).apiKey?.id || 'unknown',
          resource_type: 'ERROR_HANDLING',
          resource_id: error.code || 'UNKNOWN_ERROR',
          action: 'ERROR_RESPONSE',
          details: {
            status_code: statusCode,
            error_code: error.code,
            endpoint: req.path,
            method: req.method,
            is_sensitive: error.sensitive || false,
          },
          ip_address: req.ip || 'unknown',
          user_agent: req.headers['user-agent'] as string,
          correlation_id: correlationId,
          success: false,
        });
      }

      res.status(statusCode).json(errorResponse);
    } catch (handlingError) {
      // Fallback error handling
      logger.error('Error in error handler', {
        originalError: error.message,
        handlingError:
          handlingError instanceof Error
            ? handlingError.message
            : String(handlingError),
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        timestamp: new Date().toISOString(),
      });
    }
  };

  /**
   * Creates a secure error response that doesn't expose sensitive information
   */
  private createSecureErrorResponse(
    error: SecureError,
    correlationId: string
  ): ErrorResponse {
    const isProduction = process.env['NODE_ENV'] === 'production';

    let message = error.message;
    let errorType = error.name || 'Error';

    // Sanitize sensitive information from error message
    message = this.sanitizeErrorMessage(message);

    // Use generic messages for sensitive error codes in production
    if (
      isProduction &&
      error.code &&
      this.sensitiveErrorCodes.includes(error.code)
    ) {
      message = this.getGenericErrorMessage(error.code);
      errorType = 'ProcessingError';
    }

    // Generic message for 500 errors in production
    if (isProduction && (error.statusCode || 500) >= 500) {
      message = 'An internal error occurred. Please try again later.';
      errorType = 'InternalError';
    }

    const response: ErrorResponse = {
      error: errorType,
      message,
      timestamp: new Date().toISOString(),
      correlationId,
    };

    // Include error code only if it's not sensitive
    if (
      error.code &&
      (!isProduction || !this.sensitiveErrorCodes.includes(error.code))
    ) {
      response.code = error.code;
    }

    return response;
  }

  /**
   * Sanitizes error messages to remove sensitive information
   */
  private sanitizeErrorMessage(message: string): string {
    let sanitized = message;

    // Remove sensitive patterns
    this.sensitivePatterns.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '[REDACTED]');
    });

    // Remove database connection strings
    sanitized = sanitized.replace(
      /postgresql:\/\/[^@]+@[^/]+\/\w+/gi,
      '[DATABASE_URL_REDACTED]'
    );
    sanitized = sanitized.replace(
      /mongodb:\/\/[^@]+@[^/]+\/\w+/gi,
      '[DATABASE_URL_REDACTED]'
    );

    // Remove file paths that might contain sensitive information
    sanitized = sanitized.replace(
      /\/[a-zA-Z0-9_\-.]+\.(key|pem|p12|jks)/gi,
      '[FILE_PATH_REDACTED]'
    );

    // Remove stack traces in production
    if (process.env['NODE_ENV'] === 'production') {
      sanitized = sanitized.split('\n')[0] || sanitized; // Keep only the first line
    }

    return sanitized;
  }

  /**
   * Returns generic error messages for sensitive error codes
   */
  private getGenericErrorMessage(errorCode: string): string {
    const genericMessages: Record<string, string> = {
      PAYMENT_DECLINED:
        'Payment could not be processed. Please check your payment information.',
      INSUFFICIENT_FUNDS:
        'Payment could not be processed. Please try a different payment method.',
      CARD_EXPIRED:
        'Payment could not be processed. Please check your payment information.',
      INVALID_CARD:
        'Payment could not be processed. Please check your payment information.',
      FRAUD_DETECTED: 'Payment could not be processed. Please contact support.',
      ACCOUNT_LOCKED:
        'Account access is temporarily restricted. Please contact support.',
      AUTHENTICATION_FAILED:
        'Authentication failed. Please check your credentials.',
      AUTHORIZATION_FAILED: 'Access denied. Please check your permissions.',
    };

    return (
      genericMessages[errorCode] ||
      'An error occurred while processing your request.'
    );
  }

  /**
   * Logs error details securely
   */
  private async logError(
    error: SecureError,
    req: Request,
    correlationId: string
  ): Promise<void> {
    try {
      const logData = {
        error: {
          name: error.name,
          message: this.sanitizeErrorMessage(error.message),
          code: error.code,
          statusCode: error.statusCode,
          stack:
            process.env['NODE_ENV'] !== 'production' ? error.stack : undefined,
        },
        request: {
          method: req.method,
          url: req.url,
          headers: this.sanitizeHeaders(req.headers),
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };

      // Log based on severity
      if ((error.statusCode || 500) >= 500) {
        logger.error('Server error occurred', logData);
      } else if ((error.statusCode || 400) >= 400) {
        logger.warn('Client error occurred', logData);
      } else {
        logger.info('Error handled', logData);
      }
    } catch (loggingError) {
      logger.error('Failed to log error', {
        loggingError:
          loggingError instanceof Error
            ? loggingError.message
            : String(loggingError),
        originalError: error.message,
      });
    }
  }

  /**
   * Sanitizes request headers to remove sensitive information
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sanitized = { ...headers };

    // Remove sensitive headers
    const sensitiveHeaders = [
      'authorization',
      'x-api-key',
      'cookie',
      'set-cookie',
      'x-auth-token',
      'x-access-token',
    ];

    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Generates a correlation ID for error tracking
   */
  private generateCorrelationId(): string {
    return `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Creates a secure error for payment operations
   */
  public createPaymentError(
    message: string,
    code: string,
    statusCode: number = 400,
    details?: Record<string, any>
  ): SecureError {
    const error = new Error(message) as SecureError;
    error.name = 'PaymentError';
    error.code = code;
    error.statusCode = statusCode;
    error.isOperational = true;
    error.sensitive = true;
    if (details !== undefined) {
      error.details = details;
    }
    return error;
  }

  /**
   * Creates a secure error for authentication operations
   */
  public createAuthError(
    message: string,
    code: string,
    statusCode: number = 401
  ): SecureError {
    const error = new Error(message) as SecureError;
    error.name = 'AuthenticationError';
    error.code = code;
    error.statusCode = statusCode;
    error.isOperational = true;
    error.sensitive = true;
    return error;
  }

  /**
   * Creates a secure error for validation operations
   */
  public createValidationError(
    message: string,
    code: string = 'VALIDATION_ERROR',
    statusCode: number = 400,
    details?: Record<string, any>
  ): SecureError {
    const error = new Error(message) as SecureError;
    error.name = 'ValidationError';
    error.code = code;
    error.statusCode = statusCode;
    error.isOperational = true;
    if (details !== undefined) {
      error.details = details;
    }
    return error;
  }

  /**
   * Wraps async route handlers to catch errors
   */
  public asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  };
}

export const secureErrorHandler = SecureErrorHandler.getInstance();

// Export the error handling middleware
export const errorHandler = secureErrorHandler.handleError;

// Export utility functions
export const createPaymentError = secureErrorHandler.createPaymentError;
export const createAuthError = secureErrorHandler.createAuthError;
export const createValidationError = secureErrorHandler.createValidationError;
export const asyncHandler = secureErrorHandler.asyncHandler;
