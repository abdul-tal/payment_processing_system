import request from 'supertest';
import { createTestApp } from '../../src/testApp';
import { Application } from 'express';

describe('Health Check', () => {
  let app: Application;

  beforeAll(() => {
    // Set test environment variable for API key
    process.env['DEFAULT_API_KEY'] = 'test-api-key-for-testing-purposes-only';
    app = createTestApp;
  });

  it('should return health status', async () => {
    const response = await request(app)
      .get('/api/v1/health')
      .set(
        'x-api-key',
        process.env['DEFAULT_API_KEY'] ||
          'test-api-key-for-testing-purposes-only'
      );

    // In test environment, database is disconnected so expect 503
    expect(response.status).toBe(503);
    expect(response.body).toHaveProperty('status', 'unhealthy');
    expect(response.body).toHaveProperty('timestamp');
    expect(response.body).toHaveProperty('version', '1.0.0');
    expect(response.body).toHaveProperty('environment', 'test');
    expect(response.body).toHaveProperty('services');
    expect(response.body.services).toHaveProperty('database', 'disconnected');
  });
});
