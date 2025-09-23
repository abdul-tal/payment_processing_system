import { Request, Response, NextFunction } from 'express';
import { jwtService } from '../services/SimpleJwtService';
import { AppDataSource } from '../ormconfig';
import { User } from '../entities/User';
import { logger } from '../config/logger';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * JWT authentication middleware
 */
export const jwtAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.substring(7)
        : null;

    if (!token) {
      res.status(401).json({ error: 'Access token required' });
      return;
    }

    // Verify the token
    const payload = jwtService.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({ error: 'Invalid or expired token' });
      return;
    }

    // Get user from database
    const userRepository = AppDataSource.getRepository(User);
    const user = await userRepository.findOne({
      where: { id: payload.userId },
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

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('JWT authentication error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};
