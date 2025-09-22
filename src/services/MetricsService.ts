import { logger } from '../config/logger';
import { tracingService } from './TracingService';

export interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: Date;
  labels?: Record<string, string>;
  traceId?: string;
  spanId?: string;
}

export interface SystemMetrics {
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  uptime: number;
  timestamp: Date;
}

export interface RequestMetrics {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  responseSize: number;
  timestamp: Date;
  traceId?: string;
  correlationId?: string;
}

export interface DatabaseMetrics {
  query: string;
  duration: number;
  success: boolean;
  timestamp: Date;
  traceId?: string;
}

export interface ExternalApiMetrics {
  service: string;
  endpoint: string;
  method: string;
  statusCode?: number;
  duration: number;
  success: boolean;
  timestamp: Date;
  traceId?: string;
}

/**
 * Service for collecting and managing performance metrics with tracing integration
 */
export class MetricsService {
  private static instance: MetricsService;
  private metrics: PerformanceMetric[] = [];
  private requestMetrics: RequestMetrics[] = [];
  private databaseMetrics: DatabaseMetrics[] = [];
  private externalApiMetrics: ExternalApiMetrics[] = [];
  private systemMetricsInterval?: NodeJS.Timeout;
  private metricsRetentionHours = 24;
  private maxMetricsCount = 10000;

