import { Request, Response } from 'express';
import { AppDataSource } from '../ormconfig';
import { User } from '../entities/User';
import { jwtService } from '../services/SimpleJwtService';
import { logger } from '../config/logger';
import { validationResult } from 'express-validator';

export interface AuthenticatedRequest extends Request {
  user?: User;
  correlationId?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  firstName?: string;
  lastName?: string;
}

class SimpleAuthController {
  private userRepository = AppDataSource.getRepository(User);

  /**
   * Register a new user
   */
  public register = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
        return;
      }

      const {
        username,
        email,
        password,
        firstName,
        lastName,
      }: RegisterRequest = req.body;

      // Check if user already exists
      const existingUser = await this.userRepository.findOne({
        where: [{ username }, { email }],
      });

      if (existingUser) {
        res.status(409).json({
          error: 'User already exists',
          message: 'A user with this username or email already exists',
        });
        return;
      }

      // Create new user
      const user = new User();
      user.username = username;
      user.email = email;
      if (firstName) user.first_name = firstName;
      if (lastName) user.last_name = lastName;

      await user.setPassword(password);
      await this.userRepository.save(user);

      logger.info('User registered successfully', {
        userId: user.id,
        username: user.username,
        email: user.email,
        correlationId: req.correlationId,
      });

      res.status(201).json({
        message: 'User registered successfully',
        user: user.toJSON(),
      });
    } catch (error) {
      logger.error('Registration error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to register user',
      });
    }
  };

  /**
   * Login user
   */
  public login = async (req: Request, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
        return;
      }

      const { username, password }: LoginRequest = req.body;

      // Find user by username or email (include password_hash for validation)
      const user = await this.userRepository.findOne({
        where: [{ username }, { email: username }],
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

      if (!user) {
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Username or password is incorrect',
        });
        return;
      }

      // Validate password
      const isValidPassword = await user.validatePassword(password);
      if (!isValidPassword) {
        res.status(401).json({
          error: 'Invalid credentials',
          message: 'Username or password is incorrect',
        });
        return;
      }

      // Generate JWT tokens
      const tokenPair = jwtService.generateTokenPair(user);

      logger.info('User logged in successfully', {
        userId: user.id,
        username: user.username,
        correlationId: req.correlationId,
      });

      res.status(200).json({
        message: 'Login successful',
        user: user.toJSON(),
        tokens: tokenPair,
      });
    } catch (error) {
      logger.error('Login error:', error);
      res.status(500).json({
        error: 'Internal server error',
        message: 'Failed to login',
      });
    }
  };
}

export const authController = new SimpleAuthController();
