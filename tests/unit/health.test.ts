import request from 'supertest';
import { createApp } from '../../src/app';

describe('Health Check', () => {
  let app: any;

  beforeAll(() => {
    app = createApp();
  });

  it('should return health status', async () => {
    const response = await request(app).get('/health');

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
