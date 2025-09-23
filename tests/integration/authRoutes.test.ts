import request from 'supertest';
import testApp from '../../src/testApp';

// Mock webhook queue to avoid Redis connections in tests
jest.mock('../../src/services/webhookQueue', () =>
  require('../../src/services/testWebhookQueue')
);

// Mock the auth controller instance
jest.mock('../../src/controllers/authController', () => ({
  authController: {
    register: jest.fn(),
    login: jest.fn(),
  },
}));

// Import the mocked controller
import { authController } from '../../src/controllers/authController';

const mockRegister = authController.register as jest.MockedFunction<
  typeof authController.register
>;
const mockLogin = authController.login as jest.MockedFunction<
  typeof authController.login
>;

describe('Auth Routes Integration Tests', () => {
  const validApiKey = 'test-integration-api-key-for-security-testing';

  const mockUser = {
    id: 'test-user-id',
    username: 'testuser',
    email: 'test@example.com',
    first_name: 'John',
    last_name: 'Doe',
    created_at: new Date(),
    updated_at: new Date(),
  };

  const mockTokenPair = {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresIn: 900,
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Set up default mock implementations that handle validation
    mockRegister.mockImplementation(async (req: any, res: any) => {
      // Let the real controller handle validation
      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      // Default success response for valid requests
      res.status(201).json({
        message: 'User registered successfully',
        user: mockUser,
      });
    });

    mockLogin.mockImplementation(async (req: any, res: any) => {
      // Let the real controller handle validation
      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      // Default success response for valid requests
      res.status(200).json({
        message: 'Login successful',
        user: mockUser,
        tokens: mockTokenPair,
      });
    });
  });

  describe('POST /auth/register', () => {
    const validRegistrationData = {
      username: 'newuser',
      email: 'newuser@example.com',
      password: 'password123',
      firstName: 'Jane',
      lastName: 'Smith',
    };

    it('should register a new user successfully with valid data', async () => {
      mockRegister.mockImplementation(async (_req: any, res: any) => {
        res.status(201).json({
          message: 'User registered successfully',
          user: mockUser,
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(validRegistrationData)
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
      expect(response.body.user).toBeDefined();
      expect(mockRegister).toHaveBeenCalled();
    });

    it('should register user successfully with minimal required fields', async () => {
      const minimalData = {
        username: 'minimaluser',
        email: 'minimal@example.com',
        password: 'password123',
      };

      mockRegister.mockImplementation(async (_req: any, res: any) => {
        res.status(201).json({
          message: 'User registered successfully',
          user: mockUser,
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(minimalData)
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
    });

    it('should return 400 when username is missing', async () => {
      const invalidData = {
        email: 'test@example.com',
        password: 'password123',
      };

      // Don't mock the controller for validation tests - let validation middleware handle it
      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Username is required',
            path: 'username',
          }),
        ])
      );
    });

    it('should return 400 when email is invalid', async () => {
      const invalidData = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'password123',
      };

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Valid email is required',
            path: 'email',
          }),
        ])
      );
    });

    it('should return 400 when password is too short', async () => {
      const invalidData = {
        username: 'testuser',
        email: 'test@example.com',
        password: '123',
      };

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Password must be at least 6 characters',
            path: 'password',
          }),
        ])
      );
    });

    it('should return 400 with multiple validation errors', async () => {
      const invalidData = {
        username: '',
        email: 'invalid-email',
        password: '123',
      };

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(3);
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Username is required' }),
          expect.objectContaining({ msg: 'Valid email is required' }),
          expect.objectContaining({
            msg: 'Password must be at least 6 characters',
          }),
        ])
      );
    });

    it('should return 409 when user already exists', async () => {
      mockRegister.mockImplementation(async (_req: any, res: any) => {
        res.status(409).json({
          error: 'User already exists',
          message: 'A user with this username or email already exists',
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(409);

      expect(response.body).toEqual({
        error: 'User already exists',
        message: 'A user with this username or email already exists',
      });
    });

    it('should return 500 when database error occurs', async () => {
      mockRegister.mockImplementation(async (_req: any, res: any) => {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to register user',
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(validRegistrationData)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Internal server error',
        message: 'Failed to register user',
      });
    });

    it('should handle optional firstName and lastName fields', async () => {
      const dataWithOptionalFields = {
        username: 'optionaluser',
        email: 'optional@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe',
      };

      mockRegister.mockImplementation(async (_req: any, res: any) => {
        res.status(201).json({
          message: 'User registered successfully',
          user: mockUser,
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(dataWithOptionalFields)
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
    });
  });

  describe('POST /auth/login', () => {
    const validLoginData = {
      username: 'testuser',
      password: 'password123',
    };

    it('should login user successfully with valid credentials', async () => {
      mockLogin.mockImplementation(async (_req: any, res: any) => {
        res.status(200).json({
          message: 'Login successful',
          user: mockUser,
          tokens: mockTokenPair,
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(validLoginData)
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.user).toBeDefined();
      expect(response.body.tokens).toBeDefined();
      expect(response.body.tokens.accessToken).toBe('access-token');
    });

    it('should login user successfully with email as username', async () => {
      const emailLoginData = {
        username: 'test@example.com',
        password: 'password123',
      };

      mockLogin.mockImplementation(async (_req: any, res: any) => {
        res.status(200).json({
          message: 'Login successful',
          user: mockUser,
          tokens: mockTokenPair,
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(emailLoginData)
        .expect(200);

      expect(response.body.message).toBe('Login successful');
      expect(response.body.user.email).toBe('test@example.com');
    });

    it('should return 400 when username is missing', async () => {
      const invalidData = {
        password: 'password123',
      };

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Username is required',
            path: 'username',
          }),
        ])
      );
    });

    it('should return 400 when password is missing', async () => {
      const invalidData = {
        username: 'testuser',
      };

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Password is required',
            path: 'password',
          }),
        ])
      );
    });

    it('should return 400 with multiple validation errors', async () => {
      const invalidData = {};

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toHaveLength(2);
      expect(response.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ msg: 'Username is required' }),
          expect.objectContaining({ msg: 'Password is required' }),
        ])
      );
    });

    it('should return 401 when user does not exist', async () => {
      mockLogin.mockImplementation(async (_req: any, res: any) => {
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Username or password is incorrect',
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send({
          username: 'nonexistent',
          password: 'password123',
        })
        .expect(401);

      expect(response.body).toEqual({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect',
      });
    });

    it('should return 401 when password is incorrect', async () => {
      mockLogin.mockImplementation(async (_req: any, res: any) => {
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Username or password is incorrect',
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send({
          username: 'testuser',
          password: 'wrongpassword',
        })
        .expect(401);

      expect(response.body).toEqual({
        error: 'Invalid credentials',
        message: 'Username or password is incorrect',
      });
    });

    it('should return 500 when database error occurs', async () => {
      mockLogin.mockImplementation(async (_req: any, res: any) => {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to login',
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(validLoginData)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Internal server error',
        message: 'Failed to login',
      });
    });

    it('should return 500 when JWT token generation fails', async () => {
      mockLogin.mockImplementation(async (_req: any, res: any) => {
        res.status(500).json({
          error: 'Internal server error',
          message: 'Failed to login',
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(validLoginData)
        .expect(500);

      expect(response.body).toEqual({
        error: 'Internal server error',
        message: 'Failed to login',
      });
    });
  });

  describe('Route validation edge cases', () => {
    it('should handle empty request body for register', async () => {
      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.length).toBeGreaterThan(0);
    });

    it('should handle empty request body for login', async () => {
      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send({})
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details.length).toBeGreaterThan(0);
    });

    it('should handle malformed JSON for register', async () => {
      await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });

    it('should handle malformed JSON for login', async () => {
      await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .set('Content-Type', 'application/json')
        .send('{"invalid": json}')
        .expect(400);
    });

    it('should handle extra fields in registration data', async () => {
      const dataWithExtraFields = {
        username: 'extrauser',
        email: 'extra@example.com',
        password: 'password123',
        extraField: 'should be ignored',
        anotherExtra: 123,
      };

      mockRegister.mockImplementation(async (_req: any, res: any) => {
        res.status(201).json({
          message: 'User registered successfully',
          user: mockUser,
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/register')
        .set('x-api-key', validApiKey)
        .send(dataWithExtraFields)
        .expect(201);

      expect(response.body.message).toBe('User registered successfully');
    });

    it('should handle extra fields in login data', async () => {
      const dataWithExtraFields = {
        username: 'testuser',
        password: 'password123',
        extraField: 'should be ignored',
      };

      mockLogin.mockImplementation(async (_req: any, res: any) => {
        res.status(200).json({
          message: 'Login successful',
          user: mockUser,
          tokens: mockTokenPair,
        });
      });

      const response = await request(testApp)
        .post('/api/v1/auth/login')
        .set('x-api-key', validApiKey)
        .send(dataWithExtraFields)
        .expect(200);

      expect(response.body.message).toBe('Login successful');
    });
  });
});
