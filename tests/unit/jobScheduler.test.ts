import {
  JobScheduler,
  JobSchedulerConfig,
} from '../../src/services/jobScheduler';
import { BillingScheduler } from '../../src/services/billingScheduler';

// Mock dependencies
jest.mock('../../src/services/billingScheduler');
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const mockBillingScheduler = {
  start: jest.fn(),
  stop: jest.fn(),
  triggerBilling: jest.fn(),
  getRetryStatistics: jest.fn(),
};

const { logger: mockLogger } = require('../../src/config/logger');

// Mock BillingScheduler constructor
const MockedBillingScheduler = BillingScheduler as jest.MockedClass<
  typeof BillingScheduler
>;
MockedBillingScheduler.mockImplementation(() => mockBillingScheduler as any);

describe('JobScheduler', () => {
  let jobScheduler: JobScheduler;
  let mockConfig: JobSchedulerConfig;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      enableBillingScheduler: true,
      billingRetryConfig: {
        maxRetries: 3,
        baseDelayMs: 30000,
        maxDelayMs: 300000,
        backoffMultiplier: 1.5,
      },
    };

    mockBillingScheduler.getRetryStatistics.mockReturnValue({
      total_retries: 0,
      active_retries: 0,
      failed_retries: 0,
    });

    jobScheduler = new JobScheduler(mockConfig);
  });

  describe('Constructor', () => {
    it('should initialize with provided config', () => {
      expect(BillingScheduler).toHaveBeenCalledWith(
        mockConfig.billingRetryConfig
      );
      expect(jobScheduler).toBeInstanceOf(JobScheduler);
    });

    it('should initialize with minimal config', () => {
      const minimalConfig: JobSchedulerConfig = {
        enableBillingScheduler: false,
      };

      const scheduler = new JobScheduler(minimalConfig);
      expect(BillingScheduler).toHaveBeenCalledWith(undefined);
      expect(scheduler).toBeInstanceOf(JobScheduler);
    });
  });

  describe('initialize', () => {
    it('should initialize successfully with billing scheduler enabled', async () => {
      await jobScheduler.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing job scheduler',
        {
          config: mockConfig,
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting billing scheduler'
      );
      expect(mockBillingScheduler.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job scheduler initialized successfully'
      );
    });

    it('should initialize successfully with billing scheduler disabled', async () => {
      const disabledConfig: JobSchedulerConfig = {
        enableBillingScheduler: false,
      };
      const scheduler = new JobScheduler(disabledConfig);

      await scheduler.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Billing scheduler is disabled'
      );
      expect(mockBillingScheduler.start).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job scheduler initialized successfully'
      );
    });

    it('should warn if already initialized', async () => {
      await jobScheduler.initialize();
      jest.clearAllMocks();

      await jobScheduler.initialize();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Job scheduler is already initialized'
      );
      expect(mockBillingScheduler.start).not.toHaveBeenCalled();
    });

    it('should handle initialization errors', async () => {
      const error = new Error('Billing scheduler failed to start');
      mockBillingScheduler.start.mockImplementation(() => {
        throw error;
      });

      await expect(jobScheduler.initialize()).rejects.toThrow(
        'Billing scheduler failed to start'
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize job scheduler',
        {
          error: 'Billing scheduler failed to start',
          stack: error.stack,
        }
      );
    });

    it('should handle non-Error exceptions', async () => {
      mockBillingScheduler.start.mockImplementationOnce(() => {
        throw 'String error';
      });

      await expect(jobScheduler.initialize()).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to initialize job scheduler',
        {
          error: 'Unknown error',
          stack: undefined,
        }
      );
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      // Reset mocks before each test to avoid interference
      mockBillingScheduler.start.mockReset();
      mockBillingScheduler.stop.mockReset();
      await jobScheduler.initialize();
      jest.clearAllMocks();
    });

    it('should shutdown successfully', async () => {
      await jobScheduler.shutdown();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Shutting down job scheduler'
      );
      expect(mockBillingScheduler.stop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Job scheduler shutdown completed'
      );
    });

    it('should warn if not initialized', async () => {
      const uninitializedScheduler = new JobScheduler(mockConfig);

      await uninitializedScheduler.shutdown();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Job scheduler is not initialized'
      );
      expect(mockBillingScheduler.stop).not.toHaveBeenCalled();
    });

    it('should handle shutdown errors', async () => {
      const error = new Error('Shutdown failed');
      mockBillingScheduler.stop.mockImplementation(() => {
        throw error;
      });

      await expect(jobScheduler.shutdown()).rejects.toThrow('Shutdown failed');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during job scheduler shutdown',
        {
          error: 'Shutdown failed',
        }
      );
    });

    it('should handle non-Error exceptions during shutdown', async () => {
      mockBillingScheduler.stop.mockImplementationOnce(() => {
        throw 'String error';
      });

      await expect(jobScheduler.shutdown()).rejects.toBe('String error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error during job scheduler shutdown',
        {
          error: 'Unknown error',
        }
      );
    });
  });

  describe('getBillingScheduler', () => {
    it('should return billing scheduler instance', () => {
      const billingScheduler = jobScheduler.getBillingScheduler();
      expect(billingScheduler).toBe(mockBillingScheduler);
    });
  });

  describe('getStatus', () => {
    it('should return status when not initialized', () => {
      const status = jobScheduler.getStatus();

      expect(status).toEqual({
        initialized: false,
        billing_scheduler_enabled: true,
        retry_statistics: {
          total_retries: 0,
          active_retries: 0,
          failed_retries: 0,
        },
      });
    });

    it('should return status when initialized', async () => {
      await jobScheduler.initialize();

      const status = jobScheduler.getStatus();

      expect(status).toEqual({
        initialized: true,
        billing_scheduler_enabled: true,
        retry_statistics: {
          total_retries: 0,
          active_retries: 0,
          failed_retries: 0,
        },
      });
    });

    it('should return status with billing scheduler disabled', () => {
      const disabledConfig: JobSchedulerConfig = {
        enableBillingScheduler: false,
      };
      const scheduler = new JobScheduler(disabledConfig);

      const status = scheduler.getStatus();

      expect(status.billing_scheduler_enabled).toBe(false);
    });
  });

  describe('triggerBilling', () => {
    beforeEach(async () => {
      // Reset mocks before each test
      mockBillingScheduler.start.mockReset();
      await jobScheduler.initialize();
    });

    it('should trigger billing successfully', async () => {
      mockBillingScheduler.triggerBilling.mockResolvedValue(true);

      const result = await jobScheduler.triggerBilling('subscription-123');

      expect(mockBillingScheduler.triggerBilling).toHaveBeenCalledWith(
        'subscription-123'
      );
      expect(result).toBe(true);
    });

    it('should return false when billing fails', async () => {
      mockBillingScheduler.triggerBilling.mockResolvedValue(false);

      const result = await jobScheduler.triggerBilling('subscription-123');

      expect(result).toBe(false);
    });

    it('should throw error if not initialized', async () => {
      const uninitializedScheduler = new JobScheduler(mockConfig);

      await expect(
        uninitializedScheduler.triggerBilling('subscription-123')
      ).rejects.toThrow('Job scheduler is not initialized');

      expect(mockBillingScheduler.triggerBilling).not.toHaveBeenCalled();
    });
  });
});
