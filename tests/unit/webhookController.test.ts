import { Request, Response } from 'express';
import {
  WebhookController,
  WebhookRequest,
} from '../../src/controllers/webhookController';
import {
  WebhookEventType,
  WebhookStatus,
} from '../../src/entities/WebhookEvent';

// Setup mocks
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../src/services/TracingService', () => ({
  tracingService: {
    startWebhookSpan: jest.fn(),
    executeInSpan: jest.fn(),
    addAttributesToActiveSpan: jest.fn(),
    setSpanAttribute: jest.fn(),
    setSpanStatus: jest.fn(),
    endSpan: jest.fn(),
  },
}));

jest.mock('../../src/services/webhookQueue', () => ({
  webhookQueue: {
    add: jest.fn(),
    getWaiting: jest.fn(),
    getActive: jest.fn(),
    getCompleted: jest.fn(),
    getFailed: jest.fn(),
  },
}));

jest.mock('../../src/config/database', () => ({
  AppDataSource: {
    getRepository: jest.fn(),
    getManager: jest.fn(),
  },
}));

jest.mock('crypto', () => ({
  randomUUID: jest.fn().mockReturnValue('test-uuid-123'),
}));

// Mock dependencies - these will be set up in beforeEach
const mockLogger = require('../../src/config/logger').logger;
const mockTracingService =
  require('../../src/services/TracingService').tracingService;
const mockWebhookQueue =
  require('../../src/services/webhookQueue').webhookQueue;

const mockRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  createQueryBuilder: jest.fn(),
};

const mockQueryBuilder = {
  andWhere: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  offset: jest.fn(),
  getManyAndCount: jest.fn(),
};

