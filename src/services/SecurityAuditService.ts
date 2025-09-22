import { AppDataSource } from '../ormconfig';
import { AuditLog, AuditAction, AuditEntityType } from '../entities/AuditLog';
import { logger } from '../config/logger';
import { Request } from 'express';
import crypto from 'crypto';

export interface SecurityEvent {
  event_type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  user_id?: string;
  resource_type: string;
  resource_id?: string;
  action: string;
  details: Record<string, any>;
  ip_address?: string | undefined;
  user_agent?: string | undefined;
  correlation_id?: string | undefined;
  session_id?: string | undefined;
  success: boolean;
  risk_score?: number;
}

export interface PaymentAuditData {
  transaction_id?: string;
  amount?: number;
  currency?: string;
  payment_method?: string;
  merchant_id?: string;
  gateway_response?: string;
  risk_flags?: string[];
}

export interface AuthenticationAuditData {
  auth_method: string;
  api_key_id?: string;
  login_attempt_count?: number;
  account_locked?: boolean;
  mfa_used?: boolean;
  device_fingerprint?: string;
}

export class SecurityAuditService {
  private static instance: SecurityAuditService;
  private suspiciousActivityThresholds = {
    failed_logins: 5,
    api_calls_per_minute: 100,
    payment_attempts_per_hour: 10,
    different_ips_per_hour: 3,
  };

  private constructor() {}

  public static getInstance(): SecurityAuditService {
    if (!SecurityAuditService.instance) {
      SecurityAuditService.instance = new SecurityAuditService();
    }
    return SecurityAuditService.instance;
  }

  /**
   * Logs a security event to the audit trail
   */
  public async logSecurityEvent(event: SecurityEvent): Promise<void> {
    try {
      if (!AppDataSource.isInitialized) {
        logger.warn(
          'Database not initialized, security event logged to file only',
          { event }
        );
        return;
      }

      const auditLogRepository = AppDataSource.getRepository(AuditLog);

      // Determine audit action based on event type

      const auditLog = new AuditLog();
      auditLog.action = this.mapEventTypeToAction(event.event_type);
      auditLog.entity_type = this.mapResourceTypeToEntity(event.resource_type);
      auditLog.entity_id = event.resource_id || 'unknown';
      auditLog.user_id = event.user_id || 'anonymous';
      auditLog.user_email = event.user_id
        ? `${event.user_id}@system.local`
        : (undefined as any);
      auditLog.ip_address = event.ip_address || 'unknown';
      auditLog.user_agent = event.user_agent || 'unknown';
      auditLog.description = `${event.event_type}: ${event.action}`;
      auditLog.metadata = event.details;
      auditLog.session_id = event.correlation_id || (undefined as any);
      auditLog.request_id = event.correlation_id || (undefined as any);

      await auditLogRepository.save(auditLog);

      // Log high severity events to application logs as well
      if (event.severity === 'HIGH' || event.severity === 'CRITICAL') {
        logger.warn('High severity security event', {
          event_type: event.event_type,
          severity: event.severity,
          user_id: event.user_id || 'anonymous',
          ip_address: event.ip_address,
          details: event.details,
        });
      }

      // Check for suspicious patterns
      await this.checkSuspiciousActivity(event);
    } catch (error) {
      logger.error('Failed to log security event', {
        error: error instanceof Error ? error.message : String(error),
        event: event.event_type,
      });
    }
  }

  /**
   * Logs payment-related security events
   */
  public async logPaymentEvent(
    event_type: string,
    success: boolean,
    paymentData: PaymentAuditData,
    req?: Request
  ): Promise<void> {
    const severity = success ? 'LOW' : 'HIGH';
    const riskScore = success ? 1 : 8;

    await this.logSecurityEvent({
      event_type,
      severity,
      user_id: (req as any)?.user?.id || 'anonymous',
      resource_type: 'PAYMENT',
      resource_id: paymentData.transaction_id || 'unknown',
      action: 'PAYMENT_PROCESSING',
      details: {
        amount: paymentData.amount,
        currency: paymentData.currency,
        payment_method: paymentData.payment_method,
        merchant_id: paymentData.merchant_id,
        transaction_type: 'payment',
      },
      ip_address: req?.ip || 'unknown',
      user_agent: (req?.headers?.['user-agent'] as string) || 'unknown',
      correlation_id: (req as any)?.correlationId || null,
      success,
      risk_score: riskScore,
    });
  }

