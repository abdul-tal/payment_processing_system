import jwt from 'jsonwebtoken';
import { jwtService, JwtPayload } from '../../src/services/jwtService';
import { User } from '../../src/entities/User';
import { logger } from '../../src/config/logger';

// Mock external dependencies
jest.mock('jsonwebtoken');
jest.mock('../../src/config/logger');

describe('JwtService', () => {
  let mockUser: User;
  const mockJwt = jwt as jest.Mocked<typeof jwt>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock user
    mockUser = new User();
    mockUser.id = 'test-user-id';
    mockUser.username = 'testuser';
    mockUser.email = 'test@example.com';

    // Mock logger
    (logger.warn as jest.Mock).mockImplementation(() => {});
    (logger.debug as jest.Mock).mockImplementation(() => {});
    (logger.error as jest.Mock).mockImplementation(() => {});
  });

  describe('Singleton Pattern', () => {
    it('should return the same instance when called multiple times', () => {
      const instance1 = jwtService;
      const instance2 = jwtService;

      expect(instance1).toBe(instance2);
    });
  });

  describe('generateTokenPair', () => {
    it('should generate access and refresh tokens for a user', () => {
      const mockAccessToken = 'mock-access-token';
      const mockRefreshToken = 'mock-refresh-token';

      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce(mockAccessToken)
        .mockReturnValueOnce(mockRefreshToken);

      const result = jwtService.generateTokenPair(mockUser);

      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        expiresIn: expect.any(Number),
      });

      // Verify access token generation
      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: mockUser.id,
          username: mockUser.username,
          email: mockUser.email,
        },
        expect.any(String),
        { expiresIn: expect.any(String) }
      );

      // Verify refresh token generation call count
      expect(mockJwt.sign).toHaveBeenCalledTimes(2);
    });

    it('should handle JWT signing errors', () => {
      (mockJwt.sign as jest.Mock).mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      expect(() => jwtService.generateTokenPair(mockUser)).toThrow(
        'JWT signing failed'
      );
    });
  });

  describe('verifyAccessToken', () => {
    it('should verify and return payload for valid access token', () => {
      const mockPayload: JwtPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900, // 15 minutes
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = jwtService.verifyAccessToken('valid-token');

      expect(result).toEqual(mockPayload);
      expect(mockJwt.verify).toHaveBeenCalledWith(
        'valid-token',
        expect.any(String)
      );
    });

    it('should return null for invalid access token', () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result = jwtService.verifyAccessToken('invalid-token');

      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith(
        'Access token verification failed:',
        expect.any(Error)
      );
    });

    it('should return null for expired access token', () => {
      const expiredError = new Error('Token expired');
      expiredError.name = 'TokenExpiredError';
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw expiredError;
      });

      const result = jwtService.verifyAccessToken('expired-token');

      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith(
        'Access token verification failed:',
        expect.any(Error)
      );
    });

    it('should handle malformed tokens', () => {
      const malformedError = new Error('Malformed token');
      malformedError.name = 'JsonWebTokenError';
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw malformedError;
      });

      const result = jwtService.verifyAccessToken('malformed-token');

      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith(
        'Access token verification failed:',
        expect.any(Error)
      );
    });
  });

  describe('verifyRefreshToken', () => {
    it('should verify and return payload for valid refresh token', () => {
      const mockPayload: JwtPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 604800, // 7 days
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      const result = jwtService.verifyRefreshToken('valid-refresh-token');

      expect(result).toEqual(mockPayload);
      expect(mockJwt.verify).toHaveBeenCalledWith(
        'valid-refresh-token',
        expect.any(String)
      );
    });

    it('should return null for invalid refresh token', () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid refresh token');
      });

      const result = jwtService.verifyRefreshToken('invalid-refresh-token');

      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith(
        'Refresh token verification failed:',
        expect.any(Error)
      );
    });

    it('should return null for expired refresh token', () => {
      const expiredError = new Error('Refresh token expired');
      expiredError.name = 'TokenExpiredError';
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw expiredError;
      });

      const result = jwtService.verifyRefreshToken('expired-refresh-token');

      expect(result).toBeNull();
      expect(logger.debug).toHaveBeenCalledWith(
        'Refresh token verification failed:',
        expect.any(Error)
      );
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new access token from valid refresh token', () => {
      const mockPayload: JwtPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
      };

      const mockNewAccessToken = 'new-access-token';

      // Mock refresh token verification
      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);
      // Mock new access token generation
      (mockJwt.sign as jest.Mock).mockReturnValue(mockNewAccessToken);

      const result = jwtService.refreshAccessToken(
        'valid-refresh-token',
        mockUser
      );

      expect(result).toBe(mockNewAccessToken);
      expect(mockJwt.verify).toHaveBeenCalledWith(
        'valid-refresh-token',
        expect.any(String)
      );
    });

    it('should throw error for invalid refresh token', () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid refresh token');
      });

      expect(() =>
        jwtService.refreshAccessToken('invalid-refresh-token', mockUser)
      ).toThrow('Token refresh failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Token refresh failed:',
        expect.any(Error)
      );
    });

    it('should throw error when refresh token user ID does not match', () => {
      const mockPayload: JwtPayload = {
        userId: 'different-user-id',
        username: 'testuser',
        email: 'test@example.com',
      };

      (mockJwt.verify as jest.Mock).mockReturnValue(mockPayload);

      expect(() =>
        jwtService.refreshAccessToken('valid-refresh-token', mockUser)
      ).toThrow('Token refresh failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Token refresh failed:',
        expect.any(Error)
      );
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle user with missing properties', () => {
      const incompleteUser = new User();
      incompleteUser.id = 'test-id';
      // Missing username and email

      const mockAccessToken = 'mock-access-token';
      const mockRefreshToken = 'mock-refresh-token';

      (mockJwt.sign as jest.Mock)
        .mockReturnValueOnce(mockAccessToken)
        .mockReturnValueOnce(mockRefreshToken);

      const result = jwtService.generateTokenPair(incompleteUser);

      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        expiresIn: expect.any(Number),
      });

      expect(mockJwt.sign).toHaveBeenCalledWith(
        {
          userId: incompleteUser.id,
          username: incompleteUser.username, // undefined
          email: incompleteUser.email, // undefined
        },
        expect.any(String),
        { expiresIn: expect.any(String) }
      );
    });

    it('should handle null/undefined tokens gracefully', () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result1 = jwtService.verifyAccessToken(null as any);
      const result2 = jwtService.verifyAccessToken(undefined as any);
      const result3 = jwtService.verifyRefreshToken(null as any);
      const result4 = jwtService.verifyRefreshToken(undefined as any);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
      expect(result4).toBeNull();
    });

    it('should handle empty string tokens', () => {
      (mockJwt.verify as jest.Mock).mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const result1 = jwtService.verifyAccessToken('');
      const result2 = jwtService.verifyRefreshToken('');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });
});
