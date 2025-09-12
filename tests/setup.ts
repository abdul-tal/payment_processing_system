// Jest setup file for global test configuration
import dotenv from 'dotenv';
import { clearCleanupInterval } from '../src/middleware/idempotency';

// Load test environment variables
dotenv.config({ path: '.env.test' });

// Global test setup
beforeAll(() => {
  // Set test environment
  process.env['NODE_ENV'] = 'test';
});

afterAll(async () => {
  // Clear idempotency cleanup interval
  clearCleanupInterval();

  // Force close any remaining handles
  await new Promise(resolve => setTimeout(resolve, 100));
});

// Global test utilities can be added here
