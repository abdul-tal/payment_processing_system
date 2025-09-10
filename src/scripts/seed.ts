import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from '../config/database';
import { seedDatabase, clearDatabase } from '../seeds';

async function runSeeding(): Promise<void> {
  try {
    console.log('Initializing database connection...');
    await initializeDatabase();

    const args = process.argv.slice(2);
    const shouldClear = args.includes('--clear');

    if (shouldClear) {
      await clearDatabase();
    }

    await seedDatabase();

    console.log('Seeding completed successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

runSeeding();
