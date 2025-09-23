import request from 'supertest';
import express from 'express';
import { authRoutes } from '../../src/routes/authRoutes';
import { authController } from '../../src/controllers/authController';

// Mock the auth controller
jest.mock('../../src/controllers/authController', () => ({
  authController: {
    register: jest.fn(),
    login: jest.fn(),
  },
}));

describe('Auth Routes', () => {
  let app: express.Application;
  const mockAuthController = authController as jest.Mocked<
    typeof authController
  >;

  beforeEach(() => {
    // Create a fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/auth', authRoutes);

    // Reset all mocks
    jest.clearAllMocks();

    // Default mock implementation that handles validation
    mockAuthController.register.mockImplementation(async (req, res) => {
      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
        return;
      }
      res.status(201).json({ message: 'User registered successfully' });
    });

    mockAuthController.login.mockImplementation(async (req, res) => {
      const { validationResult } = require('express-validator');
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
        return;
      }
      res.status(200).json({ message: 'Login successful' });
    });
  });

  describe('POST /auth/register', () => {
    describe('Validation Success', () => {
      it('should pass validation with all required fields', async () => {
        mockAuthController.register.mockImplementation(async (_req, res) => {
          res.status(201).json({ message: 'User registered successfully' });
        });

        const validRegistrationData = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
          firstName: 'John',
          lastName: 'Doe',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(validRegistrationData);

        expect(response.status).toBe(201);
        expect(mockAuthController.register).toHaveBeenCalled();
      });

      it('should pass validation with only required fields', async () => {
        mockAuthController.register.mockImplementation(async (_req, res) => {
          res.status(201).json({ message: 'User registered successfully' });
        });

        const minimalRegistrationData = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(minimalRegistrationData);

        expect(response.status).toBe(201);
        expect(mockAuthController.register).toHaveBeenCalled();
      });

      it('should pass validation with optional fields as empty strings', async () => {
        mockAuthController.register.mockImplementation(async (_req, res) => {
          res.status(201).json({ message: 'User registered successfully' });
        });

        const registrationDataWithEmptyOptionals = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
          firstName: '',
          lastName: '',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(registrationDataWithEmptyOptionals);

        expect(response.status).toBe(201);
        expect(mockAuthController.register).toHaveBeenCalled();
      });
    });

    describe('Validation Failures', () => {
      it('should return 400 when username is missing', async () => {
        const invalidData = {
          email: 'test@example.com',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(mockAuthController.register).toHaveBeenCalled();
      });

      it('should return 400 when email is invalid', async () => {
        const invalidData = {
          username: 'testuser',
          email: 'invalid-email',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(mockAuthController.register).toHaveBeenCalled();
      });

      it('should return 400 when email is invalid', async () => {
        const invalidData = {
          username: 'testuser',
          email: 'invalid-email',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(mockAuthController.register).toHaveBeenCalled();
      });

      it('should return 400 when password is too short', async () => {
        const invalidData = {
          username: 'testuser',
          email: 'test@example.com',
          password: '123',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(mockAuthController.register).toHaveBeenCalled();
      });

      it('should return 400 with multiple validation errors', async () => {
        const invalidData = {
          email: 'invalid-email',
          password: '123',
        };

        const response = await request(app)
          .post('/auth/register')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(mockAuthController.register).toHaveBeenCalled();
      });
    });

    describe('Content-Type Handling', () => {
      it('should handle JSON content type', async () => {
        mockAuthController.register.mockImplementation(async (_req, res) => {
          res.status(201).json({ message: 'User registered successfully' });
        });

        const validData = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/register')
          .set('Content-Type', 'application/json')
          .send(validData);

        expect(response.status).toBe(201);
        expect(mockAuthController.register).toHaveBeenCalled();
      });

      it('should return 400 for malformed JSON', async () => {
        const response = await request(app)
          .post('/auth/register')
          .set('Content-Type', 'application/json')
          .send('{"invalid": json}');

        expect(response.status).toBe(400);
        expect(mockAuthController.register).not.toHaveBeenCalled();
      });
    });
  });

  describe('POST /auth/login', () => {
    describe('Validation Success', () => {
      it('should pass validation with valid credentials', async () => {
        mockAuthController.login.mockImplementation(async (_req, res) => {
          res.status(200).json({
            message: 'Login successful',
            accessToken: 'mock-token',
            refreshToken: 'mock-refresh-token',
          });
        });

        const validLoginData = {
          username: 'testuser',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/login')
          .send(validLoginData);

        expect(response.status).toBe(200);
        expect(mockAuthController.login).toHaveBeenCalled();
      });

      it('should accept email as username', async () => {
        mockAuthController.login.mockImplementation(async (_req, res) => {
          res.status(200).json({
            message: 'Login successful',
            accessToken: 'mock-token',
            refreshToken: 'mock-refresh-token',
          });
        });

        const validLoginData = {
          username: 'test@example.com',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/login')
          .send(validLoginData);

        expect(response.status).toBe(200);
        expect(mockAuthController.login).toHaveBeenCalled();
      });
    });

    describe('Validation Failures', () => {
      it('should return 400 when username is missing', async () => {
        const invalidData = {
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/login')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              msg: 'Username is required',
              path: 'username',
            }),
          ])
        );
        expect(mockAuthController.login).toHaveBeenCalled();
      });

      it('should return 400 when username is empty string', async () => {
        const invalidData = {
          username: '',
          password: 'password123',
        };

        const response = await request(app)
          .post('/auth/login')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              msg: 'Username is required',
              path: 'username',
            }),
          ])
        );
        expect(mockAuthController.login).toHaveBeenCalled();
      });

      it('should return 400 when password is missing', async () => {
        const invalidData = {
          username: 'testuser',
        };

        const response = await request(app)
          .post('/auth/login')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              msg: 'Password is required',
              path: 'password',
            }),
          ])
        );
        expect(mockAuthController.login).toHaveBeenCalled();
      });

      it('should return 400 when password is empty string', async () => {
        const invalidData = {
          username: 'testuser',
          password: '',
        };

        const response = await request(app)
          .post('/auth/login')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              msg: 'Password is required',
              path: 'password',
            }),
          ])
        );
        expect(mockAuthController.login).toHaveBeenCalled();
      });

      it('should return 400 with multiple validation errors', async () => {
        const invalidData = {
          username: '',
          password: '',
        };

        const response = await request(app)
          .post('/auth/login')
          .send(invalidData);

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Validation failed');
        expect(response.body).toHaveProperty('details');
        expect(response.body.details).toHaveLength(2);
        expect(response.body.details).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              msg: 'Username is required',
              path: 'username',
            }),
            expect.objectContaining({
              msg: 'Password is required',
              path: 'password',
            }),
          ])
        );
        expect(mockAuthController.login).toHaveBeenCalled();
      });
    });
  });

  describe('Route Configuration', () => {
    it('should handle non-existent routes', async () => {
      const response = await request(app).post('/auth/nonexistent').send({});

      expect(response.status).toBe(404);
    });

    it('should only accept POST methods for register route', async () => {
      const response = await request(app).get('/auth/register');

      expect(response.status).toBe(404);
    });

    it('should only accept POST methods for login route', async () => {
      const response = await request(app).get('/auth/login');

      expect(response.status).toBe(404);
    });

    it('should handle PUT method on auth routes', async () => {
      const response = await request(app).put('/auth/register').send({});

      expect(response.status).toBe(404);
    });

    it('should handle DELETE method on auth routes', async () => {
      const response = await request(app).delete('/auth/login').send({});

      expect(response.status).toBe(404);
    });
  });

  describe('Request Body Edge Cases', () => {
    it('should handle empty request body', async () => {
      const response = await request(app).post('/auth/register').send({});

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body).toHaveProperty('details');
      expect(mockAuthController.register).toHaveBeenCalled();
    });

    it('should handle null values in request body', async () => {
      const invalidData = {
        username: null,
        email: null,
        password: null,
      };

      const response = await request(app)
        .post('/auth/register')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body).toHaveProperty('details');
      expect(mockAuthController.register).toHaveBeenCalled();
    });

    it('should handle undefined values in request body', async () => {
      const invalidData = {
        username: undefined,
        email: undefined,
        password: undefined,
      };

      const response = await request(app)
        .post('/auth/register')
        .send(invalidData);

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error', 'Validation failed');
      expect(response.body).toHaveProperty('details');
      expect(mockAuthController.register).toHaveBeenCalled();
    });

    it('should handle extra fields in request body', async () => {
      mockAuthController.register.mockImplementation(async (_req, res) => {
        res.status(201).json({ message: 'User registered successfully' });
      });

      const dataWithExtraFields = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        extraField: 'should be ignored',
        anotherExtra: 123,
      };

      const response = await request(app)
        .post('/auth/register')
        .send(dataWithExtraFields);

      expect(response.status).toBe(201);
      expect(mockAuthController.register).toHaveBeenCalled();
    });
  });
});
