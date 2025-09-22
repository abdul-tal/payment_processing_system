# Distributed Tracing System Documentation

## Overview

This document describes the comprehensive distributed tracing system implemented for the payment processing backend. The system provides end-to-end request tracking, performance monitoring, and bottleneck detection using OpenTelemetry standards.

## Architecture

### Core Components

1. **TracingService** - Singleton service managing OpenTelemetry spans and trace context
2. **MetricsService** - Performance metrics collection and analysis
3. **AlertService** - Bottleneck detection and alerting system
4. **Enhanced Middleware** - Request/response logging with trace context
5. **Correlation ID Middleware** - Request correlation and trace propagation

### Tracing Flow

```
Request → Correlation ID → Tracing Span → Service Layer → Database/External APIs → Response
    ↓            ↓              ↓              ↓                    ↓              ↓
Correlation   Trace ID      Span Context   Child Spans        Attributes      Metrics
```

## Features Implemented

### 1. Correlation ID Management
- **File**: `src/middleware/correlationId.ts`
- Generates or propagates correlation IDs across requests
- Adds trace context to HTTP headers (`X-Trace-ID`, `X-Span-ID`)
- Enriches active spans with request attributes
- Logs request lifecycle events with trace context

### 2. Distributed Tracing Infrastructure
- **File**: `src/config/tracing.ts`
- OpenTelemetry NodeSDK configuration
- Jaeger and OTLP exporter support
- Automatic instrumentation for Express, HTTP, Redis, PostgreSQL
- Resource attributes (service name, version, environment)

### 3. Tracing Service
- **File**: `src/services/TracingService.ts`
- Centralized span management
- Specialized span types: HTTP, Database, Payment, Subscription, Webhook
- Context propagation and attribute management
- Exception recording and error handling

### 4. Enhanced Request/Response Logging
- **File**: `src/middleware/requestLogging.ts`
- Comprehensive request/response logging with trace context
- Performance metrics capture (duration, response size)
- Slow request detection and alerting
- Database and external API logging utilities

### 5. Performance Metrics Collection
- **File**: `src/services/MetricsService.ts`
- Real-time performance metrics collection
- System metrics monitoring (memory, CPU)
- Request, database, and external API metrics
- Performance summary and analysis

### 6. Bottleneck Detection & Alerting
- **File**: `src/services/AlertService.ts`
- Automated bottleneck detection
- Configurable thresholds and severity levels
- Multiple alert types: response time, error rate, memory usage, etc.
- Alert correlation and resolution tracking

## Service Integration

### Payment Controller Tracing
- **File**: `src/controllers/paymentController.ts`
- Tracing spans for all payment operations
- Attributes: customer email, transaction IDs, amounts, currencies
- Error tracking and performance monitoring

### Subscription Controller Tracing
- **File**: `src/controllers/subscriptionController.ts`
- Tracing spans for subscription lifecycle operations
- Attributes: customer email, subscription IDs, billing intervals
- Service call instrumentation

### Webhook Processing Tracing
- **File**: `src/controllers/webhookController.ts`
- Webhook event processing instrumentation
- Event type and payload size tracking
- Queue integration tracing

## Configuration

### Environment Variables

```bash
# Distributed Tracing
SERVICE_NAME=payment-backend
SERVICE_VERSION=1.0.0
JAEGER_ENDPOINT=http://localhost:14268/api/traces
OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTLP_HEADERS={"authorization":"Bearer your_token"}

# Performance Monitoring
RESPONSE_TIME_THRESHOLD=5000
ERROR_RATE_THRESHOLD=0.1
MEMORY_USAGE_THRESHOLD=0.8
DB_QUERY_THRESHOLD=1000
EXTERNAL_API_THRESHOLD=10000
QUEUE_BACKLOG_THRESHOLD=100
BOTTLENECK_CHECK_INTERVAL=60000
SLOW_REQUEST_THRESHOLD_MS=5000

# Enhanced Logging
LOG_RESPONSE_BODY=false
LOG_TRACE_CONTEXT=true
```

### Trace Exporters

#### Jaeger (Default)
- Endpoint: `http://localhost:14268/api/traces`
- UI: `http://localhost:16686`

#### OTLP (OpenTelemetry Protocol)
- Endpoint: `http://localhost:4318/v1/traces`
- Supports various backends (Jaeger, Zipkin, etc.)

## Usage Examples

### Manual Span Creation