  /**
   * Logs authentication-related security events
   */
  public async logAuthenticationEvent(
    event_type: string,
    success: boolean,
    authData: AuthenticationAuditData,
    req?: Request
  ): Promise<void> {
    const severity = success ? 'LOW' : 'HIGH';

    await this.logSecurityEvent({
      event_type,
      severity,
      user_id: (req as any)?.user?.id || 'anonymous',
      resource_type: 'AUTHENTICATION',
      action: 'USER_AUTHENTICATION',
      details: {
        auth_method: authData.auth_method,
        login_attempt_count: authData.login_attempt_count,
        account_locked: authData.account_locked,
        mfa_used: authData.mfa_used,
        device_fingerprint: authData.device_fingerprint,
        session_duration: 0,
      },
      ip_address: req?.ip || 'unknown',
      user_agent: (req?.headers?.['user-agent'] as string) || 'unknown',
      correlation_id: (req as any)?.correlationId || null,
      success,
    });
  }

  /**
   * Logs data access events for PCI compliance
   */
  public async logDataAccessEvent(
    resource_type: string,
    resource_id: string,
    action: string,
    user_id: string,
    req?: Request,
    sensitive_fields?: string[]
  ): Promise<void> {
    await this.logSecurityEvent({
      event_type: 'DATA_ACCESS',
      severity:
        sensitive_fields && sensitive_fields.length > 0 ? 'HIGH' : 'MEDIUM',
      user_id,
      resource_type,
      resource_id,
      action,
      details: {
        sensitive_fields: sensitive_fields || [],
        access_time: new Date().toISOString(),
      },
      ip_address: req?.ip || undefined,
      user_agent: (req?.headers?.['user-agent'] as string) || undefined,
      correlation_id: (req as any)?.correlationId || undefined,
      success: true,
    });
  }

  /**
   * Logs system configuration changes
   */
  public async logConfigurationChange(
    config_type: string,
    old_value: any,
    new_value: any,
    user_id: string,
    req?: Request
  ): Promise<void> {
    await this.logSecurityEvent({
      event_type: 'CONFIGURATION_CHANGE',
      severity: 'HIGH',
      user_id,
      resource_type: 'SYSTEM_CONFIG',
      resource_id: config_type,
      action: 'UPDATE',
      details: {
        config_type,
        old_value: this.sanitizeConfigValue(old_value),
        new_value: this.sanitizeConfigValue(new_value),
        change_hash: crypto
          .createHash('sha256')
          .update(JSON.stringify({ old_value, new_value }))
          .digest('hex'),
      },
      ip_address: req?.ip || undefined,
      user_agent: (req?.headers?.['user-agent'] as string) || undefined,
      correlation_id: (req as any)?.correlationId || undefined,
      success: true,
    });
  }

  /**
   * Logs webhook security events
   */
  public async logWebhookEvent(
    webhook_id: string,
    _event_type: string,
    success: boolean,
    signature_valid: boolean,
    req?: Request
  ): Promise<void> {
    const severity =
      success && signature_valid
        ? 'LOW'
        : signature_valid
          ? 'MEDIUM'
          : 'CRITICAL';

    await this.logSecurityEvent({
      event_type: 'WEBHOOK_RECEIVED',
      severity,
      user_id: 'system',
      resource_type: 'WEBHOOK',
      resource_id: webhook_id,
      action: 'WEBHOOK_PROCESSING',
      details: {
        signature_valid,
        webhook_source:
          (req?.headers['x-webhook-source'] as string) || 'unknown',
        content_type: (req?.headers['content-type'] as string) || 'unknown',
        content_length: (req?.headers['content-length'] as string) || 'unknown',
      },
      ip_address: req?.ip || 'unknown',
      user_agent: (req?.headers?.['user-agent'] as string) || 'unknown',
      correlation_id: (req as any)?.correlationId || null,
      success: success && signature_valid,
    });
  }

