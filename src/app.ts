import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { correlationIdMiddleware } from './middleware/correlationId';
import { errorHandler } from './middleware/errorHandler';
import { validationErrorHandler } from './middleware/validation';
import { logger } from './config/logger';
import paymentRoutes from './routes/payments';
import webhookRoutes from './routes/webhooks';
import healthRoutes from './routes/health';

export function createApp(): express.Application {
  const app = express();

  // Security middleware
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  // CORS configuration
  app.use(
    cors({
      origin: process.env['ALLOWED_ORIGINS']?.split(',') || [
        'http://localhost:3000',
      ],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
    })
  );

  // Rate limiting
  const rateLimiter = new RateLimiterMemory({
    points: 100, // Number of requests
    duration: 60, // Per 60 seconds
  });

  app.use(async (req, res, next) => {
    try {
      await rateLimiter.consume(req.ip || 'unknown');
      next();
    } catch (rejRes: any) {
      const secs = Math.round(rejRes.msBeforeNext / 1000) || 1;
      res.set('Retry-After', String(secs));
      res.status(429).json({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: secs,
      });
    }
  });

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Compression middleware
  app.use(compression());

  // Correlation ID middleware
  app.use(correlationIdMiddleware);

  // Logging middleware
  app.use(
    morgan('combined', {
      stream: {
        write: (message: string) => {
          logger.info(message.trim());
        },
      },
    })
  );

  // Health check route
  app.use('/health', healthRoutes);

  // API routes
  app.use('/api/payments', paymentRoutes);
  app.use('/api/webhooks', webhookRoutes);

  // 404 handler
  app.use('*', (req, res) => {
    res.status(404).json({
      error: 'Not Found',
      message: `Route ${req.originalUrl} not found`,
      correlationId: req.correlationId,
    });
  });

  // Validation error handler
  app.use(validationErrorHandler);

  // Global error handler
  app.use(errorHandler);

  return app;
}
