import { BillingScheduler } from './billingScheduler';
import { logger } from '../config/logger';

export interface JobSchedulerConfig {
  enableBillingScheduler: boolean;
  billingRetryConfig?: {
    maxRetries: number;
    baseDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
}

export class JobScheduler {
  private billingScheduler: BillingScheduler;
  private config: JobSchedulerConfig;
  private isInitialized: boolean = false;

  constructor(config: JobSchedulerConfig) {
    this.config = config;
    this.billingScheduler = new BillingScheduler(config.billingRetryConfig);
  }

  /**
   * Initialize and start all background jobs
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Job scheduler is already initialized');
      return;
    }

    logger.info('Initializing job scheduler', {
      config: this.config,
    });

    try {
      // Start billing scheduler if enabled
      if (this.config.enableBillingScheduler) {
        logger.info('Starting billing scheduler');
        this.billingScheduler.start();
      } else {
        logger.info('Billing scheduler is disabled');
      }

      this.isInitialized = true;
      logger.info('Job scheduler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize job scheduler', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Shutdown all background jobs
   */
  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      logger.warn('Job scheduler is not initialized');
      return;
    }

    logger.info('Shutting down job scheduler');

    try {
      // Stop billing scheduler
      this.billingScheduler.stop();

      this.isInitialized = false;
      logger.info('Job scheduler shutdown completed');
    } catch (error) {
      logger.error('Error during job scheduler shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get billing scheduler instance
   */
  getBillingScheduler(): BillingScheduler {
    return this.billingScheduler;
  }

  /**
   * Get scheduler status
   */
  getStatus(): {
    initialized: boolean;
    billing_scheduler_enabled: boolean;
    retry_statistics: any;
  } {
    return {
      initialized: this.isInitialized,
      billing_scheduler_enabled: this.config.enableBillingScheduler,
      retry_statistics: this.billingScheduler.getRetryStatistics(),
    };
  }

  /**
   * Manually trigger billing for a subscription
   */
  async triggerBilling(subscriptionId: string): Promise<boolean> {
    if (!this.isInitialized) {
      throw new Error('Job scheduler is not initialized');
    }

    return await this.billingScheduler.triggerBilling(subscriptionId);
  }
}

// Singleton instance
let jobSchedulerInstance: JobScheduler | null = null;

/**
 * Get or create job scheduler instance
 */
export function getJobScheduler(config?: JobSchedulerConfig): JobScheduler {
  if (!jobSchedulerInstance) {
    if (!config) {
      throw new Error(
        'Job scheduler config is required for first initialization'
      );
    }
    jobSchedulerInstance = new JobScheduler(config);
  }
  return jobSchedulerInstance;
}

/**
 * Initialize job scheduler with default config
 */
export async function initializeJobScheduler(
  config?: Partial<JobSchedulerConfig>
): Promise<JobScheduler> {
  const defaultConfig: JobSchedulerConfig = {
    enableBillingScheduler: true,
    billingRetryConfig: {
      maxRetries: 5,
      baseDelayMs: 60000, // 1 minute
      maxDelayMs: 86400000, // 24 hours
      backoffMultiplier: 2,
    },
    ...config,
  };

  const scheduler = getJobScheduler(defaultConfig);
  await scheduler.initialize();
  return scheduler;
}
