# Observability Strategy

This document outlines the comprehensive observability strategy for the Payment Backend Service, including metrics collection, distributed tracing, logging, and monitoring approaches.

## 📊 Metrics Collection

### Core Business Metrics

#### Payment Metrics
```typescript
// Counter Metrics
payment_transactions_total{type="purchase|authorize|capture|refund", status="success|failed"}
payment_amount_total{currency="USD"} // Total payment volume
payment_errors_total{error_code="CARD_DECLINED|NETWORK_ERROR|..."}
payment_retries_total{operation="purchase|capture|refund"}

// Histogram Metrics  
payment_processing_duration_seconds{operation="purchase|authorize|capture"}
payment_gateway_response_time_seconds{gateway="authorize_net"}

// Gauge Metrics
payment_active_authorizations // Current number of pending authorizations
payment_daily_volume{currency="USD"} // Daily payment volume
```

#### Subscription Metrics
```typescript
// Counter Metrics
subscription_events_total{event="created|updated|canceled|billing_success|billing_failed"}
subscription_billing_attempts_total{status="success|failed|retry"}
subscription_churn_total{reason="voluntary|involuntary"}

// Gauge Metrics
subscription_active_count{plan_id}
subscription_mrr{plan_id} // Monthly Recurring Revenue
subscription_retention_rate{cohort_month}
```

#### System Metrics
```typescript
// Counter Metrics
http_requests_total{method="GET|POST|PUT|DELETE", endpoint, status_code}
webhook_events_total{event_type, status="processed|failed|retried"}
queue_jobs_total{queue_name, status="completed|failed|retried"}

// Histogram Metrics
http_request_duration_seconds{method, endpoint}
database_query_duration_seconds{operation="select|insert|update|delete"}
queue_job_duration_seconds{queue_name, job_type}

// Gauge Metrics
database_connections_active
redis_connections_active
queue_jobs_waiting{queue_name}
memory_usage_bytes
cpu_usage_percent
```

### Metrics Implementation

```typescript
// Prometheus metrics setup
import { register, Counter, Histogram, Gauge } from 'prom-client';

export class MetricsService {
  private paymentCounter = new Counter({
    name: 'payment_transactions_total',
    help: 'Total number of payment transactions',
    labelNames: ['type', 'status', 'gateway']
  });

  private paymentDuration = new Histogram({
    name: 'payment_processing_duration_seconds',
    help: 'Payment processing duration in seconds',
    labelNames: ['operation'],
    buckets: [0.1, 0.5, 1, 2, 5, 10]
  });

  private activeConnections = new Gauge({
    name: 'database_connections_active',
    help: 'Number of active database connections'
  });

  recordPayment(type: string, status: string, duration: number) {
    this.paymentCounter.inc({ type, status, gateway: 'authorize_net' });
    this.paymentDuration.observe({ operation: type }, duration);
  }

  updateConnectionCount(count: number) {
    this.activeConnections.set(count);
  }

  getMetrics(): string {
    return register.metrics();
  }
}
```

## 🔍 Distributed Tracing Strategy

### Correlation ID Implementation

```typescript
// Correlation ID middleware
export function correlationMiddleware(req: Request, res: Response, next: NextFunction) {
  const correlationId = req.headers['x-correlation-id'] as string || 
                       req.headers['x-request-id'] as string ||
                       uuidv4();
  
  req.correlationId = correlationId;
  res.setHeader('x-correlation-id', correlationId);
  
  // Add to async local storage for child operations
  asyncLocalStorage.run({ correlationId }, () => {
    next();
  });
}

// Usage in services
export class PaymentService {
  async processPurchase(request: PurchaseRequest): Promise<TransactionResult> {
    const correlationId = asyncLocalStorage.getStore()?.correlationId;
    
    this.logger.info('Processing purchase', {
      correlationId,
      amount: request.amount,
      customerId: request.customer.id
    });

    // All downstream calls inherit correlation ID
    const result = await this.authorizeNetService.createTransaction(request);
    
    this.logger.info('Purchase completed', {
      correlationId,
      transactionId: result.transactionId,
      status: result.status
    });

    return result;
  }
}
```

### Trace Span Implementation

