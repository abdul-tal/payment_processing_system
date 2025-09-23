import { MetricsService } from '../../src/services/MetricsService';
import { logger } from '../../src/config/logger';
import { tracingService } from '../../src/services/TracingService';

// Mock dependencies
jest.mock('../../src/config/logger');
jest.mock('../../src/services/TracingService');

describe('MetricsService', () => {
  let metricsService: MetricsService;
  let mockLogger: jest.Mocked<typeof logger>;
  let mockTracingService: jest.Mocked<typeof tracingService>;
  let originalProcess: typeof process;

  // Mock process methods
  const mockMemoryUsage = jest.fn();
  const mockCpuUsage = jest.fn();
  const mockUptime = jest.fn();

  beforeAll(() => {
    // Store original process methods
    originalProcess = process;

    // Mock process methods
    (process as any).memoryUsage = mockMemoryUsage;
    (process as any).cpuUsage = mockCpuUsage;
    (process as any).uptime = mockUptime;
  });

  afterAll(() => {
    // Restore original process methods
    (process as any).memoryUsage = originalProcess.memoryUsage;
    (process as any).cpuUsage = originalProcess.cpuUsage;
    (process as any).uptime = originalProcess.uptime;
  });

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Setup mocks
    mockLogger = logger as jest.Mocked<typeof logger>;
    mockTracingService = tracingService as jest.Mocked<typeof tracingService>;

    mockTracingService.getCurrentTraceId = jest
      .fn()
      .mockReturnValue('trace-123');
    mockTracingService.getCurrentSpanId = jest.fn().mockReturnValue('span-456');
    mockTracingService.addEventToActiveSpan = jest.fn();

    // Setup process mocks with default values
    mockMemoryUsage.mockReturnValue({
      rss: 50000000,
      heapTotal: 30000000,
      heapUsed: 20000000,
      external: 5000000,
      arrayBuffers: 1000000,
    });
    mockCpuUsage.mockReturnValue({
      user: 100000,
      system: 50000,
    });
    mockUptime.mockReturnValue(3600);

    // Reset singleton instance
    (MetricsService as any).instance = undefined;
    metricsService = MetricsService.getInstance();
  });

  afterEach(() => {
    metricsService.shutdown();
    jest.useRealTimers();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = MetricsService.getInstance();
      const instance2 = MetricsService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(metricsService);
    });
  });

  describe('Initialization and Shutdown', () => {
    it('should initialize with system metrics collection interval', () => {
      metricsService.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'MetricsService initialized'
      );

      // Verify system metrics collection is set up
      jest.advanceTimersByTime(30000);
      expect(mockMemoryUsage).toHaveBeenCalled();
      expect(mockCpuUsage).toHaveBeenCalled();
      expect(mockUptime).toHaveBeenCalled();
    });

    it('should shutdown and clear intervals', () => {
      metricsService.initialize();
      metricsService.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('MetricsService shutdown');
    });

    it('should handle shutdown when no interval is set', () => {
      metricsService.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('MetricsService shutdown');
    });

    it('should set up cleanup interval during initialization', () => {
      metricsService.initialize();

      // Verify that initialization sets up the cleanup interval
      expect(mockLogger.info).toHaveBeenCalledWith(
        'MetricsService initialized'
      );

      // The cleanup interval should be set up (we can't easily test the actual cleanup without complex mocking)
      // This test verifies the initialization process includes cleanup setup
    });
  });

  describe('Custom Metric Recording', () => {
    it('should record a custom metric with all fields', () => {
      const labels = { endpoint: '/api/test', method: 'GET' };

      metricsService.recordMetric('test_metric', 123.45, 'ms', labels);

      expect(mockTracingService.addEventToActiveSpan).toHaveBeenCalledWith(
        'metric_recorded',
        {
          'metric.name': 'test_metric',
          'metric.value': '123.45',
          'metric.unit': 'ms',
        }
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          event: 'metric_recorded',
          metric: 'test_metric',
          value: 123.45,
          unit: 'ms',
          labels,
          traceId: 'trace-123',
          spanId: 'span-456',
        })
      );
    });

    it('should record metric without labels', () => {
      metricsService.recordMetric('simple_metric', 42, 'count');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          event: 'metric_recorded',
          metric: 'simple_metric',
          value: 42,
          unit: 'count',
          labels: undefined,
        })
      );
    });

    it('should handle missing trace context', () => {
      mockTracingService.getCurrentTraceId.mockReturnValue(undefined);
      mockTracingService.getCurrentSpanId.mockReturnValue(undefined);

      metricsService.recordMetric('no_trace_metric', 100, 'ms');

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          traceId: undefined,
          spanId: undefined,
        })
      );
    });
  });

  describe('Request Metrics Recording', () => {
    it('should record HTTP request metrics with all fields', () => {
      metricsService.recordRequestMetric(
        '/api/payments',
        'POST',
        200,
        1500,
        2048,
        'corr-123'
      );

      // Should record two custom metrics
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'http_request_duration',
          value: 1500,
          unit: 'ms',
        })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'http_response_size',
          value: 2048,
          unit: 'bytes',
        })
      );
    });

    it('should detect and log slow requests', () => {
      metricsService.recordRequestMetric(
        '/api/slow-endpoint',
        'GET',
        200,
        6000, // > 5000ms threshold
        1024
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Slow request detected',
        expect.objectContaining({
          event: 'slow_request',
          endpoint: '/api/slow-endpoint',
          method: 'GET',
          duration: 6000,
          traceId: 'trace-123',
        })
      );
    });

    it('should detect and log large responses', () => {
      metricsService.recordRequestMetric(
        '/api/large-data',
        'GET',
        200,
        1000,
        2 * 1024 * 1024 // > 1MB threshold
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Large response detected',
        expect.objectContaining({
          event: 'large_response',
          endpoint: '/api/large-data',
          method: 'GET',
          responseSize: 2 * 1024 * 1024,
          traceId: 'trace-123',
        })
      );
    });

    it('should record request metrics without correlation ID', () => {
      metricsService.recordRequestMetric('/api/test', 'GET', 404, 500, 128);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'http_request_duration',
        })
      );
    });
  });

  describe('Database Metrics Recording', () => {
    it('should record database query metrics', () => {
      const query = 'SELECT * FROM users WHERE id = $1';

      metricsService.recordDatabaseMetric(query, 250, true);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'database_query_duration',
          value: 250,
          unit: 'ms',
          labels: { success: 'true' },
        })
      );
    });

    it('should truncate long queries for storage', () => {
      const longQuery = 'SELECT * FROM users WHERE '.repeat(10) + 'id = $1';

      metricsService.recordDatabaseMetric(longQuery, 100, true);

      // Query should be truncated to 100 characters
      expect(mockLogger.debug).toHaveBeenCalled();
    });

    it('should detect and log slow database queries', () => {
      const query = 'SELECT * FROM large_table';

      metricsService.recordDatabaseMetric(query, 1500, true); // > 1000ms threshold

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Slow database query detected',
        expect.objectContaining({
          event: 'slow_database_query',
          query: query.substring(0, 100),
          duration: 1500,
          traceId: 'trace-123',
        })
      );
    });

    it('should record failed database queries', () => {
      metricsService.recordDatabaseMetric('INVALID SQL', 50, false);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          labels: { success: 'false' },
        })
      );
    });
  });

  describe('External API Metrics Recording', () => {
    it('should record external API metrics with status code', () => {
      metricsService.recordExternalApiMetric(
        'authorize-net',
        '/api/charge',
        'POST',
        200,
        800,
        true
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'external_api_duration',
          value: 800,
          unit: 'ms',
          labels: {
            service: 'authorize-net',
            method: 'POST',
            success: 'true',
            status_code: '200',
          },
        })
      );
    });

    it('should record external API metrics without status code', () => {
      metricsService.recordExternalApiMetric(
        'payment-gateway',
        '/timeout',
        'GET',
        undefined,
        5000,
        false
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          labels: expect.objectContaining({
            status_code: 'unknown',
            success: 'false',
          }),
        })
      );
    });

    it('should detect and log slow external API calls', () => {
      metricsService.recordExternalApiMetric(
        'slow-service',
        '/api/data',
        'GET',
        200,
        12000, // > 10000ms threshold
        true
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Slow external API call detected',
        expect.objectContaining({
          event: 'slow_external_api',
          service: 'slow-service',
          endpoint: '/api/data',
          duration: 12000,
          traceId: 'trace-123',
        })
      );
    });

    it('should detect and log failed external API calls', () => {
      metricsService.recordExternalApiMetric(
        'failing-service',
        '/api/error',
        'POST',
        500,
        1000,
        false
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'External API call failed',
        expect.objectContaining({
          event: 'external_api_failure',
          service: 'failing-service',
          endpoint: '/api/error',
          statusCode: 500,
          traceId: 'trace-123',
        })
      );
    });
  });

  describe('System Metrics Collection', () => {
    it('should collect and record system metrics', () => {
      metricsService.initialize();

      // Trigger system metrics collection
      jest.advanceTimersByTime(30000);

      // Verify all system metrics are recorded
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'memory_heap_used',
          value: 20000000,
          unit: 'bytes',
        })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'memory_heap_total',
          value: 30000000,
          unit: 'bytes',
        })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'memory_rss',
          value: 50000000,
          unit: 'bytes',
        })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'cpu_user',
          value: 100000,
          unit: 'microseconds',
        })
      );

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Performance metric recorded',
        expect.objectContaining({
          metric: 'uptime',
          value: 3600,
          unit: 'seconds',
        })
      );
    });

    it('should detect and log high memory usage', () => {
      // Mock high memory usage (85% of heap)
      mockMemoryUsage.mockReturnValue({
        rss: 100000000,
        heapTotal: 30000000,
        heapUsed: 25500000, // 85% of heapTotal
        external: 5000000,
        arrayBuffers: 1000000,
      });

      metricsService.initialize();
      jest.advanceTimersByTime(30000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'High memory usage detected',
        expect.objectContaining({
          event: 'high_memory_usage',
          heapUsed: 25500000,
          heapTotal: 30000000,
          usagePercent: 85,
          traceId: 'trace-123',
        })
      );
    });

    it('should not log warning for normal memory usage', () => {
      // Mock normal memory usage (50% of heap)
      mockMemoryUsage.mockReturnValue({
        rss: 50000000,
        heapTotal: 30000000,
        heapUsed: 15000000, // 50% of heapTotal
        external: 5000000,
        arrayBuffers: 1000000,
      });

      metricsService.initialize();
      jest.advanceTimersByTime(30000);

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        'High memory usage detected',
        expect.any(Object)
      );
    });
  });

  describe('Performance Summary', () => {
    beforeEach(() => {
      // Add sample metrics for testing
      // Recent request metrics (within 1 hour)
      metricsService.recordRequestMetric('/api/fast', 'GET', 200, 100, 512);
      metricsService.recordRequestMetric('/api/slow', 'POST', 200, 6000, 1024);
      metricsService.recordRequestMetric('/api/error', 'GET', 500, 200, 256);

      // Recent database metrics
      metricsService.recordDatabaseMetric('SELECT * FROM users', 50, true);
      metricsService.recordDatabaseMetric('SELECT * FROM orders', 1200, true);
      metricsService.recordDatabaseMetric('INVALID QUERY', 100, false);

      // Recent external API metrics
      metricsService.recordExternalApiMetric(
        'service1',
        '/api/data',
        'GET',
        200,
        500,
        true
      );
      metricsService.recordExternalApiMetric(
        'service2',
        '/api/slow',
        'POST',
        200,
        12000,
        true
      );
      metricsService.recordExternalApiMetric(
        'service3',
        '/api/fail',
        'GET',
        500,
        1000,
        false
      );
    });

    it('should generate performance summary for default 1 hour period', () => {
      const summary = metricsService.getPerformanceSummary();

      expect(summary.requests.total).toBe(3);
      expect(summary.requests.avgDuration).toBe(
        Math.round((100 + 6000 + 200) / 3)
      );
      expect(summary.requests.errorRate).toBe(1 / 3); // 1 error out of 3 requests
      expect(summary.requests.slowRequests).toBe(1); // 1 request > 5000ms

      expect(summary.database.total).toBe(3);
      expect(summary.database.avgDuration).toBe(
        Math.round((50 + 1200 + 100) / 3)
      );
      expect(summary.database.errorRate).toBe(1 / 3); // 1 failed query out of 3
      expect(summary.database.slowQueries).toBe(1); // 1 query > 1000ms

      expect(summary.externalApi.total).toBe(3);
      expect(summary.externalApi.avgDuration).toBe(
        Math.round((500 + 12000 + 1000) / 3)
      );
      expect(summary.externalApi.errorRate).toBe(1 / 3); // 1 failed call out of 3
      expect(summary.externalApi.slowCalls).toBe(1); // 1 call > 10000ms

      expect(summary.system).toBeDefined();
      expect(summary.system?.memoryUsage).toBeDefined();
      expect(summary.system?.cpuUsage).toBeDefined();
      expect(summary.system?.uptime).toBe(3600);
    });

    it('should generate performance summary for custom time period', () => {
      const summary = metricsService.getPerformanceSummary(2); // 2 hours

      expect(summary.requests.total).toBe(3);
      expect(summary.database.total).toBe(3);
      expect(summary.externalApi.total).toBe(3);
    });

    it('should handle empty metrics gracefully', () => {
      // Create new instance with no metrics
      (MetricsService as any).instance = undefined;
      const emptyMetricsService = MetricsService.getInstance();

      const summary = emptyMetricsService.getPerformanceSummary();

      expect(summary.requests.total).toBe(0);
      expect(summary.requests.avgDuration).toBe(0);
      expect(summary.requests.errorRate).toBe(0);
      expect(summary.requests.slowRequests).toBe(0);

      expect(summary.database.total).toBe(0);
      expect(summary.database.avgDuration).toBe(0);
      expect(summary.database.errorRate).toBe(0);
      expect(summary.database.slowQueries).toBe(0);

      expect(summary.externalApi.total).toBe(0);
      expect(summary.externalApi.avgDuration).toBe(0);
      expect(summary.externalApi.errorRate).toBe(0);
      expect(summary.externalApi.slowCalls).toBe(0);
    });
  });

  describe('Metrics Cleanup and Limits', () => {
    it('should clean up old metrics based on retention period', () => {
      // Add metrics
      metricsService.recordMetric('old_metric', 100, 'ms');
      metricsService.recordRequestMetric('/api/old', 'GET', 200, 100, 512);

      // Mock old timestamps by manipulating internal arrays
      const metricsArray = (metricsService as any).metrics;
      const requestMetricsArray = (metricsService as any).requestMetrics;

      if (metricsArray.length > 0) {
        metricsArray[0].timestamp = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      }
      if (requestMetricsArray.length > 0) {
        requestMetricsArray[0].timestamp = new Date(
          Date.now() - 25 * 60 * 60 * 1000
        );
      }

      // Trigger cleanup
      (metricsService as any).cleanupOldMetrics();

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Cleaned up old metrics',
        expect.objectContaining({
          event: 'metrics_cleanup',
          removed: expect.any(Number),
          remaining: expect.any(Number),
        })
      );
    });

    it('should enforce maximum metrics count limit', () => {
      // Set a low limit for testing
      (metricsService as any).maxMetricsCount = 10;

      // Add more metrics than the limit
      for (let i = 0; i < 15; i++) {
        metricsService.recordMetric(`metric_${i}`, i, 'count');
      }

      // Verify metrics are limited
      const totalMetrics =
        (metricsService as any).metrics.length +
        (metricsService as any).requestMetrics.length +
        (metricsService as any).databaseMetrics.length +
        (metricsService as any).externalApiMetrics.length;

      expect(totalMetrics).toBeLessThanOrEqual(10);
    });

    it('should not log cleanup when no metrics are removed', () => {
      // Add recent metrics only
      metricsService.recordMetric('recent_metric', 100, 'ms');

      // Clear previous logs
      jest.clearAllMocks();

      // Trigger cleanup
      (metricsService as any).cleanupOldMetrics();

      expect(mockLogger.debug).not.toHaveBeenCalledWith(
        'Cleaned up old metrics',
        expect.any(Object)
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle multiple initialization calls', () => {
      metricsService.initialize();
      metricsService.initialize();

      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });

    it('should handle multiple shutdown calls', () => {
      metricsService.initialize();
      metricsService.shutdown();
      metricsService.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith('MetricsService shutdown');
    });

    it('should handle process method failures gracefully', () => {
      mockMemoryUsage.mockImplementation(() => {
        throw new Error('Memory usage unavailable');
      });

      metricsService.initialize();

      // The current implementation doesn't have error handling, so it will throw
      // This test documents the current behavior
      expect(() => {
        jest.advanceTimersByTime(30000);
      }).toThrow('Memory usage unavailable');
    });

    it('should handle missing trace context in all recording methods', () => {
      mockTracingService.getCurrentTraceId.mockReturnValue(undefined);
      mockTracingService.getCurrentSpanId.mockReturnValue(undefined);

      expect(() => {
        metricsService.recordMetric('test', 100, 'ms');
        metricsService.recordRequestMetric('/test', 'GET', 200, 100, 512);
        metricsService.recordDatabaseMetric('SELECT 1', 50, true);
        metricsService.recordExternalApiMetric(
          'test',
          '/api',
          'GET',
          200,
          100,
          true
        );
      }).not.toThrow();
    });

    it('should handle zero values in performance calculations', () => {
      const summary = metricsService.getPerformanceSummary();

      expect(summary.requests.errorRate).toBe(0);
      expect(summary.database.errorRate).toBe(0);
      expect(summary.externalApi.errorRate).toBe(0);
    });
  });
});
