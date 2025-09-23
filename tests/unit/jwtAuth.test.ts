import { Response, NextFunction } from 'express';
import { Repository } from 'typeorm';
import { jwtAuth, AuthenticatedRequest } from '../../src/middleware/jwtAuth';
import { User } from '../../src/entities/User';
import { jwtService } from '../../src/services/jwtService';
import { logger } from '../../src/config/logger';
import { AppDataSource } from '../../src/ormconfig';

// Mock all external dependencies BEFORE importing the middleware
jest.mock('../../src/ormconfig');
jest.mock('../../src/services/jwtService');
jest.mock('../../src/config/logger');

// Create a mock repository that we can control
const mockUserRepository = {
  findOne: jest.fn(),
} as unknown as jest.Mocked<Repository<User>>;

// Mock AppDataSource.getRepository to return our mock repository
(AppDataSource.getRepository as jest.Mock).mockReturnValue(mockUserRepository);

describe('jwtAuth Middleware', () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let mockUser: User;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock request object
    mockRequest = {
      headers: {},
    };

    // Mock response object
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Mock next function
    mockNext = jest.fn();

    // Reset the global mock repository
    mockUserRepository.findOne.mockReset();

    // Create mock user
    mockUser = new User();
    mockUser.id = 'test-user-id';
    mockUser.username = 'testuser';
    mockUser.email = 'test@example.com';
    mockUser.first_name = 'John';
    mockUser.last_name = 'Doe';
    mockUser.created_at = new Date();
    mockUser.updated_at = new Date();

    // Mock logger
    (logger.error as jest.Mock).mockImplementation(() => {});
  });

  describe('Authentication Success', () => {
    it('should authenticate user with valid Bearer token', async () => {
      const mockPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-token',
      };

      (jwtService.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(jwtService.verifyAccessToken).toHaveBeenCalledWith(
        'valid-jwt-token'
      );
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'test-user-id' },
        select: [
          'id',
          'username',
          'email',
          'first_name',
          'last_name',
          'created_at',
          'updated_at',
        ],
      });
      expect(mockRequest.user).toBe(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockResponse.json).not.toHaveBeenCalled();
    });

    it('should handle authorization header without Bearer prefix', async () => {
      mockRequest.headers = {
        authorization: 'valid-jwt-token',
      };

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Access token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Authentication Failures', () => {
    it('should return 401 when no authorization header is provided', async () => {
      mockRequest.headers = {};

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Access token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when authorization header is empty', async () => {
      mockRequest.headers = {
        authorization: '',
      };

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Access token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when Bearer token is empty', async () => {
      mockRequest.headers = {
        authorization: 'Bearer ',
      };

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Access token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when JWT token is invalid', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      (jwtService.verifyAccessToken as jest.Mock).mockReturnValue(null);

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(jwtService.verifyAccessToken).toHaveBeenCalledWith(
        'invalid-token'
      );
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid or expired token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not found in database', async () => {
      const mockPayload = {
        userId: 'non-existent-user-id',
        username: 'testuser',
        email: 'test@example.com',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-token',
      };

      (jwtService.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);
      mockUserRepository.findOne.mockResolvedValue(null);

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'non-existent-user-id' },
        select: [
          'id',
          'username',
          'email',
          'first_name',
          'last_name',
          'created_at',
          'updated_at',
        ],
      });
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'User not found',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle JWT verification errors', async () => {
      mockRequest.headers = {
        authorization: 'Bearer malformed-token',
      };

      (jwtService.verifyAccessToken as jest.Mock).mockImplementation(() => {
        throw new Error('JWT verification failed');
      });

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(logger.error).toHaveBeenCalledWith(
        'JWT authentication error:',
        expect.any(Error)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const mockPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-jwt-token',
      };

      (jwtService.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);
      mockUserRepository.findOne.mockRejectedValue(new Error('Database error'));

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(logger.error).toHaveBeenCalledWith(
        'JWT authentication error:',
        expect.any(Error)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Authentication failed',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases', () => {
    it('should handle case-sensitive Bearer prefix', async () => {
      mockRequest.headers = {
        authorization: 'bearer valid-jwt-token',
      };

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Access token required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle authorization header with extra spaces', async () => {
      mockRequest.headers = {
        authorization: 'Bearer  valid-jwt-token  ',
      };

      const mockPayload = {
        userId: 'test-user-id',
        username: 'testuser',
        email: 'test@example.com',
      };

      (jwtService.verifyAccessToken as jest.Mock).mockReturnValue(mockPayload);
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await jwtAuth(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );

      expect(jwtService.verifyAccessToken).toHaveBeenCalledWith(
        ' valid-jwt-token  '
      );
      expect(mockRequest.user).toBe(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
