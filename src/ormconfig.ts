import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

// Check if we're running compiled JS files (not through ts-node or npm run dev)
const isCompiled =
  __filename.endsWith('.js') || process.argv.some(arg => arg.endsWith('.js'));

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  username: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || '',
  database: process.env['DB_NAME'] || 'payment_backend',
  ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: process.env['NODE_ENV'] === 'development',
  entities: isCompiled ? ['dist/entities/**/*.js'] : ['src/entities/**/*.ts'],
  migrations: isCompiled ? ['dist/migrations/**/*.js'] : ['migrations/**/*.ts'],
  subscribers: isCompiled
    ? ['dist/subscribers/**/*.js']
    : ['src/subscribers/**/*.ts'],
});