  /**
   * Retrieves security events for analysis
   */
  public async getSecurityEvents(filters: {
    event_type?: string;
    severity?: string;
    user_id?: string;
    ip_address?: string;
    start_date?: Date;
    end_date?: Date;
    limit?: number;
  }): Promise<AuditLog[]> {
    try {
      if (!AppDataSource.isInitialized) {
        return [];
      }

      const auditLogRepository = AppDataSource.getRepository(AuditLog);
      const query = auditLogRepository.createQueryBuilder('audit');

      if (filters.event_type) {
        query.andWhere("audit.metadata->>'event_type' = :event_type", {
          event_type: filters.event_type,
        });
      }

      if (filters.severity) {
        query.andWhere("audit.metadata->>'severity' = :severity", {
          severity: filters.severity,
        });
      }

      if (filters.user_id) {
        query.andWhere('audit.user_id = :user_id', {
          user_id: filters.user_id,
        });
      }

      if (filters.ip_address) {
        query.andWhere('audit.ip_address = :ip_address', {
          ip_address: filters.ip_address,
        });
      }

      if (filters.start_date) {
        query.andWhere('audit.created_at >= :start_date', {
          start_date: filters.start_date,
        });
      }

      if (filters.end_date) {
        query.andWhere('audit.created_at <= :end_date', {
          end_date: filters.end_date,
        });
      }

      query.orderBy('audit.created_at', 'DESC');
      query.limit(filters.limit || 100);

      return await query.getMany();
    } catch (error) {
      logger.error('Failed to retrieve security events', {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Generates security report for compliance
   */
  public async generateSecurityReport(
    start_date: Date,
    end_date: Date
  ): Promise<{
    total_events: number;
    events_by_severity: Record<string, number>;
    events_by_type: Record<string, number>;
    failed_authentications: number;
    suspicious_activities: number;
    data_access_events: number;
    payment_events: number;
  }> {
    try {
      const events = await this.getSecurityEvents({
        start_date,
        end_date,
        limit: 10000,
      });

      const report = {
        total_events: events.length,
        events_by_severity: {} as Record<string, number>,
        events_by_type: {} as Record<string, number>,
        failed_authentications: 0,
        suspicious_activities: 0,
        data_access_events: 0,
        payment_events: 0,
      };

      events.forEach(event => {
        const severity = (event.metadata?.['severity'] as string) || 'UNKNOWN';
        const eventType =
          (event.metadata?.['event_type'] as string) || 'UNKNOWN';
        const success = event.metadata?.['success'] as boolean;

        // Count by severity
        report.events_by_severity[severity] =
          (report.events_by_severity[severity] || 0) + 1;

        // Count by type
        report.events_by_type[eventType] =
          (report.events_by_type[eventType] || 0) + 1;

        // Count specific event types
        if (eventType.includes('AUTH') && !success) {
          report.failed_authentications++;
        }

        if (
          event.metadata?.['risk_score'] &&
          (event.metadata['risk_score'] as number) > 7
        ) {
          report.suspicious_activities++;
        }

        if (eventType === 'DATA_ACCESS') {
          report.data_access_events++;
        }

        if (eventType.includes('PAYMENT')) {
          report.payment_events++;
        }
      });

      return report;
    } catch (error) {
      logger.error('Failed to generate security report', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private mapEventTypeToAction(eventType: string): AuditAction {
    const mapping: Record<string, AuditAction> = {
      PAYMENT_ATTEMPT: AuditAction.PAYMENT_ATTEMPT,
      REFUND_ATTEMPT: AuditAction.REFUND_ATTEMPT,
      SUBSCRIPTION_CHANGE: AuditAction.SUBSCRIPTION_CHANGE,
      WEBHOOK_RECEIVED: AuditAction.WEBHOOK_RECEIVED,
      API_CALL: AuditAction.API_CALL,
      LOGIN: AuditAction.LOGIN,
      LOGOUT: AuditAction.LOGOUT,
    };

    return mapping[eventType] || AuditAction.API_CALL;
  }

  private mapResourceTypeToEntity(resourceType: string): AuditEntityType {
    const mapping: Record<string, AuditEntityType> = {
      PAYMENT: AuditEntityType.TRANSACTION,
      SUBSCRIPTION: AuditEntityType.SUBSCRIPTION,
      WEBHOOK: AuditEntityType.WEBHOOK_EVENT,
      USER: AuditEntityType.USER,
      SYSTEM_CONFIG: AuditEntityType.SYSTEM,
      AUTHENTICATION: AuditEntityType.SYSTEM,
    };

    return mapping[resourceType] || AuditEntityType.SYSTEM;
  }

  // Removed unused methods to fix TypeScript warnings

  private sanitizeConfigValue(value: any): any {
    if (typeof value === 'string') {
      // Hide sensitive configuration values
      const sensitiveKeys = ['password', 'key', 'secret', 'token', 'api'];
      const valueStr = value.toLowerCase();

      if (sensitiveKeys.some(key => valueStr.includes(key))) {
        return '[REDACTED]';
      }
    }

    return value;
  }

  private async checkSuspiciousActivity(event: SecurityEvent): Promise<void> {
    try {
      // Check for multiple failed login attempts
      if (
        event.event_type.includes('AUTH') &&
        !event.success &&
        event.ip_address
      ) {
        const recentFailures = await this.getSecurityEvents({
          event_type: event.event_type,
          ip_address: event.ip_address,
          start_date: new Date(Date.now() - 15 * 60 * 1000), // Last 15 minutes
          limit: 10,
        });

        if (
          recentFailures.length >=
          this.suspiciousActivityThresholds.failed_logins
        ) {
          await this.logSecurityEvent({
            event_type: 'SUSPICIOUS_ACTIVITY_DETECTED',
            severity: 'CRITICAL',
            resource_type: 'SECURITY',
            action: 'MULTIPLE_FAILED_LOGINS',
            details: {
              ip_address: event.ip_address,
              failure_count: recentFailures.length,
              time_window: '15_minutes',
            },
            ip_address: event.ip_address,
            success: false,
          });
        }
      }
    } catch (error) {
      logger.error('Failed to check suspicious activity', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

export const securityAuditService = SecurityAuditService.getInstance();
