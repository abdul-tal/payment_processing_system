import { logger } from '../config/logger';
import { tracingService } from './TracingService';
import { metricsService } from './MetricsService';

export interface Alert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  details: Record<string, any>;
  timestamp: Date;
  traceId?: string;
  resolved: boolean;
  resolvedAt?: Date;
}

export enum AlertType {
  HIGH_RESPONSE_TIME = 'high_response_time',
  HIGH_ERROR_RATE = 'high_error_rate',
  HIGH_MEMORY_USAGE = 'high_memory_usage',
  DATABASE_SLOW_QUERY = 'database_slow_query',
  EXTERNAL_API_FAILURE = 'external_api_failure',
  QUEUE_BACKLOG = 'queue_backlog',
  BOTTLENECK_DETECTED = 'bottleneck_detected',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export interface BottleneckDetectionConfig {
  responseTimeThreshold: number; // ms
  errorRateThreshold: number; // percentage (0-1)
  memoryUsageThreshold: number; // percentage (0-1)
  databaseQueryThreshold: number; // ms
  externalApiThreshold: number; // ms
  queueBacklogThreshold: number; // number of jobs
  checkIntervalMs: number;
}

/**
 * Service for detecting performance bottlenecks and sending alerts
 */
export class AlertService {
  private static instance: AlertService;
  private alerts: Alert[] = [];
  private activeAlerts = new Map<string, Alert>();
  private checkInterval?: NodeJS.Timeout;
  private config: BottleneckDetectionConfig;

  constructor() {
    this.config = {
      responseTimeThreshold: parseInt(process.env.RESPONSE_TIME_THRESHOLD || '5000', 10),
      errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD || '0.1'),
      memoryUsageThreshold: parseFloat(process.env.MEMORY_USAGE_THRESHOLD || '0.8'),
      databaseQueryThreshold: parseInt(process.env.DB_QUERY_THRESHOLD || '1000', 10),
      externalApiThreshold: parseInt(process.env.EXTERNAL_API_THRESHOLD || '10000', 10),
      queueBacklogThreshold: parseInt(process.env.QUEUE_BACKLOG_THRESHOLD || '100', 10),
      checkIntervalMs: parseInt(process.env.BOTTLENECK_CHECK_INTERVAL || '60000', 10),
    };
  }

  public static getInstance(): AlertService {
    if (!AlertService.instance) {
      AlertService.instance = new AlertService();
    }
    return AlertService.instance;
  }

  /**
   * Initialize bottleneck detection
   */
  public initialize(): void {
    this.checkInterval = setInterval(() => {
      this.checkForBottlenecks();
    }, this.config.checkIntervalMs);

    logger.info('AlertService initialized', {
      config: this.config,
    });
  }

  /**
   * Stop bottleneck detection
   */
  public shutdown(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    logger.info('AlertService shutdown');
  }

  /**
   * Create and send an alert
   */
  public createAlert(
    type: AlertType,
    severity: AlertSeverity,
    message: string,
    details: Record<string, any> = {}
  ): Alert {
    const alert: Alert = {
      id: this.generateAlertId(),
      type,
      severity,
      message,
      details,
      timestamp: new Date(),
      traceId: tracingService.getCurrentTraceId(),
      resolved: false,
    };

    this.alerts.push(alert);
    this.activeAlerts.set(alert.id, alert);

    // Log the alert
    logger.warn('Alert created', {
      event: 'alert_created',
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      details: alert.details,
      traceId: alert.traceId,
    });

    // Add alert event to trace
    tracingService.addEventToActiveSpan('alert_created', {
      'alert.id': alert.id,
      'alert.type': alert.type,
      'alert.severity': alert.severity,
      'alert.message': alert.message,
    });

    // Send alert notification (implement based on your notification system)
    this.sendAlertNotification(alert);

    return alert;
  }