```typescript
// OpenTelemetry tracing setup
import { trace, SpanStatusCode } from '@opentelemetry/api';

export class TracingService {
  private tracer = trace.getTracer('payment-backend');

  async tracePaymentOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    attributes?: Record<string, string>
  ): Promise<T> {
    return await this.tracer.startActiveSpan(operationName, async (span) => {
      try {
        // Add custom attributes
        if (attributes) {
          Object.entries(attributes).forEach(([key, value]) => {
            span.setAttribute(key, value);
          });
        }

        const result = await operation();
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        });
        span.recordException(error);
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

// Usage example
async processPurchase(request: PurchaseRequest): Promise<TransactionResult> {
  return await this.tracingService.tracePaymentOperation(
    'payment.purchase',
    async () => {
      // Payment processing logic
      return await this.authorizeNet.createTransaction(request);
    },
    {
      'payment.amount': request.amount.toString(),
      'payment.currency': request.currency,
      'customer.id': request.customer.id
    }
  );
}
```

## 📝 Logging Strategy

### Structured Logging Configuration

```typescript
// Winston logger configuration
import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, correlationId, ...meta }) => {
    return JSON.stringify({
      timestamp,
      level,
      message,
      correlationId,
      service: 'payment-backend',
      ...meta
    });
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'development' 
        ? winston.format.combine(winston.format.colorize(), winston.format.simple())
        : logFormat
    }),
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5
    }),
    new winston.transports.File({
      filename: 'logs/app.log',
      maxsize: 10485760, // 10MB
      maxFiles: 10
    })
  ]
});
```

### Log Levels and Categories

#### Error Logs (level: error)
```typescript
// Payment processing errors
logger.error('Payment processing failed', {
  correlationId,
  transactionId,
  errorCode: 'CARD_DECLINED',
  errorMessage: 'Insufficient funds',
  customerId,
  amount,
  stack: error.stack
});

// System errors
logger.error('Database connection failed', {
  correlationId,
  error: error.message,
  connectionPool: 'primary',
  retryAttempt: 3
});
```

#### Warning Logs (level: warn)
```typescript
// Business logic warnings
logger.warn('Authorization expiring soon', {
  correlationId,
  authorizationId,
  expiresAt,
  hoursRemaining: 2
});

// Performance warnings
logger.warn('Slow database query detected', {
  correlationId,
  query: 'SELECT * FROM transactions',
  duration: 5.2,
  threshold: 1.0
});
```

#### Info Logs (level: info)
```typescript
// Business events
logger.info('Payment processed successfully', {
  correlationId,
  transactionId,
  amount,
  currency: 'USD',
  customerId,
  processingTime: 1.2
});

// System events
logger.info('Webhook event processed', {
  correlationId,
  eventId,
  eventType: 'payment.success',
  processingTime: 0.8
});
```

#### Debug Logs (level: debug)
```typescript
// Detailed debugging information
logger.debug('Authorize.Net API request', {
  correlationId,
  endpoint: '/transactions',
  requestPayload: sanitizedPayload,
  headers: sanitizedHeaders
});
```

### Security-Aware Logging

```typescript
// Sanitize sensitive data before logging
function sanitizeForLogging(data: any): any {
  const sanitized = { ...data };
  
  // Remove sensitive fields
  delete sanitized.cardNumber;
  delete sanitized.cvv;
  delete sanitized.ssn;
  delete sanitized.password;
  
  // Mask email addresses
  if (sanitized.email) {
    sanitized.email = maskEmail(sanitized.email);
  }
  
  // Truncate long strings
  Object.keys(sanitized).forEach(key => {
    if (typeof sanitized[key] === 'string' && sanitized[key].length > 1000) {
      sanitized[key] = sanitized[key].substring(0, 1000) + '...';
    }
  });
  
  return sanitized;
}

// Usage
logger.info('Processing payment', sanitizeForLogging({
  correlationId,
  customerId,
  amount,
  cardNumber: '4111111111111111', // This will be removed
  email: 'user@example.com' // This will be masked
}));
```

## 🔔 Alerting Strategy

### Critical Alerts (Immediate Response Required)

```yaml
# Payment processing failure rate
- alert: HighPaymentFailureRate
  expr: rate(payment_transactions_total{status="failed"}[5m]) / rate(payment_transactions_total[5m]) > 0.05
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: "High payment failure rate detected"
    description: "Payment failure rate is {{ $value | humanizePercentage }} over the last 5 minutes"

# Database connection issues
- alert: DatabaseConnectionFailure
  expr: database_connections_active == 0
  for: 30s
  labels:
    severity: critical
  annotations:
    summary: "Database connection failure"
    description: "No active database connections available"

# Queue processing delays
- alert: QueueProcessingDelay
  expr: queue_jobs_waiting{queue_name="webhook"} > 1000
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "Webhook queue processing delay"
    description: "{{ $value }} jobs waiting in webhook queue"
```

