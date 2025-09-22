import { TestDataSource } from '../../tests/testDatabase';

/**
 * Initialize test database connection
 */
export async function initializeDatabase(): Promise<void> {
  if (!TestDataSource.isInitialized) {
    await TestDataSource.initialize();
  }
}

export const closeDatabase = async (): Promise<void> => {
  try {
    if (TestDataSource.isInitialized) {
      await TestDataSource.destroy();
      console.log('Test database connection closed successfully');
    }
  } catch (error) {
    console.error('Error during test database closure:', error);
    throw error;
  }
};

export { TestDataSource as AppDataSource };
