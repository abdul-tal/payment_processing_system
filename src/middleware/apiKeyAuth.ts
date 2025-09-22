import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger';
import { AppDataSource } from '../ormconfig';
import { AuditLog } from '../entities/AuditLog';

export interface ApiKeyData {
  id: string;
  name: string;
  keyHash: string;
  permissions: string[];
  isActive: boolean;
  lastUsed: Date | null;
  createdAt: Date;
  expiresAt: Date | null;
  rateLimitPerMinute: number;
  ipWhitelist: string[];
}

export interface AuthenticatedRequest extends Request {
  apiKey?: ApiKeyData;
  correlationId?: string;
}

class ApiKeyManager {
  private static instance: ApiKeyManager;
  private apiKeys: Map<string, ApiKeyData> = new Map();
  private rateLimitTracker: Map<string, { count: number; resetTime: number }> =
    new Map();

  private constructor() {
    this.loadApiKeys();
    // Clean up rate limit tracker every minute
    setInterval(() => this.cleanupRateLimitTracker(), 60000);
  }

  public static getInstance(): ApiKeyManager {
    if (!ApiKeyManager.instance) {
      ApiKeyManager.instance = new ApiKeyManager();
    }
    return ApiKeyManager.instance;
  }

  private loadApiKeys(): void {
    // Load API keys from environment variables or database
    // For now, we'll use environment variables for simplicity
    const apiKeysConfig = process.env['API_KEYS_CONFIG'];

    if (apiKeysConfig) {
      try {
        const keys = JSON.parse(apiKeysConfig);
        keys.forEach((key: any) => {
          this.apiKeys.set(key.keyHash, {
            id: key.id,
            name: key.name,
            keyHash: key.keyHash,
            permissions: key.permissions || ['read', 'write'],
            isActive: key.isActive !== false,
            lastUsed: null,
            createdAt: new Date(key.createdAt),
            expiresAt: key.expiresAt ? new Date(key.expiresAt) : null,
            rateLimitPerMinute: key.rateLimitPerMinute || 100,
            ipWhitelist: key.ipWhitelist || [],
          });
        });
      } catch (error) {
        logger.error('Failed to parse API_KEYS_CONFIG', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Add default admin key if no keys are configured
    if (this.apiKeys.size === 0) {
      const defaultKey = process.env['DEFAULT_API_KEY'];
      if (defaultKey) {
        const keyHash = this.hashApiKey(defaultKey);
        this.apiKeys.set(keyHash, {
          id: 'default-admin',
          name: 'Default Admin Key',
          keyHash,
          permissions: ['admin', 'read', 'write', 'delete'],
          isActive: true,
          lastUsed: null,
          createdAt: new Date(),
          expiresAt: null,
          rateLimitPerMinute: 1000,
          ipWhitelist: [],
        });
      }
    }
  }

  private hashApiKey(apiKey: string): string {
    return crypto.createHash('sha256').update(apiKey).digest('hex');
  }

  private cleanupRateLimitTracker(): void {
    const now = Date.now();
    for (const [key, data] of this.rateLimitTracker.entries()) {
      if (now > data.resetTime) {
        this.rateLimitTracker.delete(key);
      }
    }
  }

  public validateApiKey(apiKey: string, clientIp: string): ApiKeyData | null {
    const keyHash = this.hashApiKey(apiKey);
    const keyData = this.apiKeys.get(keyHash);

    if (!keyData) {
      return null;
    }

    // Check if key is active
    if (!keyData.isActive) {
      logger.warn('Inactive API key used', { keyId: keyData.id, clientIp });
      return null;
    }

    // Check if key has expired
    if (keyData.expiresAt && new Date() > keyData.expiresAt) {
      logger.warn('Expired API key used', { keyId: keyData.id, clientIp });
      return null;
    }

    // Check IP whitelist
    if (
      keyData.ipWhitelist.length > 0 &&
      !keyData.ipWhitelist.includes(clientIp)
    ) {
      logger.warn('API key used from non-whitelisted IP', {
        keyId: keyData.id,
        clientIp,
        whitelist: keyData.ipWhitelist,
      });
      return null;
    }

    // Check rate limit
    const rateLimitKey = `${keyHash}:${clientIp}`;
    const now = Date.now();
    const resetTime = Math.floor(now / 60000) * 60000 + 60000; // Next minute boundary

    let rateLimitData = this.rateLimitTracker.get(rateLimitKey);
    if (!rateLimitData || now > rateLimitData.resetTime) {
      rateLimitData = { count: 0, resetTime };
      this.rateLimitTracker.set(rateLimitKey, rateLimitData);
    }

    if (rateLimitData.count >= keyData.rateLimitPerMinute) {
      logger.warn('API key rate limit exceeded', {
        keyId: keyData.id,
        clientIp,
        limit: keyData.rateLimitPerMinute,
      });
      return null;
    }

    // Increment rate limit counter
    rateLimitData.count++;

    // Update last used timestamp
    keyData.lastUsed = new Date();

    return keyData;
  }

  public hasPermission(keyData: ApiKeyData, permission: string): boolean {
    return (
      keyData.permissions.includes('admin') ||
      keyData.permissions.includes(permission)
    );
  }

  public generateApiKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  public addApiKey(keyData: Omit<ApiKeyData, 'keyHash' | 'lastUsed'>): string {
    const apiKey = this.generateApiKey();
    const keyHash = this.hashApiKey(apiKey);

    this.apiKeys.set(keyHash, {
      ...keyData,
      keyHash,
      lastUsed: null,
    });

    logger.info('New API key created', {
      keyId: keyData.id,
      name: keyData.name,
    });
    return apiKey;
  }

  public revokeApiKey(keyId: string): boolean {
    for (const [, keyData] of this.apiKeys.entries()) {
      if (keyData.id === keyId) {
        keyData.isActive = false;
        logger.info('API key revoked', { keyId });
        return true;
      }
    }
    return false;
  }

  public getApiKeyStats(): { total: number; active: number; expired: number } {
    let total = 0;
    let active = 0;
    let expired = 0;
    const now = new Date();

    for (const keyData of this.apiKeys.values()) {
      total++;
      if (!keyData.isActive) {
        continue;
      }
      if (keyData.expiresAt && now > keyData.expiresAt) {
        expired++;
      } else {
        active++;
      }
    }

    return { total, active, expired };
  }
}

const apiKeyManager = ApiKeyManager.getInstance();

/**
 * Middleware to authenticate API requests using API keys
 */
export const authenticateApiKey = (requiredPermission?: string) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Extract API key from header
      const apiKey = req.headers['x-api-key'] as string;

      if (!apiKey) {
        res.status(401).json({
          error: 'API key required',
          message: 'Please provide a valid API key in the X-API-Key header',
        });
        return;
      }

      // Get client IP
      const clientIp = req.ip || req.connection.remoteAddress || 'unknown';

      // Validate API key
      const keyData = apiKeyManager.validateApiKey(apiKey, clientIp);

      if (!keyData) {
        // Log failed authentication attempt
        await logSecurityEvent(req, 'API_KEY_AUTH_FAILED', {
          clientIp,
          userAgent: req.headers['user-agent'],
          endpoint: req.path,
        });

        res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid, expired, or revoked',
        });
        return;
      }

