import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../config/logger';

export interface ValidationError extends Error {
  isValidationError: boolean;
  details: Joi.ValidationErrorItem[];
}

export function validateRequest(schema: {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const errors: string[] = [];

    // Validate request body
    if (schema.body) {
      const { error } = schema.body.validate(req.body);
      if (error) {
        errors.push(...error.details.map(detail => `Body: ${detail.message}`));
      }
    }

    // Validate query parameters
    if (schema.query) {
      const { error } = schema.query.validate(req.query);
      if (error) {
        errors.push(...error.details.map(detail => `Query: ${detail.message}`));
      }
    }

    // Validate route parameters
    if (schema.params) {
      const { error } = schema.params.validate(req.params);
      if (error) {
        errors.push(
          ...error.details.map(detail => `Params: ${detail.message}`)
        );
      }
    }

    if (errors.length > 0) {
      logger.warn('Validation failed', {
        correlationId: req.correlationId,
        errors,
        url: req.url,
        method: req.method,
      });

      res.status(400).json({
        error: 'Validation Error',
        message: 'Request validation failed',
        details: errors,
        correlationId: req.correlationId,
      });
      return;
    }

    next();
  };
}

export function validationErrorHandler(
  err: ValidationError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (err.isValidationError) {
    logger.warn('Validation error occurred', {
      correlationId: req.correlationId,
      error: err.message,
      details: err.details,
    });

    res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details.map(detail => detail.message),
      correlationId: req.correlationId,
    });
    return;
  }

  next(err);
}
