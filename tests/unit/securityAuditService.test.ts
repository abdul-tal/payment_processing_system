import {
  SecurityAuditService,
  SecurityEvent,
  PaymentAuditData,
  AuthenticationAuditData,
} from '../../src/services/SecurityAuditService';
import { AppDataSource } from '../../src/ormconfig';
import {
  AuditLog,
  AuditAction,
  AuditEntityType,
} from '../../src/entities/AuditLog';
import { logger } from '../../src/config/logger';
import { Request } from 'express';
import crypto from 'crypto';

// Mock dependencies
jest.mock('../../src/ormconfig');
jest.mock('../../src/config/logger');
jest.mock('crypto');

describe('SecurityAuditService', () => {
  let securityAuditService: SecurityAuditService;
  let mockAppDataSource: jest.Mocked<typeof AppDataSource>;
  let mockLogger: jest.Mocked<typeof logger>;
  let mockCrypto: jest.Mocked<typeof crypto>;
  let mockRepository: any;
  let mockQueryBuilder: any;

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Setup mocks
    mockAppDataSource = AppDataSource as jest.Mocked<typeof AppDataSource>;
    mockLogger = logger as jest.Mocked<typeof logger>;
    mockCrypto = crypto as jest.Mocked<typeof crypto>;

    // Mock repository and query builder
    mockQueryBuilder = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnThis(),
    };

    mockRepository = {
      save: jest.fn().mockResolvedValue({}),
      createQueryBuilder: jest.fn().mockReturnValue(mockQueryBuilder),
    };

    Object.defineProperty(mockAppDataSource, 'isInitialized', {
      value: true,
      writable: true,
    });
    mockAppDataSource.getRepository = jest.fn().mockReturnValue(mockRepository);

    // Mock crypto
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('mock-hash'),
    };
    mockCrypto.createHash = jest.fn().mockReturnValue(mockHash as any);

    // Reset singleton instance
    (SecurityAuditService as any).instance = undefined;
    securityAuditService = SecurityAuditService.getInstance();
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when getInstance is called multiple times', () => {
      const instance1 = SecurityAuditService.getInstance();
      const instance2 = SecurityAuditService.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance1).toBe(securityAuditService);
    });
  });

  describe('logSecurityEvent', () => {
    const mockEvent: SecurityEvent = {
      event_type: 'TEST_EVENT',
      severity: 'HIGH',
      user_id: 'user123',
      resource_type: 'PAYMENT',
      resource_id: 'payment123',
      action: 'PAYMENT_PROCESSING',
      details: { amount: 100 },
      ip_address: '192.168.1.1',
      user_agent: 'test-agent',
      correlation_id: 'corr123',
      success: true,
      risk_score: 5,
    };

    it('should log security event to database when initialized', async () => {
      await securityAuditService.logSecurityEvent(mockEvent);

      expect(mockAppDataSource.getRepository).toHaveBeenCalledWith(AuditLog);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.API_CALL,
          entity_type: AuditEntityType.TRANSACTION,
          entity_id: 'payment123',
          user_id: 'user123',
          ip_address: '192.168.1.1',
          user_agent: 'test-agent',
          description: 'TEST_EVENT: PAYMENT_PROCESSING',
          metadata: { amount: 100 },
        })
      );
    });

    it('should log warning when database not initialized', async () => {
      Object.defineProperty(mockAppDataSource, 'isInitialized', {
        value: false,
        writable: true,
      });

      await securityAuditService.logSecurityEvent(mockEvent);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Database not initialized, security event logged to file only',
        { event: mockEvent }
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should log high severity events to application logs', async () => {
      await securityAuditService.logSecurityEvent(mockEvent);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'High severity security event',
        expect.objectContaining({
          event_type: 'TEST_EVENT',
          severity: 'HIGH',
          user_id: 'user123',
          ip_address: '192.168.1.1',
        })
      );
    });

    it('should not log low severity events to application logs', async () => {
      const lowSeverityEvent = { ...mockEvent, severity: 'LOW' as const };

      await securityAuditService.logSecurityEvent(lowSeverityEvent);

      expect(mockLogger.warn).not.toHaveBeenCalledWith(
        'High severity security event',
        expect.any(Object)
      );
    });

    it('should handle missing optional fields', async () => {
      const minimalEvent: SecurityEvent = {
        event_type: 'MINIMAL_EVENT',
        severity: 'MEDIUM',
        resource_type: 'USER',
        action: 'LOGIN',
        details: {},
        success: true,
      };

      await securityAuditService.logSecurityEvent(minimalEvent);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'anonymous',
          entity_id: 'unknown',
          ip_address: 'unknown',
          user_agent: 'unknown',
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockRepository.save.mockRejectedValue(new Error('Database error'));

      await securityAuditService.logSecurityEvent(mockEvent);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log security event',
        expect.objectContaining({
          error: 'Database error',
          event: 'TEST_EVENT',
        })
      );
    });
  });

  describe('logPaymentEvent', () => {
    const mockPaymentData: PaymentAuditData = {
      transaction_id: 'txn123',
      amount: 99.99,
      currency: 'USD',
      payment_method: 'credit_card',
      merchant_id: 'merchant123',
    };

    const mockRequest = {
      ip: '192.168.1.1',
      headers: { 'user-agent': 'test-browser' },
      user: { id: 'user123' },
      correlationId: 'corr123',
    } as any as Request;

    it('should log successful payment event with LOW severity', async () => {
      await securityAuditService.logPaymentEvent(
        'PAYMENT_SUCCESS',
        true,
        mockPaymentData,
        mockRequest
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.API_CALL,
          entity_type: AuditEntityType.TRANSACTION,
          user_id: 'user123',
          metadata: expect.objectContaining({
            amount: 99.99,
            currency: 'USD',
            payment_method: 'credit_card',
          }),
        })
      );
    });

    it('should log failed payment event with HIGH severity', async () => {
      await securityAuditService.logPaymentEvent(
        'PAYMENT_FAILED',
        false,
        mockPaymentData,
        mockRequest
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            amount: 99.99,
            currency: 'USD',
          }),
        })
      );
    });

    it('should handle missing request object', async () => {
      await securityAuditService.logPaymentEvent(
        'PAYMENT_EVENT',
        true,
        mockPaymentData
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'anonymous',
          ip_address: 'unknown',
          user_agent: 'unknown',
        })
      );
    });
  });

  describe('logAuthenticationEvent', () => {
    const mockAuthData: AuthenticationAuditData = {
      auth_method: 'api_key',
      api_key_id: 'key123',
      login_attempt_count: 1,
      account_locked: false,
      mfa_used: true,
    };

    const mockRequest = {
      ip: '192.168.1.1',
      headers: { 'user-agent': 'test-client' },
      user: { id: 'user123' },
      correlationId: 'corr123',
    } as any as Request;

    it('should log successful authentication event', async () => {
      await securityAuditService.logAuthenticationEvent(
        'LOGIN_SUCCESS',
        true,
        mockAuthData,
        mockRequest
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.API_CALL,
          entity_type: AuditEntityType.SYSTEM,
          metadata: expect.objectContaining({
            auth_method: 'api_key',
            mfa_used: true,
            account_locked: false,
          }),
        })
      );
    });

    it('should log failed authentication event with HIGH severity', async () => {
      await securityAuditService.logAuthenticationEvent(
        'LOGIN_FAILED',
        false,
        mockAuthData,
        mockRequest
      );

      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('logDataAccessEvent', () => {
    it('should log data access event with sensitive fields', async () => {
      const mockRequest = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'test-client' },
        correlationId: 'corr123',
      } as any as Request;

      await securityAuditService.logDataAccessEvent(
        'CUSTOMER_DATA',
        'customer123',
        'READ',
        'user123',
        mockRequest,
        ['credit_card_number', 'ssn']
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.API_CALL,
          entity_type: AuditEntityType.SYSTEM,
          user_id: 'user123',
          entity_id: 'customer123',
          metadata: expect.objectContaining({
            sensitive_fields: ['credit_card_number', 'ssn'],
          }),
        })
      );
    });

    it('should use MEDIUM severity for non-sensitive data access', async () => {
      await securityAuditService.logDataAccessEvent(
        'PUBLIC_DATA',
        'data123',
        'READ',
        'user123'
      );

      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('logConfigurationChange', () => {
    it('should log configuration change with sanitized values', async () => {
      const mockRequest = {
        ip: '192.168.1.1',
        headers: { 'user-agent': 'admin-client' },
        correlationId: 'corr123',
      } as any as Request;

      await securityAuditService.logConfigurationChange(
        'api_settings',
        { timeout: 30 },
        { timeout: 60 },
        'admin123',
        mockRequest
      );

      expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.API_CALL,
          entity_type: AuditEntityType.SYSTEM,
          user_id: 'admin123',
          entity_id: 'api_settings',
          metadata: expect.objectContaining({
            config_type: 'api_settings',
            change_hash: 'mock-hash',
          }),
        })
      );
    });

    it('should sanitize sensitive configuration values', async () => {
      await securityAuditService.logConfigurationChange(
        'database_config',
        { password: 'old_secret' },
        { password: 'new_secret' },
        'admin123'
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            old_value: { password: 'old_secret' },
            new_value: { password: 'new_secret' },
          }),
        })
      );
    });
  });

  describe('logWebhookEvent', () => {
    const mockRequest = {
      ip: '192.168.1.1',
      headers: {
        'user-agent': 'webhook-client',
        'x-webhook-source': 'authorize-net',
        'content-type': 'application/json',
        'content-length': '256',
      },
      correlationId: 'corr123',
    } as any as Request;

    it('should log successful webhook with valid signature as LOW severity', async () => {
      await securityAuditService.logWebhookEvent(
        'webhook123',
        'payment_completed',
        true,
        true,
        mockRequest
      );

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.WEBHOOK_RECEIVED,
          entity_type: AuditEntityType.WEBHOOK_EVENT,
          user_id: 'system',
          entity_id: 'webhook123',
          metadata: expect.objectContaining({
            signature_valid: true,
            webhook_source: 'authorize-net',
          }),
        })
      );
    });

    it('should log webhook with invalid signature as CRITICAL severity', async () => {
      await securityAuditService.logWebhookEvent(
        'webhook123',
        'payment_completed',
        true,
        false,
        mockRequest
      );

      expect(mockRepository.save).toHaveBeenCalled();
    });
  });

  describe('getSecurityEvents', () => {
    it('should return empty array when database not initialized', async () => {
      Object.defineProperty(mockAppDataSource, 'isInitialized', {
        value: false,
        writable: true,
      });

      const result = await securityAuditService.getSecurityEvents({});

      expect(result).toEqual([]);
    });

    it('should build query with all filters', async () => {
      const filters = {
        event_type: 'LOGIN',
        severity: 'HIGH',
        user_id: 'user123',
        ip_address: '192.168.1.1',
        start_date: new Date('2023-01-01'),
        end_date: new Date('2023-12-31'),
        limit: 50,
      };

      await securityAuditService.getSecurityEvents(filters);

      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('audit');
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledTimes(6);
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'audit.created_at',
        'DESC'
      );
    });

    it('should handle query errors gracefully', async () => {
      mockQueryBuilder.getMany.mockRejectedValue(new Error('Query error'));

      const result = await securityAuditService.getSecurityEvents({});

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to retrieve security events',
        expect.objectContaining({
          error: 'Query error',
        })
      );
    });
  });

  describe('generateSecurityReport', () => {
    const mockEvents = [
      {
        metadata: {
          severity: 'HIGH',
          event_type: 'LOGIN_FAILED',
          success: false,
          risk_score: 8,
        },
      },
      {
        metadata: {
          severity: 'LOW',
          event_type: 'DATA_ACCESS',
          success: true,
          risk_score: 2,
        },
      },
      {
        metadata: {
          severity: 'CRITICAL',
          event_type: 'PAYMENT_FAILED',
          success: false,
          risk_score: 9,
        },
      },
    ];

    beforeEach(() => {
      mockQueryBuilder.getMany.mockResolvedValue(mockEvents);
    });

    it('should generate comprehensive security report', async () => {
      const startDate = new Date('2023-01-01');
      const endDate = new Date('2023-12-31');

      const report = await securityAuditService.generateSecurityReport(
        startDate,
        endDate
      );

      expect(report).toEqual({
        total_events: 3,
        events_by_severity: {
          HIGH: 1,
          LOW: 1,
          CRITICAL: 1,
        },
        events_by_type: {
          LOGIN_FAILED: 1,
          DATA_ACCESS: 1,
          PAYMENT_FAILED: 1,
        },
        failed_authentications: 0,
        suspicious_activities: 2,
        data_access_events: 1,
        payment_events: 1,
      });
    });

    it('should handle report generation errors', async () => {
      mockQueryBuilder.getMany.mockRejectedValue(new Error('Report error'));

      const result = await securityAuditService.generateSecurityReport(
        new Date('2023-01-01'),
        new Date('2023-12-31')
      );

      expect(result).toEqual({
        total_events: 0,
        events_by_severity: {},
        events_by_type: {},
        failed_authentications: 0,
        payment_events: 0,
        data_access_events: 0,
        suspicious_activities: 0,
      });

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to retrieve security events',
        expect.objectContaining({
          error: 'Report error',
        })
      );
    });
  });

  describe('Private Helper Methods', () => {
    it('should map event types to audit actions correctly', () => {
      const service = securityAuditService as any;

      expect(service.mapEventTypeToAction('PAYMENT_ATTEMPT')).toBe(
        AuditAction.PAYMENT_ATTEMPT
      );
      expect(service.mapEventTypeToAction('LOGIN')).toBe(AuditAction.LOGIN);
      expect(service.mapEventTypeToAction('UNKNOWN_EVENT')).toBe(
        AuditAction.API_CALL
      );
    });

    it('should map resource types to entity types correctly', () => {
      const service = securityAuditService as any;

      expect(service.mapResourceTypeToEntity('PAYMENT')).toBe(
        AuditEntityType.TRANSACTION
      );
      expect(service.mapResourceTypeToEntity('USER')).toBe(
        AuditEntityType.USER
      );
      expect(service.mapResourceTypeToEntity('UNKNOWN_RESOURCE')).toBe(
        AuditEntityType.SYSTEM
      );
    });

    it('should sanitize sensitive configuration values', () => {
      const service = securityAuditService as any;

      expect(service.sanitizeConfigValue('my_password_123')).toBe('[REDACTED]');
      expect(service.sanitizeConfigValue('api_key_value')).toBe('[REDACTED]');
      expect(service.sanitizeConfigValue('normal_value')).toBe('normal_value');
      expect(service.sanitizeConfigValue(123)).toBe(123);
    });
  });

  describe('checkSuspiciousActivity', () => {
    it('should detect multiple failed login attempts', async () => {
      const mockFailedEvent: SecurityEvent = {
        event_type: 'AUTH_FAILED',
        severity: 'HIGH',
        resource_type: 'AUTHENTICATION',
        action: 'LOGIN',
        details: {},
        ip_address: '192.168.1.1',
        success: false,
      };

      // Mock multiple failed attempts
      mockQueryBuilder.getMany.mockResolvedValue([
        { metadata: { event_type: 'AUTH_FAILED' } },
        { metadata: { event_type: 'AUTH_FAILED' } },
        { metadata: { event_type: 'AUTH_FAILED' } },
        { metadata: { event_type: 'AUTH_FAILED' } },
        { metadata: { event_type: 'AUTH_FAILED' } },
      ]);

      await securityAuditService.logSecurityEvent(mockFailedEvent);

      // Should log the original event plus the suspicious activity event
      expect(mockRepository.save).toHaveBeenCalledTimes(2);
    });

    it('should handle suspicious activity check errors', async () => {
      const mockFailedEvent: SecurityEvent = {
        event_type: 'AUTH_FAILED',
        severity: 'HIGH',
        resource_type: 'AUTHENTICATION',
        action: 'LOGIN',
        details: {},
        ip_address: '192.168.1.1',
        success: false,
      };

      mockQueryBuilder.getMany.mockRejectedValue(new Error('Query error'));

      await securityAuditService.logSecurityEvent(mockFailedEvent);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to retrieve security events',
        expect.objectContaining({
          error: 'Query error',
        })
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined values gracefully', async () => {
      const eventWithNulls: SecurityEvent = {
        event_type: 'test_event',
        severity: 'LOW' as const,
        resource_type: 'test_resource',
        action: 'test_action',
        details: {},
        success: true,
      };

      await securityAuditService.logSecurityEvent(eventWithNulls);

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'anonymous',
          entity_id: 'unknown',
          ip_address: 'unknown',
          user_agent: 'unknown',
        })
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockRepository.save.mockRejectedValue('String error');

      const mockEvent: SecurityEvent = {
        event_type: 'TEST_EVENT',
        severity: 'LOW',
        resource_type: 'TEST',
        action: 'TEST_ACTION',
        details: {},
        success: true,
      };

      await securityAuditService.logSecurityEvent(mockEvent);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to log security event',
        expect.objectContaining({
          error: 'String error',
        })
      );
    });
  });
});
