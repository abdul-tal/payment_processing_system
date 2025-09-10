import 'reflect-metadata';
import {
  initializeDatabase,
  closeDatabase,
  AppDataSource,
} from '../config/database';
import { Transaction, Subscription, WebhookEvent, AuditLog } from '../entities';

async function testDatabaseConnection(): Promise<void> {
  try {
    console.log('Testing database connection...');

    // Initialize database connection
    await initializeDatabase();
    console.log('✅ Database connection established');

    // Test entity repositories
    const transactionRepo = AppDataSource.getRepository(Transaction);
    const subscriptionRepo = AppDataSource.getRepository(Subscription);
    const webhookRepo = AppDataSource.getRepository(WebhookEvent);
    const auditRepo = AppDataSource.getRepository(AuditLog);

    console.log('✅ Entity repositories initialized');

    // Test basic queries
    const transactionCount = await transactionRepo.count();
    const subscriptionCount = await subscriptionRepo.count();
    const webhookCount = await webhookRepo.count();
    const auditCount = await auditRepo.count();

    console.log('📊 Database Statistics:');
    console.log(`  - Transactions: ${transactionCount}`);
    console.log(`  - Subscriptions: ${subscriptionCount}`);
    console.log(`  - Webhook Events: ${webhookCount}`);
    console.log(`  - Audit Logs: ${auditCount}`);

    // Test database schema
    const queryRunner = AppDataSource.createQueryRunner();

    // Check if tables exist
    const tables = await queryRunner.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('📋 Database Tables:');
    tables.forEach((table: { table_name: string }) => {
      console.log(`  - ${table.table_name}`);
    });

    // Check indexes
    const indexes = await queryRunner.query(`
      SELECT indexname, tablename 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      AND indexname LIKE 'IDX_%'
      ORDER BY tablename, indexname
    `);

    console.log('🔍 Database Indexes:');
    indexes.forEach((index: { indexname: string; tablename: string }) => {
      console.log(`  - ${index.tablename}.${index.indexname}`);
    });

    await queryRunner.release();

    console.log('✅ Database test completed successfully!');
  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
    console.log('🔒 Database connection closed');
  }
}

testDatabaseConnection();
