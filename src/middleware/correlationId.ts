import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

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

  next();
}
