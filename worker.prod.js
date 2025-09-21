const { DataSource } = require('typeorm');
require('dotenv').config();

// Production DataSource configuration
const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'payment_backend',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  synchronize: false,
  logging: process.env.NODE_ENV === 'development',
  entities: ['dist/entities/**/*.js'],
  migrations: ['dist/migrations/**/*.js'],
  subscribers: ['dist/subscribers/**/*.js'],
});

// Initialize and start the worker
async function startWorker() {
  try {
    console.log('Starting production webhook worker...');
    
    // Initialize database
    await AppDataSource.initialize();
    console.log('Database connected successfully');
    
    // Import and start the compiled worker
    const worker = require('./dist/worker.js');
    
  } catch (error) {
    console.error('Failed to start production worker:', error);
    process.exit(1);
  }
}

startWorker();