### Warning Alerts (Monitor Closely)

```yaml
# Slow API responses
- alert: SlowAPIResponses
  expr: histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m])) > 2
  for: 5m
  labels:
    severity: warning
  annotations:
    summary: "API responses are slow"
    description: "95th percentile response time is {{ $value }}s"

# High memory usage
- alert: HighMemoryUsage
  expr: memory_usage_bytes / (1024^3) > 1.5  # 1.5GB
  for: 10m
  labels:
    severity: warning
  annotations:
    summary: "High memory usage"
    description: "Memory usage is {{ $value | humanize }}GB"
```

## 📈 Monitoring Dashboards

### Payment Operations Dashboard

```json
{
  "dashboard": {
    "title": "Payment Operations",
    "panels": [
      {
        "title": "Transaction Volume",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(payment_transactions_total[5m])",
            "legendFormat": "{{type}} - {{status}}"
          }
        ]
      },
      {
        "title": "Payment Success Rate",
        "type": "singlestat",
        "targets": [
          {
            "expr": "rate(payment_transactions_total{status=\"success\"}[5m]) / rate(payment_transactions_total[5m])",
            "format": "percent"
          }
        ]
      },
      {
        "title": "Average Processing Time",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(payment_processing_duration_seconds_bucket[5m]))",
            "legendFormat": "95th percentile"
          }
        ]
      }
    ]
  }
}
```

### System Health Dashboard

```json
{
  "dashboard": {
    "title": "System Health",
    "panels": [
      {
        "title": "API Response Times",
        "type": "heatmap",
        "targets": [
          {
            "expr": "rate(http_request_duration_seconds_bucket[5m])",
            "format": "heatmap"
          }
        ]
      },
      {
        "title": "Database Performance",
        "type": "graph",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(database_query_duration_seconds_bucket[5m]))",
            "legendFormat": "Query Time (95th percentile)"
          }
        ]
      },
      {
        "title": "Queue Status",
        "type": "table",
        "targets": [
          {
            "expr": "queue_jobs_waiting",
            "format": "table"
          }
        ]
      }
    ]
  }
}
```

## 🔍 Health Check Implementation

```typescript
// Comprehensive health check endpoint
export class HealthService {
  async getHealthStatus(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkAuthorizeNet(),
      this.checkQueues()
    ]);

    const status: HealthStatus = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION || '1.0.0',
      dependencies: {},
      metrics: {
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage().heapUsed,
        activeConnections: await this.getActiveConnections()
      }
    };

    // Evaluate dependency health
    checks.forEach((check, index) => {
      const depName = ['database', 'redis', 'authorize_net', 'queues'][index];
      status.dependencies[depName] = check.status === 'fulfilled' ? 'healthy' : 'unhealthy';
      
      if (check.status === 'rejected') {
        status.status = status.status === 'healthy' ? 'degraded' : 'unhealthy';
      }
    });

    return status;
  }

  private async checkDatabase(): Promise<void> {
    await this.dataSource.query('SELECT 1');
  }

  private async checkRedis(): Promise<void> {
    await this.redis.ping();
  }

  private async checkAuthorizeNet(): Promise<void> {
    // Lightweight API call to verify connectivity
    await this.authorizeNet.ping();
  }

  private async checkQueues(): Promise<void> {
    const waitingJobs = await this.webhookQueue.waiting();
    if (waitingJobs > 10000) {
      throw new Error('Queue backlog too high');
    }
  }
}
```

## 📊 Performance Monitoring

### SLA Monitoring

```typescript
// SLA metrics calculation
export class SLAMonitor {
  async calculateSLA(timeWindow: string = '24h'): Promise<SLAMetrics> {
    const [availability, responseTime, errorRate] = await Promise.all([
      this.calculateAvailability(timeWindow),
      this.calculateResponseTime(timeWindow),
      this.calculateErrorRate(timeWindow)
    ]);

    return {
      availability: {
        target: 99.9,
        actual: availability,
        status: availability >= 99.9 ? 'met' : 'missed'
      },
      responseTime: {
        target: 500, // milliseconds
        actual: responseTime,
        status: responseTime <= 500 ? 'met' : 'missed'
      },
      errorRate: {
        target: 0.5, // percentage
        actual: errorRate,
        status: errorRate <= 0.5 ? 'met' : 'missed'
      }
    };
  }
}
```

This comprehensive observability strategy ensures full visibility into system performance, business metrics, and operational health, enabling proactive monitoring and rapid issue resolution.
