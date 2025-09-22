import { trace, context, SpanStatusCode, SpanKind, Span } from '@opentelemetry/api';
import { SemanticAttributes } from '@opentelemetry/semantic-conventions';
import { logger } from '../config/logger';

export class TracingService {
  private static instance: TracingService;
  private tracer = trace.getTracer('payment-backend', '1.0.0');

  public static getInstance(): TracingService {
    if (!TracingService.instance) {
      TracingService.instance = new TracingService();
    }
    return TracingService.instance;
  }

  /**
   * Start a new span with the given name and attributes
   */
  public startSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>,
    kind?: SpanKind
  ): Span {
    const span = this.tracer.startSpan(name, {
      kind: kind || SpanKind.INTERNAL,
      attributes,
    });

    return span;
  }

  /**
   * Start a span for HTTP operations
   */
  public startHttpSpan(
    method: string,
    url: string,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    return this.startSpan(`HTTP ${method} ${url}`, {
      [SemanticAttributes.HTTP_METHOD]: method,
      [SemanticAttributes.HTTP_URL]: url,
      ...attributes,
    }, SpanKind.CLIENT);
  }

  /**
   * Start a span for database operations
   */
  public startDbSpan(
    operation: string,
    table?: string,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    const spanName = table ? `${operation} ${table}` : operation;
    return this.startSpan(spanName, {
      [SemanticAttributes.DB_OPERATION]: operation,
      [SemanticAttributes.DB_SQL_TABLE]: table,
      [SemanticAttributes.DB_SYSTEM]: 'postgresql',
      ...attributes,
    });
  }

  /**
   * Start a span for payment operations
   */
  public startPaymentSpan(
    operation: string,
    paymentMethod?: string,
    amount?: number,
    currency?: string,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    return this.startSpan(`Payment ${operation}`, {
      'payment.operation': operation,
      'payment.method': paymentMethod,
      'payment.amount': amount,
      'payment.currency': currency,
      ...attributes,
    });
  }

  /**
   * Start a span for subscription operations
   */
  public startSubscriptionSpan(
    operation: string,
    subscriptionId?: string,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    return this.startSpan(`Subscription ${operation}`, {
      'subscription.operation': operation,
      'subscription.id': subscriptionId,
      ...attributes,
    });
  }

  /**
   * Start a span for webhook operations
   */
  public startWebhookSpan(
    operation: string,
    eventType?: string,
    attributes?: Record<string, string | number | boolean>
  ): Span {
    return this.startSpan(`Webhook ${operation}`, {
      'webhook.operation': operation,
      'webhook.event_type': eventType,
      ...attributes,
    });
  }

  /**
   * Execute a function within a span context
   */
  public async executeInSpan<T>(
    span: Span,
    fn: () => Promise<T> | T
  ): Promise<T> {
    try {
      const result = await context.with(trace.setSpan(context.active(), span), fn);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.recordException(error as Error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: (error as Error).message,
      });
      throw error;
    } finally {
      span.end();
    }
  }

  /**
   * Add attributes to the current active span
   */
  public addAttributesToActiveSpan(attributes: Record<string, string | number | boolean>): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  }

  /**
   * Add an event to the current active span
   */
  public addEventToActiveSpan(name: string, attributes?: Record<string, string | number | boolean>): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.addEvent(name, attributes);
    }
  }

  /**
   * Record an exception in the current active span
   */
  public recordException(error: Error): void {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.recordException(error);
      activeSpan.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message,
      });
    }
  }

  /**
   * Get the current trace ID for logging correlation
   */
  public getCurrentTraceId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return spanContext.traceId;
    }
    return undefined;
  }

  /**
   * Get the current span ID for logging correlation
   */
  public getCurrentSpanId(): string | undefined {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      const spanContext = activeSpan.spanContext();
      return spanContext.spanId;
    }
    return undefined;
  }

  /**
   * Create a child span from the current context
   */
  public createChildSpan(
    name: string,
    attributes?: Record<string, string | number | boolean>,
    kind?: SpanKind
  ): Span {
    return this.tracer.startSpan(name, {
      kind: kind || SpanKind.INTERNAL,
      attributes,
    }, context.active());
  }

  /**
   * Measure the duration of an operation
   */
  public async measureOperation<T>(
    operationName: string,
    operation: () => Promise<T> | T,
    attributes?: Record<string, string | number | boolean>
  ): Promise<T> {
    const span = this.startSpan(operationName, attributes);
    const startTime = Date.now();
    
    try {
      const result = await this.executeInSpan(span, operation);
      const duration = Date.now() - startTime;
      span.setAttributes({
        'operation.duration_ms': duration,
        'operation.success': true,
      });
      
      // Log slow operations
      if (duration > 1000) {
        logger.warn(`Slow operation detected: ${operationName} took ${duration}ms`, {
          operation: operationName,
          duration,
          traceId: this.getCurrentTraceId(),
        });
      }
      
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      span.setAttributes({
        'operation.duration_ms': duration,
        'operation.success': false,
        'operation.error': (error as Error).message,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const tracingService = TracingService.getInstance();
