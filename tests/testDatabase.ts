import { DataSource } from 'typeorm';
import { config } from 'dotenv';

// Load test environment
config({ path: '.env.test' });

export const TestDataSource = new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  username: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || '',
  database: process.env['DB_NAME'] || 'payment_backend_test',
  ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: true, // Enable for tests
  logging: false,
  dropSchema: true, // Clean slate for each test run
  entities: ['src/entities/**/*.ts'],
  migrations: ['migrations/**/*.ts'],
});

export async function setupTestDatabase(): Promise<void> {
  if (!TestDataSource.isInitialized) {
    await TestDataSource.initialize();
  }
}

export async function teardownTestDatabase(): Promise<void> {
  if (TestDataSource.isInitialized) {
    await TestDataSource.destroy();
  }
}
