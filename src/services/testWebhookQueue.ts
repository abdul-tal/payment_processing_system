// Test-specific webhook queue configuration that doesn't create Redis connections
export const mockWebhookQueue = {
  add: jest.fn(),
  process: jest.fn(),
  close: jest.fn(),
  clean: jest.fn(),
  getJobs: jest.fn().mockResolvedValue([]),
  getJob: jest.fn(),
  removeJobs: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  isPaused: jest.fn().mockResolvedValue(false),
  getJobCounts: jest.fn().mockResolvedValue({}),
  empty: jest.fn(),
  obliterate: jest.fn(),
};

export const mockDeadLetterQueue = {
  add: jest.fn(),
  process: jest.fn(),
  close: jest.fn(),
  clean: jest.fn(),
  getJobs: jest.fn().mockResolvedValue([]),
  getJob: jest.fn(),
  removeJobs: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  isPaused: jest.fn().mockResolvedValue(false),
  getJobCounts: jest.fn().mockResolvedValue({}),
  empty: jest.fn(),
  obliterate: jest.fn(),
};

// Export the mocks as the queue objects
export const webhookQueue = mockWebhookQueue;
export const deadLetterQueue = mockDeadLetterQueue;
