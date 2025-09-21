import { AppDataSource } from '../ormconfig';

/**
 * Initialize database connection
 */
export async function initializeDatabase(): Promise<void> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
}

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

export { AppDataSource };
