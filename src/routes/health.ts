import { Router, Request, Response } from 'express';
import { AppDataSource } from '../config/database';
import { logger } from '../config/logger';

const router = Router();

interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  correlationId: string | undefined;
  services: {
    database: 'connected' | 'disconnected';
  };
  version: string;
  environment: string;
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const startTime = Date.now();

    // Check database connection
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';
    try {
      if (AppDataSource.isInitialized) {
        await AppDataSource.query('SELECT 1');
        dbStatus = 'connected';
      }
    } catch (error) {
      logger.error('Database health check failed', {
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    const healthStatus: HealthCheckResponse = {
      status: dbStatus === 'connected' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      correlationId: req.correlationId,
      services: {
        database: dbStatus,
      },
      version: process.env['npm_package_version'] || '1.0.0',
      environment: process.env['NODE_ENV'] || 'development',
    };

    const responseTime = Date.now() - startTime;

    logger.info('Health check performed', {
      correlationId: req.correlationId,
      status: healthStatus.status,
      responseTime,
      dbStatus,
    });

    const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(healthStatus);
  } catch (error) {
    logger.error('Health check endpoint error', {
      correlationId: req.correlationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      correlationId: req.correlationId,
      error: 'Health check failed',
    });
  }
});

export default router;
