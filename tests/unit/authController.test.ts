import { Request, Response } from 'express';
import { Repository } from 'typeorm';
import { validationResult } from 'express-validator';
import * as bcrypt from 'bcrypt';
import { User } from '../../src/entities/User';
import { jwtService } from '../../src/services/jwtService';
import { logger } from '../../src/config/logger';
import { AppDataSource } from '../../src/ormconfig';

// Mock all external dependencies BEFORE importing the controller
jest.mock('../../src/ormconfig');
jest.mock('../../src/services/jwtService');
jest.mock('../../src/config/logger');
jest.mock('bcrypt');

// Mock express-validator with a factory function
jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
}));

// Create a mock repository that we can control
const mockUserRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
} as unknown as jest.Mocked<Repository<User>>;

// Mock AppDataSource.getRepository to return our mock repository
(AppDataSource.getRepository as jest.Mock).mockReturnValue(mockUserRepository);

// Now import the controller after mocks are set up
import { authController } from '../../src/controllers/authController';

describe('AuthController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockUser: User;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Mock request object
    mockRequest = {
      body: {},
      correlationId: 'test-correlation-id',
    };

    // Mock response object
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Reset the global mock repository
    mockUserRepository.findOne.mockReset();
    mockUserRepository.save.mockReset();

    // Create mock user
    mockUser = new User();
    mockUser.id = 'test-user-id';
    mockUser.username = 'testuser';
    mockUser.email = 'test@example.com';
    mockUser.first_name = 'John';
    mockUser.last_name = 'Doe';
    mockUser.password_hash = 'hashed-password';
    mockUser.created_at = new Date();
    mockUser.updated_at = new Date();

    // Mock User methods
    mockUser.setPassword = jest.fn().mockResolvedValue(undefined);
    mockUser.validatePassword = jest.fn().mockResolvedValue(true);
    mockUser.toJSON = jest.fn().mockReturnValue({
      id: mockUser.id,
      username: mockUser.username,
      email: mockUser.email,
      first_name: mockUser.first_name,
      last_name: mockUser.last_name,
      created_at: mockUser.created_at,
      updated_at: mockUser.updated_at,
    });

    // Mock logger
    (logger.info as jest.Mock).mockImplementation(() => {});
    (logger.error as jest.Mock).mockImplementation(() => {});

    // Mock bcrypt
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
  });

  describe('register', () => {
    beforeEach(() => {
      mockRequest.body = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };
    });

    it('should register a new user successfully', async () => {
      // Mock validation result - no errors
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      // Mock repository - user doesn't exist
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockImplementation((user: any) => {
        user.id = 'generated-user-id';
        return Promise.resolve(user);
      });

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: [{ username: 'testuser' }, { email: 'test@example.com' }],
      });
      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'User registered successfully',
        user: expect.objectContaining({
          username: 'testuser',
          email: 'test@example.com',
          first_name: 'John',
          last_name: 'Doe',
        }),
      });
      expect(logger.info).toHaveBeenCalledWith('User registered successfully', {
        userId: 'generated-user-id',
        username: 'testuser',
        email: 'test@example.com',
        correlationId: 'test-correlation-id',
      });
    });

    it('should return validation errors when input is invalid', async () => {
      const validationErrors = [
        { field: 'username', message: 'Username is required' },
        { field: 'email', message: 'Valid email is required' },
      ];

      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors,
      });

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: validationErrors,
      });
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should return conflict error when user already exists', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      // Mock repository - user already exists
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: [{ username: 'testuser' }, { email: 'test@example.com' }],
      });
      expect(mockResponse.status).toHaveBeenCalledWith(409);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'User already exists',
        message: 'A user with this username or email already exists',
      });
      expect(mockUserRepository.save).not.toHaveBeenCalled();
    });

    it('should handle registration with optional fields missing', async () => {
      mockRequest.body = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        // firstName and lastName are optional
      };

      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockResolvedValue(mockUser);

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserRepository.save).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it('should handle database errors during registration', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.save.mockRejectedValue(new Error('Database error'));

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Registration error:',
        expect.any(Error)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to register user',
      });
    });

    it('should handle password hashing errors', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(null);

      // Mock the User prototype setPassword method to throw an error
      const originalSetPassword = User.prototype.setPassword;
      User.prototype.setPassword = jest
        .fn()
        .mockRejectedValue(new Error('Hashing error'));

      await authController.register(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Registration error:',
        expect.any(Error)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to register user',
      });

      // Restore the original method
      User.prototype.setPassword = originalSetPassword;
    });
  });

  describe('login', () => {
    beforeEach(() => {
      mockRequest.body = {
        username: 'testuser',
        password: 'password123',
      };
    });

    it('should login user successfully with username', async () => {
      const mockTokenPair = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      };

      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      (jwtService.generateTokenPair as jest.Mock).mockReturnValue(
        mockTokenPair
      );

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: [{ username: 'testuser' }, { email: 'testuser' }],
        select: [
          'id',
          'username',
          'email',
          'first_name',
          'last_name',
          'password_hash',
          'created_at',
          'updated_at',
        ],
      });
      expect(mockUser.validatePassword).toHaveBeenCalledWith('password123');
      expect(jwtService.generateTokenPair).toHaveBeenCalledWith(mockUser);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        message: 'Login successful',
        user: mockUser.toJSON(),
        tokens: mockTokenPair,
      });
      expect(logger.info).toHaveBeenCalledWith('User logged in successfully', {
        userId: mockUser.id,
        username: mockUser.username,
        correlationId: 'test-correlation-id',
      });
    });

    it('should login user successfully with email as username', async () => {
      mockRequest.body = {
        username: 'test@example.com', // Using email as username
        password: 'password123',
      };

      const mockTokenPair = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      };

      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      (jwtService.generateTokenPair as jest.Mock).mockReturnValue(
        mockTokenPair
      );

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: [
          { username: 'test@example.com' },
          { email: 'test@example.com' },
        ],
        select: [
          'id',
          'username',
          'email',
          'first_name',
          'last_name',
          'password_hash',
          'created_at',
          'updated_at',
        ],
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should return validation errors when input is invalid', async () => {
      const validationErrors = [
        { field: 'username', message: 'Username is required' },
        { field: 'password', message: 'Password is required' },
      ];

      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => false,
        array: () => validationErrors,
      });

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: validationErrors,
      });
      expect(mockUserRepository.findOne).not.toHaveBeenCalled();
    });

    it('should return unauthorized when user does not exist', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(null);

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserRepository.findOne).toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect',
      });
      expect(jwtService.generateTokenPair).not.toHaveBeenCalled();
    });

    it('should return unauthorized when password is invalid', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUser.validatePassword = jest.fn().mockResolvedValue(false);

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockUserRepository.findOne).toHaveBeenCalled();
      expect(mockUser.validatePassword).toHaveBeenCalledWith('password123');
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect',
      });
      expect(jwtService.generateTokenPair).not.toHaveBeenCalled();
    });

    it('should handle database errors during login', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockRejectedValue(new Error('Database error'));

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Login error:',
        expect.any(Error)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to login',
      });
    });

    it('should handle password validation errors', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUser.validatePassword = jest
        .fn()
        .mockRejectedValue(new Error('Validation error'));

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Login error:',
        expect.any(Error)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to login',
      });
    });

    it('should handle JWT token generation errors', async () => {
      (validationResult as unknown as jest.Mock).mockReturnValue({
        isEmpty: () => true,
        array: () => [],
      });

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUser.validatePassword = jest.fn().mockResolvedValue(true);
      (jwtService.generateTokenPair as jest.Mock).mockImplementation(() => {
        throw new Error('Token generation error');
      });

      await authController.login(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Login error:',
        expect.any(Error)
      );
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'Internal server error',
        message: 'Failed to login',
      });
    });
  });
});
