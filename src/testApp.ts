import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { requestLoggingMiddleware } from './middleware/requestLogging';
import { errorHandler } from './middleware/errorHandler';
import { correlationIdMiddleware } from './middleware/correlationId';
import { authenticateApiKey } from './middleware/testApiKeyAuth';

// Import actual payment system routes
import { subscriptionRoutes } from './routes/subscriptionRoutes';
import webhookRoutes from './routes/webhookRoutes';
import paymentsV1 from './routes/paymentsV1';
import healthRoutes from './routes/health';

// Mock database configuration to use TestDataSource
jest.mock('./config/database', () => require('./config/testDatabase'));

// Mock ApiKeyManager to prevent interval creation
jest.mock('./middleware/apiKeyAuth', () =>
  require('./middleware/testApiKeyAuth')
);

const app = express();

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env['CORS_ORIGIN'] || 'http://localhost:3000',
    credentials: true,
  })
);

// Simple rate limiting for tests (no-op)
app.use((_req, _res, next) => {
  next();
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request correlation and logging
app.use(correlationIdMiddleware);
app.use(requestLoggingMiddleware as any);

// Protected routes - apply authentication to all /api/v1 routes
app.use('/api/v1', authenticateApiKey());

// Use actual payment system routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/payments', paymentsV1);
app.use('/api/v1/subscriptions', subscriptionRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
export { app as createTestApp };
