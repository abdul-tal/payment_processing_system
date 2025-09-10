import request from 'supertest';
import app from '../../src/index';

describe('Health Check', () => {
  it('should return 200 and health status', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('status', 'OK');
    expect(response.body).toHaveProperty('service', 'payment-backend');
    expect(response.body).toHaveProperty('timestamp');
  });
});
