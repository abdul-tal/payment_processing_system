import jwt from 'jsonwebtoken';
import { User } from '../entities/User';
import { logger } from '../config/logger';

export interface JwtPayload {
  userId: string;
  username: string;
  email: string;
  iat?: number;
  exp?: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

class SimpleJwtService {
  private static instance: SimpleJwtService;
  private accessTokenSecret: string;
  private refreshTokenSecret: string;
  private accessTokenExpiry: string;
  private refreshTokenExpiry: string;

  private constructor() {
    this.accessTokenSecret =
      process.env['JWT_ACCESS_SECRET'] || 'default-access-secret';
    this.refreshTokenSecret =
      process.env['JWT_REFRESH_SECRET'] || 'default-refresh-secret';
    this.accessTokenExpiry = process.env['JWT_ACCESS_EXPIRY'] || '15m';
    this.refreshTokenExpiry = process.env['JWT_REFRESH_EXPIRY'] || '7d';

    if (
      !process.env['JWT_ACCESS_SECRET'] ||
      !process.env['JWT_REFRESH_SECRET']
    ) {
      logger.warn(
        'JWT secrets not found in environment variables. Using default secrets.'
      );
    }
  }

  public static getInstance(): SimpleJwtService {
    if (!SimpleJwtService.instance) {
      SimpleJwtService.instance = new SimpleJwtService();
    }
    return SimpleJwtService.instance;
  }

  /**
   * Generate access and refresh token pair for a user
   */
  public generateTokenPair(user: User): TokenPair {
    const accessTokenPayload: JwtPayload = {
      userId: user.id,
      username: user.username,
      email: user.email,
    };

    const refreshTokenPayload = {
      userId: user.id,
      type: 'refresh',
    };

    const accessToken = jwt.sign(accessTokenPayload, this.accessTokenSecret, {
      expiresIn: this.accessTokenExpiry,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(
      refreshTokenPayload,
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
      } as jwt.SignOptions
    );

    // Calculate expiration time in seconds
    const expiresIn = this.parseExpiryToSeconds(this.accessTokenExpiry);

    return {
      accessToken,
      refreshToken,
      expiresIn,
    };
  }

  /**
   * Verify access token and return payload
   */
  public verifyAccessToken(token: string): JwtPayload | null {
    try {
      const payload = jwt.verify(token, this.accessTokenSecret) as JwtPayload;
      return payload;
    } catch (error) {
      logger.debug('Access token verification failed:', error);
      return null;
    }
  }

  /**
   * Verify refresh token and return payload
   */
  public verifyRefreshToken(token: string): JwtPayload | null {
    try {
      const payload = jwt.verify(token, this.refreshTokenSecret) as JwtPayload;
      return payload;
    } catch (error) {
      logger.debug('Refresh token verification failed:', error);
      return null;
    }
  }

  /**
   * Generate new access token from refresh token
   */
  public refreshAccessToken(refreshToken: string, user: User): string {
    try {
      const refreshPayload = this.verifyRefreshToken(refreshToken);

      if (!refreshPayload || refreshPayload.userId !== user.id) {
        throw new Error('Refresh token does not match user');
      }

      const accessTokenPayload: JwtPayload = {
        userId: user.id,
        username: user.username,
        email: user.email,
      };

      return jwt.sign(accessTokenPayload, this.accessTokenSecret, {
        expiresIn: this.accessTokenExpiry,
      } as jwt.SignOptions);
    } catch (error) {
      logger.error('Token refresh failed:', error);
      throw new Error('Token refresh failed');
    }
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) return 900; // Default 15 minutes

    const value = parseInt(match[1] || '0');
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 900;
    }
  }
}

export const jwtService = SimpleJwtService.getInstance();
