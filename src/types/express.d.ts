declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
      traceId?: string;
      spanId?: string;
      startTime?: number;
      user?: Record<string, unknown>;
    }
  }
}