  /**
   * Resolve an alert
   */
  public resolveAlert(alertId: string): boolean {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.resolved = true;
    alert.resolvedAt = new Date();
    this.activeAlerts.delete(alertId);

    logger.info('Alert resolved', {
      event: 'alert_resolved',
      alertId: alert.id,
      type: alert.type,
      duration: alert.resolvedAt.getTime() - alert.timestamp.getTime(),
    });

    return true;
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): Alert[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Get all alerts within a time period
   */
  public getAlerts(hours: number = 24): Alert[] {
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000);
    return this.alerts.filter(alert => alert.timestamp > cutoff);
  }

  /**
   * Check for performance bottlenecks
   */
  private checkForBottlenecks(): void {
    const span = tracingService.startSpan('bottleneck_detection', {
      'detection.interval_ms': this.config.checkIntervalMs,
    });

    tracingService.executeInSpan(span, async () => {
      const summary = metricsService.getPerformanceSummary(1); // Last hour

      // Check response time bottlenecks
      if (summary.requests.avgDuration > this.config.responseTimeThreshold) {
        this.createAlert(
          AlertType.HIGH_RESPONSE_TIME,
          this.getSeverityForResponseTime(summary.requests.avgDuration),
          `High average response time detected: ${summary.requests.avgDuration}ms`,
          {
            avgDuration: summary.requests.avgDuration,
            threshold: this.config.responseTimeThreshold,
            totalRequests: summary.requests.total,
            slowRequests: summary.requests.slowRequests,
          }
        );
      }

      // Check error rate bottlenecks
      if (summary.requests.errorRate > this.config.errorRateThreshold) {
        this.createAlert(
          AlertType.HIGH_ERROR_RATE,
          this.getSeverityForErrorRate(summary.requests.errorRate),
          `High error rate detected: ${Math.round(summary.requests.errorRate * 100)}%`,
          {
            errorRate: summary.requests.errorRate,
            threshold: this.config.errorRateThreshold,
            totalRequests: summary.requests.total,
          }
        );
      }

      // Check database performance bottlenecks
      if (summary.database.avgDuration > this.config.databaseQueryThreshold) {
        this.createAlert(
          AlertType.DATABASE_SLOW_QUERY,
          this.getSeverityForDatabaseTime(summary.database.avgDuration),
          `Slow database queries detected: ${summary.database.avgDuration}ms average`,
          {
            avgDuration: summary.database.avgDuration,
            threshold: this.config.databaseQueryThreshold,
            totalQueries: summary.database.total,
            slowQueries: summary.database.slowQueries,
          }
        );
      }

      // Check external API bottlenecks
      if (summary.externalApi.avgDuration > this.config.externalApiThreshold) {
        this.createAlert(
          AlertType.EXTERNAL_API_FAILURE,
          this.getSeverityForExternalApiTime(summary.externalApi.avgDuration),
          `Slow external API calls detected: ${summary.externalApi.avgDuration}ms average`,
          {
            avgDuration: summary.externalApi.avgDuration,
            threshold: this.config.externalApiThreshold,
            totalCalls: summary.externalApi.total,
            slowCalls: summary.externalApi.slowCalls,
            errorRate: summary.externalApi.errorRate,
          }
        );
      }

      // Check memory usage bottlenecks
      if (summary.system) {
        const memoryUsagePercent = summary.system.memoryUsage.heapUsed / summary.system.memoryUsage.heapTotal;
        if (memoryUsagePercent > this.config.memoryUsageThreshold) {
          this.createAlert(
            AlertType.HIGH_MEMORY_USAGE,
            this.getSeverityForMemoryUsage(memoryUsagePercent),
            `High memory usage detected: ${Math.round(memoryUsagePercent * 100)}%`,
            {
              memoryUsagePercent,
              threshold: this.config.memoryUsageThreshold,
              heapUsed: summary.system.memoryUsage.heapUsed,
              heapTotal: summary.system.memoryUsage.heapTotal,
            }
          );
        }
      }

      // Detect overall bottlenecks based on multiple factors
      this.detectOverallBottlenecks(summary);
    });
  }