  public static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }

  /**
   * Initialize metrics collection
   */
  public initialize(): void {
    // Start collecting system metrics every 30 seconds
    this.systemMetricsInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 30000);

    // Clean up old metrics every hour
    setInterval(() => {
      this.cleanupOldMetrics();
    }, 3600000);

    logger.info('MetricsService initialized');
  }

  /**
   * Stop metrics collection
   */
  public shutdown(): void {
    if (this.systemMetricsInterval) {
      clearInterval(this.systemMetricsInterval);
    }
    logger.info('MetricsService shutdown');
  }

  /**
   * Record a custom performance metric
   */
  public recordMetric(
    name: string,
    value: number,
    unit: string,
    labels?: Record<string, string>
  ): void {
    const metric: PerformanceMetric = {
      name,
      value,
      unit,
      timestamp: new Date(),
      labels,
      traceId: tracingService.getCurrentTraceId(),
      spanId: tracingService.getCurrentSpanId(),
    };

    this.metrics.push(metric);
    this.enforceMetricsLimit();

    // Add metric to active trace span
    tracingService.addEventToActiveSpan('metric_recorded', {
      'metric.name': name,
      'metric.value': value.toString(),
      'metric.unit': unit,
    });

    logger.debug('Performance metric recorded', {
      event: 'metric_recorded',
      metric: name,
      value,
      unit,
      labels,
      traceId: metric.traceId,
      spanId: metric.spanId,
    });
  }

  /**
   * Record HTTP request metrics
   */
  public recordRequestMetric(
    endpoint: string,
    method: string,
    statusCode: number,
    duration: number,
    responseSize: number,
    correlationId?: string
  ): void {
    const metric: RequestMetrics = {
      endpoint,
      method,
      statusCode,
      duration,
      responseSize,
      timestamp: new Date(),
      traceId: tracingService.getCurrentTraceId(),
      correlationId,
    };

    this.requestMetrics.push(metric);
    this.enforceMetricsLimit();

    // Record as custom metric
    this.recordMetric('http_request_duration', duration, 'ms', {
      endpoint,
      method,
      status_code: statusCode.toString(),
    });

    this.recordMetric('http_response_size', responseSize, 'bytes', {
      endpoint,
      method,
    });

    // Check for performance issues
    this.checkRequestPerformance(metric);
  }

  /**
   * Record database query metrics
   */
  public recordDatabaseMetric(
    query: string,
    duration: number,
    success: boolean
  ): void {
    const metric: DatabaseMetrics = {
      query: query.substring(0, 100), // Truncate for storage
      duration,
      success,
      timestamp: new Date(),
      traceId: tracingService.getCurrentTraceId(),
    };

    this.databaseMetrics.push(metric);
    this.enforceMetricsLimit();

    // Record as custom metric
    this.recordMetric('database_query_duration', duration, 'ms', {
      success: success.toString(),
    });

    // Check for slow queries
    this.checkDatabasePerformance(metric);
  }

  /**
   * Record external API call metrics
   */
  public recordExternalApiMetric(
    service: string,
    endpoint: string,
    method: string,
    statusCode: number | undefined,
    duration: number,
    success: boolean
  ): void {
    const metric: ExternalApiMetrics = {
      service,
      endpoint,
      method,
      statusCode,
      duration,
      success,
      timestamp: new Date(),
      traceId: tracingService.getCurrentTraceId(),
    };

    this.externalApiMetrics.push(metric);
    this.enforceMetricsLimit();

    // Record as custom metric
    this.recordMetric('external_api_duration', duration, 'ms', {
      service,
      method,
      success: success.toString(),
      status_code: statusCode?.toString() || 'unknown',
    });

    // Check for external API issues
    this.checkExternalApiPerformance(metric);
  }

  /**
   * Get performance summary for a time period
   */
  public getPerformanceSummary(hours: number = 1): {
    requests: {
      total: number;
      avgDuration: number;
      errorRate: number;
      slowRequests: number;
    };
    database: {
      total: number;
      avgDuration: number;
      errorRate: number;
      slowQueries: number;
    };
    externalApi: {
      total: number;
      avgDuration: number;
      errorRate: number;
      slowCalls: number;
    };
    system: SystemMetrics | null;
  } {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);

    // Request metrics summary
    const recentRequests = this.requestMetrics.filter(m => m.timestamp > cutoff);
    const requestErrors = recentRequests.filter(m => m.statusCode >= 400);
    const slowRequests = recentRequests.filter(m => m.duration > 5000);
    const avgRequestDuration = recentRequests.length > 0
      ? recentRequests.reduce((sum, m) => sum + m.duration, 0) / recentRequests.length
      : 0;

    // Database metrics summary
    const recentDbQueries = this.databaseMetrics.filter(m => m.timestamp > cutoff);
    const dbErrors = recentDbQueries.filter(m => !m.success);
    const slowQueries = recentDbQueries.filter(m => m.duration > 1000);
    const avgDbDuration = recentDbQueries.length > 0
      ? recentDbQueries.reduce((sum, m) => sum + m.duration, 0) / recentDbQueries.length
      : 0;

    // External API metrics summary
    const recentApiCalls = this.externalApiMetrics.filter(m => m.timestamp > cutoff);
    const apiErrors = recentApiCalls.filter(m => !m.success);
    const slowApiCalls = recentApiCalls.filter(m => m.duration > 10000);
    const avgApiDuration = recentApiCalls.length > 0
      ? recentApiCalls.reduce((sum, m) => sum + m.duration, 0) / recentApiCalls.length
      : 0;

    return {
      requests: {
        total: recentRequests.length,
        avgDuration: Math.round(avgRequestDuration),
        errorRate: recentRequests.length > 0 ? requestErrors.length / recentRequests.length : 0,
        slowRequests: slowRequests.length,
      },
      database: {
        total: recentDbQueries.length,
        avgDuration: Math.round(avgDbDuration),
        errorRate: recentDbQueries.length > 0 ? dbErrors.length / recentDbQueries.length : 0,
        slowQueries: slowQueries.length,
      },
      externalApi: {
        total: recentApiCalls.length,
        avgDuration: Math.round(avgApiDuration),
        errorRate: recentApiCalls.length > 0 ? apiErrors.length / recentApiCalls.length : 0,
        slowCalls: slowApiCalls.length,
      },
      system: this.getLatestSystemMetrics(),
    };
  }

  /**
   * Collect current system metrics
   */
  private collectSystemMetrics(): void {
    const systemMetrics: SystemMetrics = {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      timestamp: new Date(),
    };

    // Record individual metrics
    this.recordMetric('memory_heap_used', systemMetrics.memoryUsage.heapUsed, 'bytes');
    this.recordMetric('memory_heap_total', systemMetrics.memoryUsage.heapTotal, 'bytes');
    this.recordMetric('memory_rss', systemMetrics.memoryUsage.rss, 'bytes');
    this.recordMetric('cpu_user', systemMetrics.cpuUsage.user, 'microseconds');
    this.recordMetric('cpu_system', systemMetrics.cpuUsage.system, 'microseconds');
    this.recordMetric('uptime', systemMetrics.uptime, 'seconds');

    // Check for memory issues
    const memoryUsagePercent = systemMetrics.memoryUsage.heapUsed / systemMetrics.memoryUsage.heapTotal;
    if (memoryUsagePercent > 0.8) {
      logger.warn('High memory usage detected', {
        event: 'high_memory_usage',
        heapUsed: systemMetrics.memoryUsage.heapUsed,
        heapTotal: systemMetrics.memoryUsage.heapTotal,
        usagePercent: Math.round(memoryUsagePercent * 100),
        traceId: tracingService.getCurrentTraceId(),
      });
    }
  }

  /**
   * Get latest system metrics
   */
  private getLatestSystemMetrics(): SystemMetrics | null {
    return {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      uptime: process.uptime(),
      timestamp: new Date(),
    };
  }

  /**
   * Check request performance and log issues
   */
  private checkRequestPerformance(metric: RequestMetrics): void {
    // Check for slow requests
    if (metric.duration > 5000) {
      logger.warn('Slow request detected', {
        event: 'slow_request',
        endpoint: metric.endpoint,
        method: metric.method,
        duration: metric.duration,
        traceId: metric.traceId,
        correlationId: metric.correlationId,
      });
    }

    // Check for large responses
    if (metric.responseSize > 1024 * 1024) { // 1MB
      logger.warn('Large response detected', {
        event: 'large_response',
        endpoint: metric.endpoint,
        method: metric.method,
        responseSize: metric.responseSize,
        traceId: metric.traceId,
      });
    }
  }

  /**
   * Check database performance and log issues
   */
  private checkDatabasePerformance(metric: DatabaseMetrics): void {
    if (metric.duration > 1000) {
      logger.warn('Slow database query detected', {
        event: 'slow_database_query',
        query: metric.query,
        duration: metric.duration,
        traceId: metric.traceId,
      });
    }
  }

  /**
   * Check external API performance and log issues
   */
  private checkExternalApiPerformance(metric: ExternalApiMetrics): void {
    if (metric.duration > 10000) {
      logger.warn('Slow external API call detected', {
        event: 'slow_external_api',
        service: metric.service,
        endpoint: metric.endpoint,
        duration: metric.duration,
        traceId: metric.traceId,
      });
    }

    if (!metric.success) {
      logger.error('External API call failed', {
        event: 'external_api_failure',
        service: metric.service,
        endpoint: metric.endpoint,
        statusCode: metric.statusCode,
        traceId: metric.traceId,
      });
    }
  }

  /**
   * Clean up old metrics to prevent memory issues
   */
  private cleanupOldMetrics(): void {
    const cutoff = new Date(Date.now() - this.metricsRetentionHours * 60 * 60 * 1000);

    const beforeCount = this.metrics.length + this.requestMetrics.length + 
                       this.databaseMetrics.length + this.externalApiMetrics.length;

    this.metrics = this.metrics.filter(m => m.timestamp > cutoff);
    this.requestMetrics = this.requestMetrics.filter(m => m.timestamp > cutoff);
    this.databaseMetrics = this.databaseMetrics.filter(m => m.timestamp > cutoff);
    this.externalApiMetrics = this.externalApiMetrics.filter(m => m.timestamp > cutoff);

    const afterCount = this.metrics.length + this.requestMetrics.length + 
                      this.databaseMetrics.length + this.externalApiMetrics.length;

    if (beforeCount > afterCount) {
      logger.debug('Cleaned up old metrics', {
        event: 'metrics_cleanup',
        removed: beforeCount - afterCount,
        remaining: afterCount,
      });
    }
  }

  /**
   * Enforce maximum metrics count to prevent memory issues
   */
  private enforceMetricsLimit(): void {
    const totalMetrics = this.metrics.length + this.requestMetrics.length + 
                        this.databaseMetrics.length + this.externalApiMetrics.length;

    if (totalMetrics > this.maxMetricsCount) {
      // Remove oldest metrics from each category
      const removeCount = Math.ceil((totalMetrics - this.maxMetricsCount) / 4);
      
      this.metrics = this.metrics.slice(removeCount);
      this.requestMetrics = this.requestMetrics.slice(removeCount);
      this.databaseMetrics = this.databaseMetrics.slice(removeCount);
      this.externalApiMetrics = this.externalApiMetrics.slice(removeCount);
    }
  }
}

// Export singleton instance
export const metricsService = MetricsService.getInstance();
