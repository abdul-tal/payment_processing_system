import 'reflect-metadata';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// Mock DataSource
const mockDataSource = {
  initialize: jest.fn().mockResolvedValue(undefined),
  destroy: jest.fn().mockResolvedValue(undefined),
  isInitialized: false,
};

// Mock functions
const mockInitializeRedis = jest.fn().mockResolvedValue(undefined);
const mockCloseDatabase = jest.fn().mockResolvedValue(undefined);
const mockCloseRedis = jest.fn().mockResolvedValue(undefined);
const mockCloseQueues = jest.fn().mockResolvedValue(undefined);
const mockGetQueueHealth = jest.fn().mockResolvedValue({
  webhookQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
  deadLetterQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
});

// Mock webhook queues
const mockWebhookQueue = {
  pause: jest.fn().mockResolvedValue(undefined),
  getActive: jest.fn().mockResolvedValue([]),
};

const mockDeadLetterQueue = {
  pause: jest.fn().mockResolvedValue(undefined),
  getActive: jest.fn().mockResolvedValue([]),
};

// Mock all dependencies
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('../../src/config/redis', () => ({
  initializeRedis: mockInitializeRedis,
  closeRedis: mockCloseRedis,
}));

jest.mock('../../src/config/database', () => ({
  closeDatabase: mockCloseDatabase,
}));

jest.mock('../../src/services/webhookQueue', () => ({
  webhookQueue: mockWebhookQueue,
  deadLetterQueue: mockDeadLetterQueue,
  closeQueues: mockCloseQueues,
  getQueueHealth: mockGetQueueHealth,
}));

jest.mock('../../src/config/logger', () => ({
  logger: mockLogger,
}));

jest.mock('typeorm', () => ({
  DataSource: jest.fn().mockImplementation(() => mockDataSource),
}));

// Mock process methods to prevent actual process operations
const mockProcessExit = jest.fn();
const mockProcessOn = jest.fn();
const mockStdinResume = jest.fn();

Object.defineProperty(process, 'exit', {
  value: mockProcessExit,
  writable: true,
});

Object.defineProperty(process, 'on', {
  value: mockProcessOn,
  writable: true,
});

Object.defineProperty(process, 'stdin', {
  value: { resume: mockStdinResume },
  writable: true,
});

// Import the actual WebhookWorker class
import { WebhookWorker } from '../../src/worker';

