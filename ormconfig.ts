import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export default new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  username: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || '',
  database: process.env['DB_NAME'] || 'payment_backend',
  ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: process.env['NODE_ENV'] === 'development',
  entities: ['src/entities/**/*.ts'],
  migrations: ['migrations/**/*.ts'],
  subscribers: ['src/subscribers/**/*.ts'],
});