  /**
   * Detect overall system bottlenecks
   */
  private detectOverallBottlenecks(summary: any): void {
    const bottleneckFactors: string[] = [];

    if (summary.requests.avgDuration > this.config.responseTimeThreshold * 0.8) {
      bottleneckFactors.push('high_response_time');
    }

    if (summary.requests.errorRate > this.config.errorRateThreshold * 0.8) {
      bottleneckFactors.push('high_error_rate');
    }

    if (summary.database.avgDuration > this.config.databaseQueryThreshold * 0.8) {
      bottleneckFactors.push('slow_database');
    }

    if (summary.externalApi.avgDuration > this.config.externalApiThreshold * 0.8) {
      bottleneckFactors.push('slow_external_api');
    }

    if (summary.system) {
      const memoryUsagePercent = summary.system.memoryUsage.heapUsed / summary.system.memoryUsage.heapTotal;
      if (memoryUsagePercent > this.config.memoryUsageThreshold * 0.8) {
        bottleneckFactors.push('high_memory_usage');
      }
    }

    // If multiple factors are present, create a bottleneck alert
    if (bottleneckFactors.length >= 2) {
      this.createAlert(
        AlertType.BOTTLENECK_DETECTED,
        AlertSeverity.HIGH,
        `System bottleneck detected with multiple factors: ${bottleneckFactors.join(', ')}`,
        {
          factors: bottleneckFactors,
          summary,
        }
      );
    }
  }

  /**
   * Send alert notification (implement based on your notification system)
   */
  private sendAlertNotification(alert: Alert): void {
    // This is where you would integrate with your notification system
    // Examples: email, Slack, PagerDuty, webhook, etc.
    
    logger.info('Alert notification sent', {
      event: 'alert_notification_sent',
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
    });

    // For now, just log critical alerts more prominently
    if (alert.severity === AlertSeverity.CRITICAL) {
      logger.error('CRITICAL ALERT', {
        event: 'critical_alert',
        alertId: alert.id,
        type: alert.type,
        message: alert.message,
        details: alert.details,
      });
    }
  }

  /**
   * Generate unique alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get severity based on response time
   */
  private getSeverityForResponseTime(duration: number): AlertSeverity {
    if (duration > this.config.responseTimeThreshold * 2) {
      return AlertSeverity.CRITICAL;
    } else if (duration > this.config.responseTimeThreshold * 1.5) {
      return AlertSeverity.HIGH;
    } else {
      return AlertSeverity.MEDIUM;
    }
  }

  /**
   * Get severity based on error rate
   */
  private getSeverityForErrorRate(errorRate: number): AlertSeverity {
    if (errorRate > 0.5) {
      return AlertSeverity.CRITICAL;
    } else if (errorRate > 0.25) {
      return AlertSeverity.HIGH;
    } else {
      return AlertSeverity.MEDIUM;
    }
  }

  /**
   * Get severity based on database query time
   */
  private getSeverityForDatabaseTime(duration: number): AlertSeverity {
    if (duration > this.config.databaseQueryThreshold * 3) {
      return AlertSeverity.CRITICAL;
    } else if (duration > this.config.databaseQueryThreshold * 2) {
      return AlertSeverity.HIGH;
    } else {
      return AlertSeverity.MEDIUM;
    }
  }

  /**
   * Get severity based on external API time
   */
  private getSeverityForExternalApiTime(duration: number): AlertSeverity {
    if (duration > this.config.externalApiThreshold * 2) {
      return AlertSeverity.HIGH;
    } else {
      return AlertSeverity.MEDIUM;
    }
  }

  /**
   * Get severity based on memory usage
   */
  private getSeverityForMemoryUsage(usage: number): AlertSeverity {
    if (usage > 0.95) {
      return AlertSeverity.CRITICAL;
    } else if (usage > 0.9) {
      return AlertSeverity.HIGH;
    } else {
      return AlertSeverity.MEDIUM;
    }
  }
}

// Export singleton instance
export const alertService = AlertService.getInstance();