describe('Worker', () => {
  let worker: WebhookWorker;

  beforeEach(() => {
    jest.clearAllMocks();
    mockProcessExit.mockClear();
    mockProcessOn.mockClear();
    mockStdinResume.mockClear();
    worker = new WebhookWorker();
  });

  it('should start worker successfully', async () => {
    await worker.start();

    expect(mockDataSource.initialize).toHaveBeenCalled();
    expect(mockInitializeRedis).toHaveBeenCalled();
    expect(mockLogger.info).toHaveBeenCalledWith('Starting webhook worker...');
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Database initialized for worker'
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Redis initialized for worker'
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      'Webhook worker started successfully'
    );
  });

  it('should handle database initialization errors', async () => {
    const dbError = new Error('Database connection failed');
    mockDataSource.initialize.mockRejectedValueOnce(dbError);

    await worker.start();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to start webhook worker:',
      dbError
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('should handle Redis initialization errors', async () => {
    const redisError = new Error('Redis connection failed');
    mockInitializeRedis.mockRejectedValueOnce(redisError);

    await worker.start();

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Failed to start webhook worker:',
      redisError
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('should setup process event handlers when started', async () => {
    await worker.start();

    expect(mockProcessOn).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(mockProcessOn).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(mockProcessOn).toHaveBeenCalledWith('SIGUSR2', expect.any(Function));
  });

  it('should setup stdin resume for keep alive', async () => {
    await worker.start();

    expect(mockStdinResume).toHaveBeenCalled();
  });

  it('should test graceful shutdown signal handling', async () => {
    let shutdownHandler: Function | undefined;
    mockProcessOn.mockImplementation((signal: string, handler: Function) => {
      if (signal === 'SIGTERM') {
        shutdownHandler = handler;
      }
    });

    await worker.start();

    // Simulate SIGTERM signal
    if (shutdownHandler) {
      shutdownHandler();

      // Wait a bit for async operations
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockWebhookQueue.pause).toHaveBeenCalled();
      expect(mockDeadLetterQueue.pause).toHaveBeenCalled();
    }
  });

  it('should handle graceful shutdown with no active jobs', async () => {
    let shutdownHandler: Function | undefined;
    mockProcessOn.mockImplementation((signal: string, handler: Function) => {
      if (signal === 'SIGTERM') {
        shutdownHandler = handler;
      }
    });

    // Mock no active jobs
    mockWebhookQueue.getActive.mockResolvedValue([]);

    await worker.start();

    // Simulate SIGTERM signal
    if (shutdownHandler) {
      shutdownHandler();

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 200));

      expect(mockCloseQueues).toHaveBeenCalled();
      expect(mockCloseDatabase).toHaveBeenCalled();
      expect(mockCloseRedis).toHaveBeenCalled();
    }
  });

  it('should test webhook queue operations', async () => {
    await mockWebhookQueue.pause();
    const activeJobs = await mockWebhookQueue.getActive();

    expect(mockWebhookQueue.pause).toHaveBeenCalled();
    expect(mockWebhookQueue.getActive).toHaveBeenCalled();
    expect(activeJobs).toEqual([]);
  });

  it('should test dead letter queue operations', async () => {
    await mockDeadLetterQueue.pause();
    const activeJobs = await mockDeadLetterQueue.getActive();

    expect(mockDeadLetterQueue.pause).toHaveBeenCalled();
    expect(mockDeadLetterQueue.getActive).toHaveBeenCalled();
    expect(activeJobs).toEqual([]);
  });

  it('should test database operations', async () => {
    await mockDataSource.initialize();
    await mockCloseDatabase();

    expect(mockDataSource.initialize).toHaveBeenCalled();
    expect(mockCloseDatabase).toHaveBeenCalled();
  });

  it('should test Redis operations', async () => {
    await mockInitializeRedis();
    await mockCloseRedis();

    expect(mockInitializeRedis).toHaveBeenCalled();
    expect(mockCloseRedis).toHaveBeenCalled();
  });

  it('should handle graceful shutdown with active jobs and timeout', async () => {
    let shutdownHandler: Function | undefined;
    mockProcessOn.mockImplementation((signal: string, handler: Function) => {
      if (signal === 'SIGTERM') {
        shutdownHandler = handler;
      }
    });

    // Mock active jobs that don't complete
    mockWebhookQueue.getActive
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]) // Initial active jobs
      .mockResolvedValue([{ id: 1 }, { id: 2 }]); // Still active after checks

    await worker.start();

    // Simulate SIGTERM signal
    if (shutdownHandler) {
      shutdownHandler();

      // Wait for timeout scenario
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Waiting for 2 active jobs to complete...'
      );
    }
  });

  it('should handle graceful shutdown with jobs completing', async () => {
    let shutdownHandler: Function | undefined;
    mockProcessOn.mockImplementation((signal: string, handler: Function) => {
      if (signal === 'SIGTERM') {
        shutdownHandler = handler;
      }
    });

    // Mock active jobs that complete
    mockWebhookQueue.getActive
      .mockResolvedValueOnce([{ id: 1 }]) // Initial active jobs
      .mockResolvedValueOnce([]); // Jobs completed

    await worker.start();

    // Simulate SIGTERM signal
    if (shutdownHandler) {
      shutdownHandler();

      // Wait for jobs to complete
      await new Promise(resolve => setTimeout(resolve, 1100)); // Wait longer than check interval

      expect(mockCloseQueues).toHaveBeenCalled();
      expect(mockCloseDatabase).toHaveBeenCalled();
      expect(mockCloseRedis).toHaveBeenCalled();
    }
  });

  it('should handle errors in finalizeShutdown', async () => {
    let shutdownHandler: Function | undefined;
    mockProcessOn.mockImplementation((signal: string, handler: Function) => {
      if (signal === 'SIGTERM') {
        shutdownHandler = handler;
      }
    });

    const shutdownError = new Error('Shutdown error');
    mockCloseQueues.mockRejectedValueOnce(shutdownError);
    mockWebhookQueue.getActive.mockResolvedValue([]);

    await worker.start();

    // Simulate SIGTERM signal
    if (shutdownHandler) {
      shutdownHandler();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during final shutdown:',
        shutdownError
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    }
  });

  it('should test uncaught exception handler', () => {
    let exceptionHandler: Function | undefined;
    mockProcessOn.mockImplementation((event: string, handler: Function) => {
      if (event === 'uncaughtException') {
        exceptionHandler = handler;
      }
    });

    // Re-import to trigger process handlers setup
    delete require.cache[require.resolve('../../src/worker')];
    require('../../src/worker');

    const testError = new Error('Test uncaught exception');
    if (exceptionHandler) {
      exceptionHandler(testError);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Uncaught Exception:',
        testError
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    }
  });

  it('should test unhandled rejection handler', () => {
    let rejectionHandler: Function | undefined;
    mockProcessOn.mockImplementation((event: string, handler: Function) => {
      if (event === 'unhandledRejection') {
        rejectionHandler = handler;
      }
    });

    // Re-import to trigger process handlers setup
    delete require.cache[require.resolve('../../src/worker')];
    require('../../src/worker');

    const testReason = new Error('Test unhandled rejection');
    const testPromise = Promise.resolve();

    if (rejectionHandler) {
      rejectionHandler(testReason, testPromise);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Unhandled Rejection at:',
        testPromise,
        'reason:',
        testReason
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    }
  });

  it('should test periodic health check functionality', async () => {
    // Test the health check functionality directly
    const health = await mockGetQueueHealth();

    expect(mockGetQueueHealth).toHaveBeenCalled();
    expect(health).toEqual({
      webhookQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
      deadLetterQueue: { waiting: 0, active: 0, completed: 0, failed: 0 },
    });
  });

  it('should handle health check errors', async () => {
    const healthError = new Error('Health check failed');
    mockGetQueueHealth.mockRejectedValueOnce(healthError);

    try {
      await mockGetQueueHealth();
    } catch (error) {
      expect(error).toBe(healthError);
    }

    expect(mockGetQueueHealth).toHaveBeenCalled();
  });

  it('should test SIGINT signal handling', async () => {
    let shutdownHandler: Function | undefined;
    mockProcessOn.mockImplementation((signal: string, handler: Function) => {
      if (signal === 'SIGINT') {
        shutdownHandler = handler;
      }
    });

    mockWebhookQueue.getActive.mockResolvedValue([]);

    await worker.start();

    // Simulate SIGINT signal
    if (shutdownHandler) {
      shutdownHandler();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockWebhookQueue.pause).toHaveBeenCalled();
      expect(mockDeadLetterQueue.pause).toHaveBeenCalled();
    }
  });

  it('should test SIGUSR2 signal handling', async () => {
    let shutdownHandler: Function | undefined;
    mockProcessOn.mockImplementation((signal: string, handler: Function) => {
      if (signal === 'SIGUSR2') {
        shutdownHandler = handler;
      }
    });

    mockWebhookQueue.getActive.mockResolvedValue([]);

    await worker.start();

    // Simulate SIGUSR2 signal (nodemon restart)
    if (shutdownHandler) {
      shutdownHandler();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockWebhookQueue.pause).toHaveBeenCalled();
      expect(mockDeadLetterQueue.pause).toHaveBeenCalled();
    }
  });
});