```typescript
import { tracingService } from '../services/TracingService';

// Create a custom span
const span = tracingService.startSpan('custom-operation', {
  'operation.type': 'business_logic',
  'user.id': userId,
});

try {
  const result = await tracingService.executeInSpan(span, async () => {
    // Your business logic here
    return await performOperation();
  });
  
  // Add custom attributes
  tracingService.addAttributesToActiveSpan({
    'operation.result': 'success',
    'result.count': result.length,
  });
  
  return result;
} catch (error) {
  // Exception is automatically recorded
  throw error;
}
```

### Metrics Collection

```typescript
import { metricsService } from '../services/MetricsService';

// Record custom metrics
metricsService.recordMetric('payment_processed', 1, 'count', {
  'payment.type': 'credit_card',
  'payment.amount': '100.00',
});

// Record request metrics (automatically done by middleware)
metricsService.recordRequestMetric(
  '/api/v1/payments',
  'POST',
  200,
  1500, // duration in ms
  2048, // response size in bytes
  correlationId
);
```

### Alert Creation

```typescript
import { alertService, AlertType, AlertSeverity } from '../services/AlertService';

// Create custom alert
alertService.createAlert(
  AlertType.HIGH_RESPONSE_TIME,
  AlertSeverity.HIGH,
  'Payment processing is taking too long',
  {
    avgResponseTime: 8000,
    threshold: 5000,
    affectedEndpoints: ['/api/v1/payments'],
  }
);
```

## Monitoring and Observability

### Key Metrics Tracked

1. **Request Metrics**
   - Response times (average, percentiles)
   - Error rates by endpoint
   - Request volume and patterns
   - Slow request detection

2. **Database Metrics**
   - Query execution times
   - Connection pool usage
   - Slow query detection
   - Error rates

3. **External API Metrics**
   - API call durations
   - Success/failure rates
   - Timeout detection
   - Service availability

4. **System Metrics**
   - Memory usage (heap, RSS)
   - CPU utilization
   - Process uptime
   - Garbage collection metrics

### Alert Types

- `HIGH_RESPONSE_TIME` - Slow API responses
- `HIGH_ERROR_RATE` - Increased error rates
- `HIGH_MEMORY_USAGE` - Memory consumption issues
- `DATABASE_SLOW_QUERY` - Database performance issues
- `EXTERNAL_API_FAILURE` - Third-party service issues
- `QUEUE_BACKLOG` - Message queue congestion
- `BOTTLENECK_DETECTED` - Multiple performance issues

## Deployment Considerations

### Development Environment
1. Start Jaeger: `docker run -d -p 16686:16686 -p 14268:14268 jaegertracing/all-in-one:latest`
2. Configure environment variables
3. Start application with tracing enabled

### Production Environment
1. Deploy tracing backend (Jaeger, Zipkin, or cloud provider)
2. Configure OTLP endpoints and authentication
3. Set appropriate sampling rates
4. Configure alert notifications (email, Slack, PagerDuty)
5. Set up trace retention policies

### Performance Impact
- Minimal overhead (~1-3% CPU, ~5-10MB memory)
- Configurable sampling rates for high-traffic environments
- Asynchronous trace export to minimize latency impact

## Troubleshooting

### Common Issues

1. **Missing Traces**
   - Check exporter configuration
   - Verify network connectivity to tracing backend
   - Ensure proper environment variables

2. **High Memory Usage**
   - Adjust trace retention settings
   - Configure sampling rates
   - Monitor metrics cleanup intervals

3. **Performance Impact**
   - Reduce sampling rate in production
   - Optimize span attribute sizes
   - Use asynchronous exporters

### Debug Commands

```bash
# Check trace export status
curl http://localhost:3000/health

# View metrics summary
curl http://localhost:3000/api/v1/metrics/summary

# List active alerts
curl http://localhost:3000/api/v1/alerts
```

## Best Practices

1. **Span Naming**: Use descriptive, hierarchical names
2. **Attributes**: Add meaningful business context
3. **Error Handling**: Always record exceptions in spans
4. **Sampling**: Configure appropriate rates for production
5. **Security**: Avoid logging sensitive data in traces
6. **Performance**: Monitor tracing overhead and adjust accordingly

## Integration with Existing Systems

The tracing system integrates seamlessly with:
- Express.js middleware stack
- TypeORM database operations
- Redis caching and queues
- Authorize.Net payment processing
- Webhook event processing
- Error handling and logging

All existing functionality remains unchanged while gaining comprehensive observability.
