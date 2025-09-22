// Global test setup to mock problematic services before any tests run

// Mock webhook queue services to prevent Redis connections
jest.mock('../src/services/webhookQueue', () => ({
  webhookQueue: {
    add: jest.fn().mockResolvedValue({}),
    process: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  },
  deadLetterQueue: {
    add: jest.fn().mockResolvedValue({}),
    process: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  },
}));

// Mock Bull Queue constructor to prevent Redis connections
jest.mock('bull', () => {
  return jest.fn().mockImplementation(() => ({
    add: jest.fn().mockResolvedValue({}),
    process: jest.fn(),
    close: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    removeAllListeners: jest.fn(),
  }));
});

// Mock API key manager to prevent intervals and cleanup properly
const mockApiKeyManager = {
  validateApiKey: jest.fn(() => ({ isValid: true, keyId: 'test-key' })),
  cleanup: jest.fn(),
  loadApiKeys: jest.fn(),
  cleanupRateLimitTracker: jest.fn(),
};

jest.mock('../src/middleware/apiKeyAuth', () => ({
  ApiKeyManager: {
    getInstance: jest.fn(() => mockApiKeyManager),
  },
  authenticateApiKey: jest.fn(() => (req: any, _res: any, next: any) => {
    req.apiKey = { keyId: 'test-key', permissions: ['read', 'write'] };
    next();
  }),
}));

// Mock Authorize.Net services to prevent external API calls
jest.mock('../src/config/authorizeNet', () => ({
  authorizeNetConfig: {
    getConfig: jest.fn(() => ({
      apiLoginId: 'test-login',
      transactionKey: 'test-key',
      environment: 'sandbox',
      endpoint: 'https://apitest.authorize.net/xml/v1/request.api',
    })),
    isProduction: jest.fn(() => false),
    isSandbox: jest.fn(() => true),
  },
  AuthorizeNetConfig: jest.fn(),
}));

// Mock ioredis to prevent Redis connections
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    off: jest.fn(),
  }));
});

// Mock PaymentService to prevent AuthorizeNet instantiation
jest.mock('../src/services/paymentService', () => ({
  PaymentService: jest.fn().mockImplementation(() => ({
    validatePaymentMethod: jest.fn().mockReturnValue([]),
    processPurchase: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    authorizeTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    captureTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    refundTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    cancelTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    createSubscription: jest
      .fn()
      .mockResolvedValue({ success: true, subscriptionId: 'sub_test_123' }),
  })),
  paymentService: {
    validatePaymentMethod: jest.fn().mockReturnValue([]),
    processPurchase: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    authorizeTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    captureTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    refundTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    cancelTransaction: jest
      .fn()
      .mockResolvedValue({ success: true, transactionId: 'test-123' }),
    createSubscription: jest
      .fn()
      .mockResolvedValue({ success: true, subscriptionId: 'sub_test_123' }),
  },
}));

export {};
