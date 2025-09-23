import {
  AlertService,
  AlertType,
  AlertSeverity,
  Alert,
} from '../../src/services/AlertService';
import { logger } from '../../src/config/logger';
import { tracingService } from '../../src/services/TracingService';
import { metricsService } from '../../src/services/MetricsService';

// Mock external dependencies
jest.mock('../../src/config/logger');
jest.mock('../../src/services/TracingService');
jest.mock('../../src/services/MetricsService');

// Mock crypto.randomUUID
let uuidCounter = 0;
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: jest.fn(() => `test-uuid-${++uuidCounter}`),
  },
});

// Mock environment variables
const originalEnv = process.env;

describe('AlertService', () => {
  let alertService: AlertService;
  let mockLogger: jest.Mocked<typeof logger>;
  let mockTracingService: jest.Mocked<typeof tracingService>;
  let mockMetricsService: jest.Mocked<typeof metricsService>;

  beforeEach(() => {
    // Reset environment variables
    process.env = { ...originalEnv };

    // Clear all mocks
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Setup mocks
    mockLogger = logger as jest.Mocked<typeof logger>;
    mockTracingService = tracingService as jest.Mocked<typeof tracingService>;
    mockMetricsService = metricsService as jest.Mocked<typeof metricsService>;

    mockTracingService.getCurrentTraceId = jest
      .fn()
      .mockReturnValue('trace-123');
    mockTracingService.startSpan = jest
      .fn()
      .mockReturnValue({ spanId: 'span-123' });
    mockTracingService.executeInSpan = jest
      .fn()
      .mockImplementation((_span, fn) => fn());
    mockTracingService.addEventToActiveSpan = jest.fn();

    // Reset singleton instance
    (AlertService as any).instance = undefined;
    alertService = AlertService.getInstance();
  });

  afterEach(() => {
    process.env = originalEnv;
    jest.useRealTimers();
    alertService.shutdown();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = AlertService.getInstance();
      const instance2 = AlertService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(alertService);
    });

    it('should create instance with default configuration when no env vars are set', () => {
      const service = new AlertService();
      const config = (service as any).config;

      expect(config.responseTimeThreshold).toBe(5000);
      expect(config.errorRateThreshold).toBe(0.1);
      expect(config.memoryUsageThreshold).toBe(0.8);
      expect(config.databaseQueryThreshold).toBe(1000);
      expect(config.externalApiThreshold).toBe(10000);
      expect(config.queueBacklogThreshold).toBe(100);
      expect(config.checkIntervalMs).toBe(60000);
    });

    it('should create instance with custom configuration from env vars', () => {
      process.env['RESPONSE_TIME_THRESHOLD'] = '3000';
      process.env['ERROR_RATE_THRESHOLD'] = '0.05';
      process.env['MEMORY_USAGE_THRESHOLD'] = '0.9';
      process.env['DB_QUERY_THRESHOLD'] = '500';
      process.env['EXTERNAL_API_THRESHOLD'] = '8000';
      process.env['QUEUE_BACKLOG_THRESHOLD'] = '50';
      process.env['BOTTLENECK_CHECK_INTERVAL'] = '30000';

      const service = new AlertService();
      const config = (service as any).config;

      expect(config.responseTimeThreshold).toBe(3000);
      expect(config.errorRateThreshold).toBe(0.05);
      expect(config.memoryUsageThreshold).toBe(0.9);
      expect(config.databaseQueryThreshold).toBe(500);
      expect(config.externalApiThreshold).toBe(8000);
      expect(config.queueBacklogThreshold).toBe(50);
      expect(config.checkIntervalMs).toBe(30000);
    });
  });

  describe('Initialization and Shutdown', () => {
    it('should initialize with interval and log initialization', () => {
      alertService.initialize();

      expect(jest.getTimerCount()).toBe(1);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'AlertService initialized',
        expect.objectContaining({
          config: expect.any(Object),
        })
      );
    });

    it('should shutdown and clear interval', () => {
      alertService.initialize();
      const timerCount = jest.getTimerCount();
      alertService.shutdown();

      expect(jest.getTimerCount()).toBe(timerCount - 1);
      expect(mockLogger.info).toHaveBeenCalledWith('AlertService shutdown');
    });

    it('should handle shutdown when no interval is set', () => {
      const timerCount = jest.getTimerCount();
      alertService.shutdown();

      expect(jest.getTimerCount()).toBe(timerCount);
      expect(mockLogger.info).toHaveBeenCalledWith('AlertService shutdown');
    });
  });

  describe('Alert Creation', () => {
    it('should create alert with all required fields', () => {
      const alert = alertService.createAlert(
        AlertType.HIGH_RESPONSE_TIME,
        AlertSeverity.HIGH,
        'Test alert message',
        { key: 'value' }
      );

      expect(alert).toEqual({
        id: expect.stringMatching(/^test-uuid-\d+$/),
        type: AlertType.HIGH_RESPONSE_TIME,
        severity: AlertSeverity.HIGH,
        message: 'Test alert message',
        details: { key: 'value' },
        timestamp: expect.any(Date),
        traceId: 'trace-123',
        resolved: false,
      });
    });

    it('should create alert with default empty details', () => {
      const alert = alertService.createAlert(
        AlertType.HIGH_ERROR_RATE,
        AlertSeverity.MEDIUM,
        'Test alert'
      );

      expect(alert.details).toEqual({});
    });

    it('should handle missing trace ID', () => {
      mockTracingService.getCurrentTraceId.mockReturnValue(undefined);

      const alert = alertService.createAlert(
        AlertType.HIGH_MEMORY_USAGE,
        AlertSeverity.LOW,
        'Test alert'
      );

      expect(alert.traceId).toBe('unknown');
    });

    it('should log alert creation', () => {
      alertService.createAlert(
        AlertType.DATABASE_SLOW_QUERY,
        AlertSeverity.CRITICAL,
        'Slow query detected'
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          event: 'alert_created',
          alertId: expect.stringMatching(/^test-uuid-\d+$/),
          type: AlertType.DATABASE_SLOW_QUERY,
          severity: AlertSeverity.CRITICAL,
          message: 'Slow query detected',
        })
      );
    });

    it('should add event to active span', () => {
      alertService.createAlert(
        AlertType.EXTERNAL_API_FAILURE,
        AlertSeverity.HIGH,
        'API failure'
      );

      expect(mockTracingService.addEventToActiveSpan).toHaveBeenCalledWith(
        'alert_created',
        {
          'alert.id': expect.stringMatching(/^test-uuid-\d+$/),
          'alert.type': AlertType.EXTERNAL_API_FAILURE,
          'alert.severity': AlertSeverity.HIGH,
          'alert.message': 'API failure',
        }
      );
    });

    it('should store alert in both arrays and active alerts map', () => {
      const alert = alertService.createAlert(
        AlertType.QUEUE_BACKLOG,
        AlertSeverity.MEDIUM,
        'Queue backlog'
      );

      const alerts = (alertService as any).alerts;
      const activeAlerts = (alertService as any).activeAlerts;

      expect(alerts).toContain(alert);
      expect(activeAlerts.get(alert.id)).toBe(alert);
    });
  });

  describe('Alert Resolution', () => {
    let testAlert: Alert;

    beforeEach(() => {
      testAlert = alertService.createAlert(
        AlertType.HIGH_RESPONSE_TIME,
        AlertSeverity.HIGH,
        'Test alert'
      );
      jest.clearAllMocks();
    });

    it('should resolve existing alert', () => {
      const result = alertService.resolveAlert(testAlert.id);

      expect(result).toBe(true);
      expect(testAlert.resolved).toBe(true);
      expect(testAlert.resolvedAt).toBeInstanceOf(Date);
    });

    it('should remove resolved alert from active alerts', () => {
      alertService.resolveAlert(testAlert.id);

      const activeAlerts = (alertService as any).activeAlerts;
      expect(activeAlerts.has(testAlert.id)).toBe(false);
    });

    it('should log alert resolution', () => {
      alertService.resolveAlert(testAlert.id);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Alert resolved',
        expect.objectContaining({
          event: 'alert_resolved',
          alertId: testAlert.id,
          type: AlertType.HIGH_RESPONSE_TIME,
          duration: expect.any(Number),
        })
      );
    });

    it('should return false for non-existent alert', () => {
      const result = alertService.resolveAlert('non-existent-id');

      expect(result).toBe(false);
    });
  });

  describe('Alert Retrieval', () => {
    beforeEach(() => {
      // Clear any existing alerts
      (alertService as any).alerts = [];
      (alertService as any).activeAlerts.clear();
    });

    it('should get active alerts', () => {
      const alert1 = alertService.createAlert(
        AlertType.HIGH_RESPONSE_TIME,
        AlertSeverity.HIGH,
        'Alert 1'
      );
      const alert2 = alertService.createAlert(
        AlertType.HIGH_ERROR_RATE,
        AlertSeverity.MEDIUM,
        'Alert 2'
      );

      // Verify both alerts are active initially
      expect(alertService.getActiveAlerts()).toHaveLength(2);

      // Resolve one alert
      alertService.resolveAlert(alert1.id);

      const activeAlerts = alertService.getActiveAlerts();

      expect(activeAlerts).toHaveLength(1);
      expect(activeAlerts[0]).toBe(alert2);
    });

    it('should get alerts within time period', () => {
      const now = new Date();
      const oldAlert = alertService.createAlert(
        AlertType.HIGH_MEMORY_USAGE,
        AlertSeverity.LOW,
        'Old alert'
      );
      const recentAlert = alertService.createAlert(
        AlertType.DATABASE_SLOW_QUERY,
        AlertSeverity.HIGH,
        'Recent alert'
      );

      // Mock old alert timestamp
      oldAlert.timestamp = new Date(now.getTime() - 25 * 60 * 60 * 1000); // 25 hours ago

      const alerts = alertService.getAlerts(24); // Last 24 hours

      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toBe(recentAlert);
    });

    it('should get all alerts when no time filter specified', () => {
      alertService.createAlert(
        AlertType.HIGH_RESPONSE_TIME,
        AlertSeverity.HIGH,
        'Alert 1'
      );
      alertService.createAlert(
        AlertType.HIGH_ERROR_RATE,
        AlertSeverity.MEDIUM,
        'Alert 2'
      );

      const alerts = alertService.getAlerts();

      expect(alerts).toHaveLength(2);
    });
  });

  describe('Severity Calculation Methods', () => {
    describe('getSeverityForResponseTime', () => {
      it('should return CRITICAL for very high response time', () => {
        const severity = (alertService as any).getSeverityForResponseTime(
          12000
        ); // 2.4x threshold (above 2x)
        expect(severity).toBe(AlertSeverity.CRITICAL);
      });

      it('should return HIGH for high response time', () => {
        const severity = (alertService as any).getSeverityForResponseTime(8000); // 1.6x threshold (above 1.5x)
        expect(severity).toBe(AlertSeverity.HIGH);
      });

      it('should return MEDIUM for moderate response time', () => {
        const severity = (alertService as any).getSeverityForResponseTime(6000); // Just above threshold
        expect(severity).toBe(AlertSeverity.MEDIUM);
      });
    });

    describe('getSeverityForErrorRate', () => {
      it('should return CRITICAL for very high error rate', () => {
        const severity = (alertService as any).getSeverityForErrorRate(0.6);
        expect(severity).toBe(AlertSeverity.CRITICAL);
      });

      it('should return HIGH for high error rate', () => {
        const severity = (alertService as any).getSeverityForErrorRate(0.3);
        expect(severity).toBe(AlertSeverity.HIGH);
      });

      it('should return MEDIUM for moderate error rate', () => {
        const severity = (alertService as any).getSeverityForErrorRate(0.15);
        expect(severity).toBe(AlertSeverity.MEDIUM);
      });
    });

    describe('getSeverityForDatabaseTime', () => {
      it('should return CRITICAL for very slow queries', () => {
        const severity = (alertService as any).getSeverityForDatabaseTime(3500); // 3.5x threshold (above 3x)
        expect(severity).toBe(AlertSeverity.CRITICAL);
      });

      it('should return HIGH for slow queries', () => {
        const severity = (alertService as any).getSeverityForDatabaseTime(2500); // 2.5x threshold (above 2x)
        expect(severity).toBe(AlertSeverity.HIGH);
      });

      it('should return MEDIUM for moderate query time', () => {
        const severity = (alertService as any).getSeverityForDatabaseTime(1500);
        expect(severity).toBe(AlertSeverity.MEDIUM);
      });
    });

    describe('getSeverityForExternalApiTime', () => {
      it('should return HIGH for very slow API calls', () => {
        const severity = (alertService as any).getSeverityForExternalApiTime(
          25000
        ); // 2.5x threshold (above 2x)
        expect(severity).toBe(AlertSeverity.HIGH);
      });

      it('should return MEDIUM for moderate API time', () => {
        const severity = (alertService as any).getSeverityForExternalApiTime(
          15000
        );
        expect(severity).toBe(AlertSeverity.MEDIUM);
      });
    });

    describe('getSeverityForMemoryUsage', () => {
      it('should return CRITICAL for very high memory usage', () => {
        const severity = (alertService as any).getSeverityForMemoryUsage(0.96);
        expect(severity).toBe(AlertSeverity.CRITICAL);
      });

      it('should return HIGH for high memory usage', () => {
        const severity = (alertService as any).getSeverityForMemoryUsage(0.92);
        expect(severity).toBe(AlertSeverity.HIGH);
      });

      it('should return MEDIUM for moderate memory usage', () => {
        const severity = (alertService as any).getSeverityForMemoryUsage(0.85);
        expect(severity).toBe(AlertSeverity.MEDIUM);
      });
    });
  });

  describe('Alert Notification', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should log notification for regular alerts', () => {
      alertService.createAlert(
        AlertType.HIGH_RESPONSE_TIME,
        AlertSeverity.MEDIUM,
        'Test alert'
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Alert notification sent',
        expect.objectContaining({
          event: 'alert_notification_sent',
          alertId: expect.stringMatching(/^test-uuid-\d+$/),
          type: AlertType.HIGH_RESPONSE_TIME,
          severity: AlertSeverity.MEDIUM,
        })
      );
    });

    it('should log critical alerts with error level', () => {
      alertService.createAlert(
        AlertType.HIGH_MEMORY_USAGE,
        AlertSeverity.CRITICAL,
        'Critical memory usage'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'CRITICAL ALERT',
        expect.objectContaining({
          event: 'critical_alert',
          alertId: expect.stringMatching(/^test-uuid-\d+$/),
          type: AlertType.HIGH_MEMORY_USAGE,
          message: 'Critical memory usage',
        })
      );
    });
  });

  describe('Bottleneck Detection', () => {
    let mockSummary: any;

    beforeEach(() => {
      mockSummary = {
        requests: {
          avgDuration: 3000,
          errorRate: 0.05,
          total: 100,
          slowRequests: 10,
        },
        database: {
          avgDuration: 500,
          total: 50,
          slowQueries: 5,
        },
        externalApi: {
          avgDuration: 5000,
          total: 20,
          slowCalls: 3,
          errorRate: 0.02,
        },
        system: {
          memoryUsage: {
            heapUsed: 400000000,
            heapTotal: 500000000,
          },
        },
      };

      mockMetricsService.getPerformanceSummary.mockReturnValue(mockSummary);
      jest.clearAllMocks();
    });

    it('should start span for bottleneck detection', () => {
      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockTracingService.startSpan).toHaveBeenCalledWith(
        'bottleneck_detection',
        { 'detection.interval_ms': 60000 }
      );
    });

    it('should execute bottleneck detection in span', () => {
      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockTracingService.executeInSpan).toHaveBeenCalled();
    });

    it('should get performance summary for last hour', () => {
      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockMetricsService.getPerformanceSummary).toHaveBeenCalledWith(1);
    });

    it('should create alert for high response time', () => {
      mockSummary.requests.avgDuration = 6000; // Above threshold

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.HIGH_RESPONSE_TIME,
          message: 'High average response time detected: 6000ms',
        })
      );
    });

    it('should create alert for high error rate', () => {
      mockSummary.requests.errorRate = 0.15; // Above threshold

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.HIGH_ERROR_RATE,
          message: 'High error rate detected: 15%',
        })
      );
    });

    it('should create alert for slow database queries', () => {
      mockSummary.database.avgDuration = 1500; // Above threshold

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.DATABASE_SLOW_QUERY,
          message: 'Slow database queries detected: 1500ms average',
        })
      );
    });

    it('should create alert for slow external API calls', () => {
      mockSummary.externalApi.avgDuration = 15000; // Above threshold

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.EXTERNAL_API_FAILURE,
          message: 'Slow external API calls detected: 15000ms average',
        })
      );
    });

    it('should create alert for high memory usage', () => {
      mockSummary.system.memoryUsage.heapUsed = 450000000; // 90% of heap

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.HIGH_MEMORY_USAGE,
          message: 'High memory usage detected: 90%',
        })
      );
    });

    it('should handle missing system metrics', () => {
      mockSummary.system = undefined;

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      // Should not throw error and should not create memory usage alert
      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.HIGH_MEMORY_USAGE,
        })
      );
    });

    it('should detect overall bottlenecks with multiple factors', () => {
      // Set multiple factors above 80% of thresholds
      mockSummary.requests.avgDuration = 4500; // 90% of 5000
      mockSummary.requests.errorRate = 0.09; // 90% of 0.1
      mockSummary.database.avgDuration = 900; // 90% of 1000

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.BOTTLENECK_DETECTED,
          severity: AlertSeverity.HIGH,
          message: expect.stringContaining(
            'System bottleneck detected with multiple factors'
          ),
        })
      );
    });

    it('should not detect bottleneck with single factor', () => {
      // Set only one factor above 80% of threshold but below others
      mockSummary.requests.avgDuration = 4500; // 90% of 5000
      mockSummary.requests.errorRate = 0.05; // 50% of 0.1 (below 80%)
      mockSummary.database.avgDuration = 500; // 50% of 1000 (below 80%)
      mockSummary.externalApi.avgDuration = 5000; // 50% of 10000 (below 80%)
      mockSummary.system.memoryUsage.heapUsed = 300000000; // 60% (below 80%)

      alertService.initialize();
      jest.advanceTimersByTime(60000);

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        'Alert created',
        expect.objectContaining({
          type: AlertType.BOTTLENECK_DETECTED,
        })
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid environment variable values', () => {
      process.env['RESPONSE_TIME_THRESHOLD'] = 'invalid';
      process.env['ERROR_RATE_THRESHOLD'] = 'invalid';

      const service = new AlertService();
      const config = (service as any).config;

      expect(config.responseTimeThreshold).toBeNaN();
      expect(config.errorRateThreshold).toBeNaN();
    });

    it('should handle multiple initialization calls', () => {
      const initialTimers = jest.getTimerCount();
      alertService.initialize();
      alertService.initialize();

      // Should not throw error and should set interval twice
      expect(jest.getTimerCount()).toBe(initialTimers + 2);
    });

    it('should handle multiple shutdown calls', () => {
      alertService.initialize();
      alertService.shutdown();
      alertService.shutdown();

      // Should not throw error
      expect(mockLogger.info).toHaveBeenCalledWith('AlertService shutdown');
    });

    it('should handle empty alerts array for getAlerts', () => {
      (alertService as any).alerts = [];

      const alerts = alertService.getAlerts(24);

      expect(alerts).toEqual([]);
    });

    it('should handle empty active alerts map', () => {
      (alertService as any).activeAlerts.clear();

      const activeAlerts = alertService.getActiveAlerts();

      expect(activeAlerts).toEqual([]);
    });
  });
});
