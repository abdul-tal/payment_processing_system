import { Request, Response, NextFunction } from 'express';
import { SecurityAuditService } from '../services/SecurityAuditService';

export interface AuthenticatedRequest extends Request {
  apiKey?: {
    id: string;
    name: string;
    keyHash: string;
    permissions: string[];
    rateLimit: number;
    ipWhitelist: string[];
  };
  correlationId?: string;
}

/**
 * Test-specific API key authentication middleware that validates test API keys
 */
export const authenticateApiKey = () => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.headers['x-api-key'] as string;
    const validTestApiKey =
      process.env['DEFAULT_API_KEY'] ||
      'test-integration-api-key-for-security-testing';

    if (!apiKey) {
      // Log failed authentication attempt
      const auditService = SecurityAuditService.getInstance();
      auditService.logSecurityEvent({
        event_type: 'API_KEY_AUTH',
        severity: 'MEDIUM',
        user_id: 'anonymous',
        resource_type: 'AUTHENTICATION',
        action: 'USER_AUTHENTICATION',
        details: {
          auth_method: 'api_key',
          login_attempt_count: 1,
          mfa_used: false,
          session_duration: 0,
          failure_reason: 'missing_api_key',
        },
        ip_address: req.ip || 'unknown',
        user_agent: req.get('User-Agent') || 'unknown',
        correlation_id: req.correlationId || undefined,
        success: false,
      });
      return res.status(401).json({ error: 'API key required' });
    }

    if (apiKey !== validTestApiKey) {
      // Log failed authentication attempt
      const auditService = SecurityAuditService.getInstance();
      auditService.logSecurityEvent({
        event_type: 'API_KEY_AUTH',
        severity: 'HIGH',
        user_id: 'anonymous',
        resource_type: 'AUTHENTICATION',
        action: 'USER_AUTHENTICATION',
        details: {
          auth_method: 'api_key',
          login_attempt_count: 1,
          mfa_used: false,
          session_duration: 0,
          failure_reason: 'invalid_api_key',
        },
        ip_address: req.ip || 'unknown',
        user_agent: req.get('User-Agent') || 'unknown',
        correlation_id: req.correlationId || undefined,
        success: false,
      });
      return res.status(401).json({ error: 'Invalid API key' });
    }

    // Log successful authentication
    const auditService = SecurityAuditService.getInstance();
    auditService.logSecurityEvent({
      event_type: 'API_KEY_AUTH',
      severity: 'LOW',
      user_id: 'test-user',
      resource_type: 'AUTHENTICATION',
      action: 'USER_AUTHENTICATION',
      details: {
        auth_method: 'api_key',
        login_attempt_count: 1,
        mfa_used: false,
        session_duration: 0,
      },
      ip_address: req.ip || 'unknown',
      user_agent: req.get('User-Agent') || 'unknown',
      correlation_id: req.correlationId || undefined,
      success: true,
    });

    // Mock API key data for valid requests
    req.apiKey = {
      id: 'test-api-key-id',
      name: 'Test API Key',
      keyHash: 'test-hash',
      permissions: ['read', 'write', 'admin'],
      rateLimit: 1000,
      ipWhitelist: ['*'],
    };
    return next();
  };
};