      // Check required permission
      if (
        requiredPermission &&
        !apiKeyManager.hasPermission(keyData, requiredPermission)
      ) {
        await logSecurityEvent(req, 'API_KEY_INSUFFICIENT_PERMISSIONS', {
          keyId: keyData.id,
          requiredPermission,
          userPermissions: keyData.permissions,
          endpoint: req.path,
        });

        res.status(403).json({
          error: 'Insufficient permissions',
          message: `This API key does not have the required '${requiredPermission}' permission`,
        });
        return;
      }

      // Attach API key data to request
      req.apiKey = keyData;

      // Log successful authentication
      await logSecurityEvent(req, 'API_KEY_AUTH_SUCCESS', {
        keyId: keyData.id,
        keyName: keyData.name,
        endpoint: req.path,
      });

      next();
    } catch (error) {
      logger.error('API key authentication error', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.status(500).json({
        error: 'Authentication error',
        message: 'An error occurred during authentication',
      });
    }
  };

  async function logSecurityEvent(
    req: AuthenticatedRequest,
    event: string,
    details: any
  ) {
    try {
      if (AppDataSource.isInitialized) {
        const auditLogRepository = AppDataSource.getRepository(AuditLog);
        await auditLogRepository.save({
          event_type: event,
          user_id: req.apiKey?.id || 'unknown',
          resource_type: 'API_KEY_AUTH',
          resource_id: req.path,
          details: JSON.stringify(details),
          ip_address: req.ip || 'unknown',
          user_agent: req.headers['user-agent'] || 'unknown',
          correlation_id: req.correlationId || 'unknown',
        });
      }
    } catch (error) {
      logger.error('Failed to log security event', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

/**
 * Middleware to require specific permissions
 */
export const requirePermission = (permission: string) => {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.apiKey) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please authenticate with a valid API key first',
      });
      return;
    }

    if (!apiKeyManager.hasPermission(req.apiKey, permission)) {
      res.status(403).json({
        error: 'Insufficient permissions',
        message: `This operation requires '${permission}' permission`,
      });
      return;
    }

    next();
  };
};

/**
 * Middleware to check if user has admin permissions
 */
export const requireAdmin = requirePermission('admin');

/**
 * Middleware to check if user has write permissions
 */
export const requireWrite = requirePermission('write');

/**
 * Middleware to check if user has read permissions
 */
export const requireRead = requirePermission('read');

export { apiKeyManager };
