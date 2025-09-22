import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      startTime?: number;
      traceContext?: {
        correlationId: string;
        traceId?: string;
        spanId?: string;
        logContext: Record<string, any>;
      };
    }
  }
}
