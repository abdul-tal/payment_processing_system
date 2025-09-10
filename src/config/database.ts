import { DataSource } from 'typeorm';
import { config } from 'dotenv';

config();

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] || 'localhost',
  port: parseInt(process.env['DB_PORT'] || '5432'),
  username: process.env['DB_USER'] || 'postgres',
  password: process.env['DB_PASSWORD'] || '',
  database: process.env['DB_NAME'] || 'payment_backend',
  ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false, // Always false in production, use migrations instead
  logging: process.env['NODE_ENV'] === 'development',
  entities: ['src/entities/**/*.ts'],
  migrations: ['migrations/**/*.ts'],
  subscribers: ['src/subscribers/**/*.ts'],
  // Connection pooling configuration
  extra: {
    connectionLimit: 10,
    acquireTimeout: 60000,
    timeout: 60000,
    reconnect: true,
  },
});

export const initializeDatabase = async (): Promise<void> => {
  try {
    await AppDataSource.initialize();
    console.log('Database connection initialized successfully');
  } catch (error) {
    console.error('Error during database initialization:', error);
    throw error;
  }
};

export const closeDatabase = async (): Promise<void> => {
  try {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('Database connection closed successfully');
    }
  } catch (error) {
    console.error('Error during database closure:', error);
    throw error;
  }
};