describe('WebhookController', () => {
  let webhookController: WebhookController;
  let mockReq: Partial<WebhookRequest>;
  let mockRes: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup AppDataSource mock to return mockRepository
    const { AppDataSource } = require('../../src/config/database');
    AppDataSource.getRepository.mockReturnValue(mockRepository);
    AppDataSource.getManager.mockReturnValue(mockRepository);

    webhookController = new WebhookController();

    mockReq = {
      body: Buffer.from('{}'),
      headers: {},
      query: {},
      method: 'POST',
      url: '/webhook',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    // Setup default mock implementations
    mockTracingService.startWebhookSpan.mockReturnValue('mock-span');
    mockTracingService.executeInSpan.mockImplementation(
      async (_span: any, fn: () => Promise<any>) => await fn()
    );
    mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);
    mockQueryBuilder.andWhere.mockReturnThis();
    mockQueryBuilder.orderBy.mockReturnThis();
    mockQueryBuilder.limit.mockReturnThis();
    mockQueryBuilder.offset.mockReturnThis();

    // Setup crypto mock
    const crypto = require('crypto');
    crypto.randomUUID.mockReturnValue('test-uuid-123');
  });

  describe('handleAuthorizeNetWebhook', () => {
    it('should successfully process a valid webhook', async () => {
      const validPayload = {
        eventType: 'net.authorize.payment.authcapture.created',
        id: 'webhook-123',
        payload: {
          transId: 'trans-456',
        },
      };

      mockReq.body = Buffer.from(JSON.stringify(validPayload));
      mockRepository.findOne.mockResolvedValue(null); // No existing event
      mockRepository.save.mockImplementation(entity => {
        entity.id = 1;
        return Promise.resolve(entity);
      });
      mockWebhookQueue.add.mockResolvedValue({});

      await webhookController.handleAuthorizeNetWebhook(
        mockReq as WebhookRequest,
        mockRes as Response
      );

      expect(mockTracingService.startWebhookSpan).toHaveBeenCalledWith(
        'receive',
        undefined,
        {
          'webhook.source': 'authorize_net',
          'http.method': 'POST',
          'http.url': '/webhook',
        }
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { event_id: 'webhook-123' },
      });

      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'webhook-123',
          event_type: WebhookEventType.PAYMENT_COMPLETED,
          status: WebhookStatus.PENDING,
          payload: validPayload,
          source: 'authorize_net',
          related_transaction_id: 'trans-456',
          retry_count: 0,
          max_retries: 3,
        })
      );

      expect(mockWebhookQueue.add).toHaveBeenCalledWith(
        'process-webhook',
        {
          webhookEventId: 1,
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          payload: validPayload,
        },
        expect.objectContaining({
          delay: 0,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        })
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Webhook received and queued for processing',
        eventId: 1,
      });
    });

    it('should handle invalid JSON payload', async () => {
      mockReq.body = Buffer.from('invalid json');

      await webhookController.handleAuthorizeNetWebhook(
        mockReq as WebhookRequest,
        mockRes as Response
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Failed to parse webhook payload as JSON',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid JSON payload',
      });
    });

    it('should handle payload without eventType', async () => {
      const invalidPayload = { id: 'webhook-123' };
      mockReq.body = Buffer.from(JSON.stringify(invalidPayload));

      await webhookController.handleAuthorizeNetWebhook(
        mockReq as WebhookRequest,
        mockRes as Response
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Webhook received without eventType',
        { payload: invalidPayload }
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid webhook payload',
      });
    });

    it('should handle duplicate webhook events', async () => {
      const validPayload = {
        eventType: 'net.authorize.payment.authcapture.created',
        id: 'webhook-123',
      };

      const existingEvent = {
        id: 1,
        event_id: 'webhook-123',
        status: WebhookStatus.PROCESSED,
      };

      mockReq.body = Buffer.from(JSON.stringify(validPayload));
      mockRepository.findOne.mockResolvedValue(existingEvent);

      await webhookController.handleAuthorizeNetWebhook(
        mockReq as WebhookRequest,
        mockRes as Response
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Duplicate webhook event received',
        {
          eventId: 'webhook-123',
          eventType: WebhookEventType.PAYMENT_COMPLETED,
          status: WebhookStatus.PROCESSED,
        }
      );

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Event already processed',
        eventId: 'webhook-123',
        status: WebhookStatus.PROCESSED,
      });

      expect(mockRepository.save).not.toHaveBeenCalled();
      expect(mockWebhookQueue.add).not.toHaveBeenCalled();
    });

    it('should generate UUID when payload has no id', async () => {
      const validPayload = {
        eventType: 'net.authorize.payment.authcapture.created',
      };

      mockReq.body = Buffer.from(JSON.stringify(validPayload));
      mockRepository.findOne.mockResolvedValue(null);
      mockRepository.save.mockImplementation(entity => {
        entity.id = 1;
        return Promise.resolve(entity);
      });
      mockWebhookQueue.add.mockResolvedValue({});

      await webhookController.handleAuthorizeNetWebhook(
        mockReq as WebhookRequest,
        mockRes as Response
      );

      const crypto = require('crypto');
      expect(crypto.randomUUID).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          event_id: 'test-uuid-123',
        })
      );
    });

    it('should map different Authorize.Net event types correctly', async () => {
      const testCases = [
        {
          eventType: 'net.authorize.payment.void.created',
          expected: WebhookEventType.PAYMENT_FAILED,
        },
        {
          eventType: 'net.authorize.payment.refund.created',
          expected: WebhookEventType.REFUND_COMPLETED,
        },
        {
          eventType: 'net.authorize.customer.subscription.created',
          expected: WebhookEventType.SUBSCRIPTION_CREATED,
        },
        {
          eventType: 'net.authorize.customer.subscription.updated',
          expected: WebhookEventType.SUBSCRIPTION_UPDATED,
        },
        {
          eventType: 'net.authorize.customer.subscription.cancelled',
          expected: WebhookEventType.SUBSCRIPTION_CANCELLED,
        },
        {
          eventType: 'unknown.event.type',
          expected: WebhookEventType.PAYMENT_COMPLETED, // Default
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        const payload = {
          eventType: testCase.eventType,
          id: 'webhook-123',
        };

        mockReq.body = Buffer.from(JSON.stringify(payload));
        mockRepository.findOne.mockResolvedValue(null);
        mockRepository.save.mockImplementation(entity => {
          entity.id = 1;
          return Promise.resolve(entity);
        });
        mockWebhookQueue.add.mockResolvedValue({});

        await webhookController.handleAuthorizeNetWebhook(
          mockReq as WebhookRequest,
          mockRes as Response
        );

        expect(mockRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            event_type: testCase.expected,
          })
        );
      }
    });

    it('should extract transaction ID from different payload structures', async () => {
      const testCases = [
        {
          payload: {
            eventType: 'net.authorize.payment.authcapture.created',
            id: 'webhook-123',
            payload: { transId: 'trans-456' },
          },
          expected: 'trans-456',
        },
        {
          payload: {
            eventType: 'net.authorize.payment.authcapture.created',
            id: 'webhook-123',
            payload: { id: 'payment-789' },
          },
          expected: 'payment-789',
        },
        {
          payload: {
            eventType: 'net.authorize.customer.subscription.created',
            id: 'webhook-123',
            payload: { id: 'sub-123' },
          },
          expected: null, // Should not extract for subscription events
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        mockReq.body = Buffer.from(JSON.stringify(testCase.payload));
        mockRepository.findOne.mockResolvedValue(null);
        mockRepository.save.mockImplementation(entity => {
          entity.id = 1;
          return Promise.resolve(entity);
        });
        mockWebhookQueue.add.mockResolvedValue({});

        await webhookController.handleAuthorizeNetWebhook(
          mockReq as WebhookRequest,
          mockRes as Response
        );

        expect(mockRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            related_transaction_id: testCase.expected,
          })
        );
      }
    });

    it('should extract subscription ID from different payload structures', async () => {
      const testCases = [
        {
          payload: {
            eventType: 'net.authorize.customer.subscription.created',
            id: 'webhook-123',
            payload: { subscriptionId: 'sub-456' },
          },
          expected: 'sub-456',
        },
        {
          payload: {
            eventType: 'net.authorize.customer.subscription.updated',
            id: 'webhook-123',
            payload: { id: 'sub-789' },
          },
          expected: 'sub-789',
        },
        {
          payload: {
            eventType: 'net.authorize.payment.authcapture.created',
            id: 'webhook-123',
            payload: { id: 'payment-123' },
          },
          expected: null, // Should not extract for payment events
        },
      ];

      for (const testCase of testCases) {
        jest.clearAllMocks();

        mockReq.body = Buffer.from(JSON.stringify(testCase.payload));
        mockRepository.findOne.mockResolvedValue(null);
        mockRepository.save.mockImplementation(entity => {
          entity.id = 1;
          return Promise.resolve(entity);
        });
        mockWebhookQueue.add.mockResolvedValue({});

        await webhookController.handleAuthorizeNetWebhook(
          mockReq as WebhookRequest,
          mockRes as Response
        );

        expect(mockRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            related_subscription_id: testCase.expected,
          })
        );
      }
    });

    it('should handle database errors', async () => {
      const validPayload = {
        eventType: 'net.authorize.payment.authcapture.created',
        id: 'webhook-123',
      };

      mockReq.body = Buffer.from(JSON.stringify(validPayload));
      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      await webhookController.handleAuthorizeNetWebhook(
        mockReq as WebhookRequest,
        mockRes as Response
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing webhook:',
        expect.any(Error)
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });
  });

  describe('getWebhookEventStatus', () => {
    it('should return webhook event status successfully', async () => {
      const mockEvent = {
        id: 1,
        event_id: 'webhook-123',
        event_type: WebhookEventType.PAYMENT_COMPLETED,
        status: WebhookStatus.PROCESSED,
        retry_count: 0,
        created_at: new Date('2023-01-01'),
        processed_at: new Date('2023-01-01'),
        error_message: null,
      };

      mockReq.params = { eventId: 'webhook-123' };
      mockRepository.findOne.mockResolvedValue(mockEvent);

      await webhookController.getWebhookEventStatus(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { event_id: 'webhook-123' },
      });

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        eventId: 1,
        eventType: WebhookEventType.PAYMENT_COMPLETED,
        status: WebhookStatus.PROCESSED,
        retryCount: 0,
        createdAt: mockEvent.created_at,
        processedAt: mockEvent.processed_at,
        errorMessage: null,
      });
    });

    it('should return 400 when eventId is missing', async () => {
      mockReq.params = {};

      await webhookController.getWebhookEventStatus(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Event ID is required',
      });
    });

    it('should return 404 when webhook event is not found', async () => {
      mockReq.params = { eventId: 'non-existent' };
      mockRepository.findOne.mockResolvedValue(null);

      await webhookController.getWebhookEventStatus(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Webhook event not found',
      });
    });

    it('should handle database errors', async () => {
      mockReq.params = { eventId: 'webhook-123' };
      mockRepository.findOne.mockRejectedValue(new Error('Database error'));

      await webhookController.getWebhookEventStatus(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error retrieving webhook event status:',
        expect.any(Error)
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });
  });

  describe('listWebhookEvents', () => {
    it('should list webhook events with default parameters', async () => {
      const mockEvents = [
        {
          id: 1,
          event_id: 'webhook-123',
          event_type: WebhookEventType.PAYMENT_COMPLETED,
          status: WebhookStatus.PROCESSED,
          retry_count: 0,
          created_at: new Date('2023-01-01'),
          processed_at: new Date('2023-01-01'),
        },
        {
          id: 2,
          event_id: 'webhook-456',
          event_type: WebhookEventType.REFUND_COMPLETED,
          status: WebhookStatus.PENDING,
          retry_count: 1,
          created_at: new Date('2023-01-02'),
          processed_at: null,
        },
      ];

      mockReq.query = {};
      mockQueryBuilder.getManyAndCount.mockResolvedValue([mockEvents, 2]);

      await webhookController.listWebhookEvents(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith(
        'webhook_event.created_at',
        'DESC'
      );
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(50);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(0);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        events: [
          {
            id: 1,
            eventId: 'webhook-123',
            eventType: WebhookEventType.PAYMENT_COMPLETED,
            status: WebhookStatus.PROCESSED,
            retryCount: 0,
            createdAt: mockEvents[0]!.created_at,
            processedAt: mockEvents[0]!.processed_at,
          },
          {
            id: 2,
            eventId: 'webhook-456',
            eventType: WebhookEventType.REFUND_COMPLETED,
            status: WebhookStatus.PENDING,
            retryCount: 1,
            createdAt: mockEvents[1]!.created_at,
            processedAt: mockEvents[1]!.processed_at,
          },
        ],
        total: 2,
        limit: 50,
        offset: 0,
      });
    });

    it('should filter by status and eventType', async () => {
      mockReq.query = {
        status: WebhookStatus.PROCESSED,
        eventType: WebhookEventType.PAYMENT_COMPLETED,
        limit: '10',
        offset: '5',
      };

      mockQueryBuilder.getManyAndCount.mockResolvedValue([[], 0]);

      await webhookController.listWebhookEvents(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'webhook_event.status = :status',
        { status: WebhookStatus.PROCESSED }
      );
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'webhook_event.event_type = :eventType',
        { eventType: WebhookEventType.PAYMENT_COMPLETED }
      );
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(10);
      expect(mockQueryBuilder.offset).toHaveBeenCalledWith(5);
    });

    it('should handle database errors', async () => {
      mockReq.query = {};
      mockQueryBuilder.getManyAndCount.mockRejectedValue(
        new Error('Database error')
      );

      await webhookController.listWebhookEvents(
        mockReq as Request,
        mockRes as Response
      );

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error listing webhook events:',
        expect.any(Error)
      );

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });
  });
});
