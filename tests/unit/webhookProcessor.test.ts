import { WebhookProcessor } from '../../src/services/webhookProcessor';
import {
  WebhookEvent,
  WebhookEventType,
} from '../../src/entities/WebhookEvent';
import { Transaction, TransactionStatus } from '../../src/entities/Transaction';
import {
  Subscription,
  SubscriptionStatus,
} from '../../src/entities/Subscription';
import { AppDataSource } from '../../src/config/database';

// Mock dependencies
jest.mock('../../src/config/database');
jest.mock('../../src/config/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const { logger: mockLogger } = require('../../src/config/logger');

// Mock repository methods
const mockWebhookEventRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockTransactionRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockSubscriptionRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

// Mock AppDataSource.getRepository
const mockGetRepository = jest.fn();
(AppDataSource.getRepository as jest.Mock) = mockGetRepository;

describe('WebhookProcessor', () => {
  let webhookProcessor: WebhookProcessor;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup repository mocks
    mockGetRepository.mockImplementation(entity => {
      if (entity === WebhookEvent) return mockWebhookEventRepository;
      if (entity === Transaction) return mockTransactionRepository;
      if (entity === Subscription) return mockSubscriptionRepository;
      return {};
    });

    webhookProcessor = new WebhookProcessor();
  });

  describe('processWebhookEvent', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.PAYMENT_COMPLETED,
      payload: {},
    };

    it('should process PAYMENT_COMPLETED event successfully', async () => {
      mockWebhookEventRepository.findOne.mockResolvedValue(mockWebhookEvent);
      const processPaymentCompletedSpy = jest
        .spyOn(webhookProcessor as any, 'processPaymentCompleted')
        .mockResolvedValue(undefined);

      const payload = { payload: { transId: '12345' } };
      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'payment.completed',
        payload
      );

      expect(mockLogger.info).toHaveBeenCalledWith('Processing webhook event', {
        webhookEventId: 'webhook-123',
        eventType: 'payment.completed',
      });
      expect(processPaymentCompletedSpy).toHaveBeenCalledWith(
        mockWebhookEvent,
        payload
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Webhook event processed successfully',
        {
          webhookEventId: 'webhook-123',
          eventType: 'payment.completed',
        }
      );
    });

    it('should process PAYMENT_FAILED event successfully', async () => {
      const failedWebhookEvent = {
        ...mockWebhookEvent,
        event_type: WebhookEventType.PAYMENT_FAILED,
      };
      mockWebhookEventRepository.findOne.mockResolvedValue(failedWebhookEvent);
      const processPaymentFailedSpy = jest
        .spyOn(webhookProcessor as any, 'processPaymentFailed')
        .mockResolvedValue(undefined);

      const payload = { payload: { transId: '12345' } };
      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'payment.failed',
        payload
      );

      expect(processPaymentFailedSpy).toHaveBeenCalledWith(
        failedWebhookEvent,
        payload
      );
    });

    it('should process REFUND_COMPLETED event successfully', async () => {
      const refundWebhookEvent = {
        ...mockWebhookEvent,
        event_type: WebhookEventType.REFUND_COMPLETED,
      };
      mockWebhookEventRepository.findOne.mockResolvedValue(refundWebhookEvent);
      const processRefundCompletedSpy = jest
        .spyOn(webhookProcessor as any, 'processRefundCompleted')
        .mockResolvedValue(undefined);

      const payload = { payload: { transId: '12345' } };
      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'refund.completed',
        payload
      );

      expect(processRefundCompletedSpy).toHaveBeenCalledWith(
        refundWebhookEvent,
        payload
      );
    });

    it('should process SUBSCRIPTION_CREATED event successfully', async () => {
      const subscriptionWebhookEvent = {
        ...mockWebhookEvent,
        event_type: WebhookEventType.SUBSCRIPTION_CREATED,
      };
      mockWebhookEventRepository.findOne.mockResolvedValue(
        subscriptionWebhookEvent
      );
      const processSubscriptionCreatedSpy = jest
        .spyOn(webhookProcessor as any, 'processSubscriptionCreated')
        .mockResolvedValue(undefined);

      const payload = { payload: { subscriptionId: 'sub-123' } };
      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'subscription.created',
        payload
      );

      expect(processSubscriptionCreatedSpy).toHaveBeenCalledWith(
        subscriptionWebhookEvent,
        payload
      );
    });

    it('should process SUBSCRIPTION_UPDATED event successfully', async () => {
      const subscriptionWebhookEvent = {
        ...mockWebhookEvent,
        event_type: WebhookEventType.SUBSCRIPTION_UPDATED,
      };
      mockWebhookEventRepository.findOne.mockResolvedValue(
        subscriptionWebhookEvent
      );
      const processSubscriptionUpdatedSpy = jest
        .spyOn(webhookProcessor as any, 'processSubscriptionUpdated')
        .mockResolvedValue(undefined);

      const payload = { payload: { subscriptionId: 'sub-123' } };
      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'subscription.updated',
        payload
      );

      expect(processSubscriptionUpdatedSpy).toHaveBeenCalledWith(
        subscriptionWebhookEvent,
        payload
      );
    });

    it('should process SUBSCRIPTION_CANCELLED event successfully', async () => {
      const subscriptionWebhookEvent = {
        ...mockWebhookEvent,
        event_type: WebhookEventType.SUBSCRIPTION_CANCELLED,
      };
      mockWebhookEventRepository.findOne.mockResolvedValue(
        subscriptionWebhookEvent
      );
      const processSubscriptionCancelledSpy = jest
        .spyOn(webhookProcessor as any, 'processSubscriptionCancelled')
        .mockResolvedValue(undefined);

      const payload = { payload: { subscriptionId: 'sub-123' } };
      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'subscription.cancelled',
        payload
      );

      expect(processSubscriptionCancelledSpy).toHaveBeenCalledWith(
        subscriptionWebhookEvent,
        payload
      );
    });

    it('should process CHARGEBACK_CREATED event successfully', async () => {
      const chargebackWebhookEvent = {
        ...mockWebhookEvent,
        event_type: WebhookEventType.CHARGEBACK_CREATED,
      };
      mockWebhookEventRepository.findOne.mockResolvedValue(
        chargebackWebhookEvent
      );
      const processChargebackCreatedSpy = jest
        .spyOn(webhookProcessor as any, 'processChargebackCreated')
        .mockResolvedValue(undefined);

      const payload = { payload: { transId: '12345' } };
      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'chargeback.created',
        payload
      );

      expect(processChargebackCreatedSpy).toHaveBeenCalledWith(
        chargebackWebhookEvent,
        payload
      );
    });

    it('should handle unknown event type', async () => {
      const unknownWebhookEvent = {
        ...mockWebhookEvent,
        event_type: 'UNKNOWN_TYPE' as WebhookEventType,
      };
      mockWebhookEventRepository.findOne.mockResolvedValue(unknownWebhookEvent);

      await webhookProcessor.processWebhookEvent(
        'webhook-123',
        'unknown.event',
        {}
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Unknown webhook event type',
        {
          eventType: 'UNKNOWN_TYPE',
          webhookEventId: 'webhook-123',
        }
      );
    });

    it('should throw error when webhook event not found', async () => {
      mockWebhookEventRepository.findOne.mockResolvedValue(null);

      await expect(
        webhookProcessor.processWebhookEvent(
          'webhook-123',
          'payment.completed',
          {}
        )
      ).rejects.toThrow('Webhook event not found: webhook-123');
    });
  });

  describe('processPaymentCompleted', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.PAYMENT_COMPLETED,
    };

    const mockTransaction: Partial<Transaction> = {
      id: 'trans-123',
      authorize_net_transaction_id: '12345',
      status: TransactionStatus.PENDING,
    };

    it('should update transaction status to completed when transaction found', async () => {
      const payload = { payload: { transId: '12345' } };
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      mockTransactionRepository.update.mockResolvedValue({ affected: 1 });

      await (webhookProcessor as any).processPaymentCompleted(
        mockWebhookEvent,
        payload
      );

      expect(mockTransactionRepository.findOne).toHaveBeenCalledWith({
        where: { authorize_net_transaction_id: '12345' },
      });
      expect(mockTransactionRepository.update).toHaveBeenCalledWith(
        'trans-123',
        {
          status: TransactionStatus.COMPLETED,
          updated_at: expect.any(Date),
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction updated to completed',
        {
          transactionId: 'trans-123',
          authorizeNetTransactionId: '12345',
        }
      );
    });

    it('should warn when transaction not found', async () => {
      const payload = { payload: { transId: '12345' } };
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await (webhookProcessor as any).processPaymentCompleted(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Transaction not found for completed payment webhook',
        {
          authorizeNetTransactionId: '12345',
          webhookEventId: 'webhook-123',
        }
      );
      expect(mockTransactionRepository.update).not.toHaveBeenCalled();
    });

    it('should warn when no transaction ID in payload', async () => {
      const payload = { payload: {} };

      await (webhookProcessor as any).processPaymentCompleted(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No transaction ID found in payment completed webhook',
        {
          webhookEventId: 'webhook-123',
        }
      );
      expect(mockTransactionRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('processPaymentFailed', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.PAYMENT_FAILED,
    };

    const mockTransaction: Partial<Transaction> = {
      id: 'trans-123',
      authorize_net_transaction_id: '12345',
      status: TransactionStatus.PENDING,
    };

    it('should update transaction status to failed when transaction found', async () => {
      const payload = { payload: { transId: '12345' } };
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);
      mockTransactionRepository.update.mockResolvedValue({ affected: 1 });

      await (webhookProcessor as any).processPaymentFailed(
        mockWebhookEvent,
        payload
      );

      expect(mockTransactionRepository.update).toHaveBeenCalledWith(
        'trans-123',
        {
          status: TransactionStatus.FAILED,
          updated_at: expect.any(Date),
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Transaction updated to failed',
        {
          transactionId: 'trans-123',
          authorizeNetTransactionId: '12345',
        }
      );
    });

    it('should warn when transaction not found', async () => {
      const payload = { payload: { transId: '12345' } };
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await (webhookProcessor as any).processPaymentFailed(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Transaction not found for failed payment webhook',
        {
          authorizeNetTransactionId: '12345',
          webhookEventId: 'webhook-123',
        }
      );
    });

    it('should warn when no transaction ID in payload', async () => {
      const payload = { payload: {} };

      await (webhookProcessor as any).processPaymentFailed(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No transaction ID found in payment failed webhook',
        {
          webhookEventId: 'webhook-123',
        }
      );
    });
  });

  describe('processRefundCompleted', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.REFUND_COMPLETED,
    };

    const mockRefundTransaction: Partial<Transaction> = {
      id: 'refund-123',
      authorize_net_transaction_id: '12345',
      status: TransactionStatus.PENDING,
    };

    it('should update refund transaction status to completed when transaction found', async () => {
      const payload = { payload: { transId: '12345' } };
      mockTransactionRepository.findOne.mockResolvedValue(
        mockRefundTransaction
      );
      mockTransactionRepository.update.mockResolvedValue({ affected: 1 });

      await (webhookProcessor as any).processRefundCompleted(
        mockWebhookEvent,
        payload
      );

      expect(mockTransactionRepository.update).toHaveBeenCalledWith(
        'refund-123',
        {
          status: TransactionStatus.COMPLETED,
          updated_at: expect.any(Date),
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Refund transaction updated to completed',
        {
          transactionId: 'refund-123',
          authorizeNetTransactionId: '12345',
        }
      );
    });

    it('should warn when refund transaction not found', async () => {
      const payload = { payload: { transId: '12345' } };
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await (webhookProcessor as any).processRefundCompleted(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Refund transaction not found for completed refund webhook',
        {
          authorizeNetTransactionId: '12345',
          webhookEventId: 'webhook-123',
        }
      );
    });

    it('should warn when no transaction ID in payload', async () => {
      const payload = { payload: {} };

      await (webhookProcessor as any).processRefundCompleted(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No transaction ID found in refund completed webhook',
        {
          webhookEventId: 'webhook-123',
        }
      );
    });
  });

  describe('processSubscriptionCreated', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.SUBSCRIPTION_CREATED,
    };

    const mockSubscription: Partial<Subscription> = {
      id: 'sub-123',
      authorize_net_subscription_id: 'authnet-sub-456',
      status: SubscriptionStatus.ACTIVE,
    };

    it('should update subscription status to active when subscription found', async () => {
      const payload = { payload: { subscriptionId: 'authnet-sub-456' } };
      mockSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockSubscriptionRepository.update.mockResolvedValue({ affected: 1 });

      await (webhookProcessor as any).processSubscriptionCreated(
        mockWebhookEvent,
        payload
      );

      expect(mockSubscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { authorize_net_subscription_id: 'authnet-sub-456' },
      });
      expect(mockSubscriptionRepository.update).toHaveBeenCalledWith(
        'sub-123',
        {
          status: SubscriptionStatus.ACTIVE,
          updated_at: expect.any(Date),
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Subscription updated to active',
        {
          subscriptionId: 'sub-123',
          authorizeNetSubscriptionId: 'authnet-sub-456',
        }
      );
    });

    it('should warn when subscription not found', async () => {
      const payload = { payload: { subscriptionId: 'authnet-sub-456' } };
      mockSubscriptionRepository.findOne.mockResolvedValue(null);

      await (webhookProcessor as any).processSubscriptionCreated(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Subscription not found for created subscription webhook',
        {
          authorizeNetSubscriptionId: 'authnet-sub-456',
          webhookEventId: 'webhook-123',
        }
      );
    });

    it('should warn when no subscription ID in payload', async () => {
      const payload = { payload: {} };

      await (webhookProcessor as any).processSubscriptionCreated(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No subscription ID found in subscription created webhook',
        {
          webhookEventId: 'webhook-123',
        }
      );
    });
  });

  describe('processSubscriptionUpdated', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.SUBSCRIPTION_UPDATED,
    };

    const mockSubscription: Partial<Subscription> = {
      id: 'sub-123',
      authorize_net_subscription_id: 'authnet-sub-456',
      status: SubscriptionStatus.ACTIVE,
      amount: 100,
    };

    it('should update subscription when subscription found', async () => {
      const payload = { payload: { subscriptionId: 'authnet-sub-456' } };
      mockSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockSubscriptionRepository.update.mockResolvedValue({ affected: 1 });

      await (webhookProcessor as any).processSubscriptionUpdated(
        mockWebhookEvent,
        payload
      );

      expect(mockSubscriptionRepository.update).toHaveBeenCalledWith(
        'sub-123',
        {
          updated_at: expect.any(Date),
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Subscription updated', {
        subscriptionId: 'sub-123',
        authorizeNetSubscriptionId: 'authnet-sub-456',
        updates: { updated_at: expect.any(Date) },
      });
    });

    it('should update subscription with amount when provided in payload', async () => {
      const payload = {
        payload: {
          subscriptionId: 'authnet-sub-456',
          amount: '150.00',
        },
      };
      mockSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockSubscriptionRepository.update.mockResolvedValue({ affected: 1 });

      await (webhookProcessor as any).processSubscriptionUpdated(
        mockWebhookEvent,
        payload
      );

      expect(mockSubscriptionRepository.update).toHaveBeenCalledWith(
        'sub-123',
        {
          updated_at: expect.any(Date),
          amount: 150,
        }
      );
    });

    it('should warn when subscription not found', async () => {
      const payload = { payload: { subscriptionId: 'authnet-sub-456' } };
      mockSubscriptionRepository.findOne.mockResolvedValue(null);

      await (webhookProcessor as any).processSubscriptionUpdated(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Subscription not found for updated subscription webhook',
        {
          authorizeNetSubscriptionId: 'authnet-sub-456',
          webhookEventId: 'webhook-123',
        }
      );
    });

    it('should warn when no subscription ID in payload', async () => {
      const payload = { payload: {} };

      await (webhookProcessor as any).processSubscriptionUpdated(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No subscription ID found in subscription updated webhook',
        {
          webhookEventId: 'webhook-123',
        }
      );
    });
  });

  describe('processSubscriptionCancelled', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.SUBSCRIPTION_CANCELLED,
    };

    const mockSubscription: Partial<Subscription> = {
      id: 'sub-123',
      authorize_net_subscription_id: 'authnet-sub-456',
      status: SubscriptionStatus.ACTIVE,
    };

    it('should update subscription status to cancelled when subscription found', async () => {
      const payload = { payload: { subscriptionId: 'authnet-sub-456' } };
      mockSubscriptionRepository.findOne.mockResolvedValue(mockSubscription);
      mockSubscriptionRepository.update.mockResolvedValue({ affected: 1 });

      await (webhookProcessor as any).processSubscriptionCancelled(
        mockWebhookEvent,
        payload
      );

      expect(mockSubscriptionRepository.update).toHaveBeenCalledWith(
        'sub-123',
        {
          status: SubscriptionStatus.CANCELLED,
          cancelled_at: expect.any(Date),
          updated_at: expect.any(Date),
        }
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Subscription updated to cancelled',
        {
          subscriptionId: 'sub-123',
          authorizeNetSubscriptionId: 'authnet-sub-456',
        }
      );
    });

    it('should warn when subscription not found', async () => {
      const payload = { payload: { subscriptionId: 'authnet-sub-456' } };
      mockSubscriptionRepository.findOne.mockResolvedValue(null);

      await (webhookProcessor as any).processSubscriptionCancelled(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Subscription not found for cancelled subscription webhook',
        {
          authorizeNetSubscriptionId: 'authnet-sub-456',
          webhookEventId: 'webhook-123',
        }
      );
    });

    it('should warn when no subscription ID in payload', async () => {
      const payload = { payload: {} };

      await (webhookProcessor as any).processSubscriptionCancelled(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No subscription ID found in subscription cancelled webhook',
        { webhookEventId: 'webhook-123' }
      );
    });
  });

  describe('processChargebackCreated', () => {
    const mockWebhookEvent: Partial<WebhookEvent> = {
      id: 'webhook-123',
      event_type: WebhookEventType.CHARGEBACK_CREATED,
    };

    const mockTransaction: Partial<Transaction> = {
      id: 'trans-123',
      authorize_net_transaction_id: '12345',
      status: TransactionStatus.COMPLETED,
    };

    it('should log chargeback when transaction found', async () => {
      const payload = {
        payload: {
          transId: '12345',
          amount: '100.00',
        },
      };
      mockTransactionRepository.findOne.mockResolvedValue(mockTransaction);

      await (webhookProcessor as any).processChargebackCreated(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Chargeback created for transaction',
        {
          transactionId: 'trans-123',
          authorizeNetTransactionId: '12345',
          chargebackAmount: '100.00',
        }
      );
    });

    it('should warn when transaction not found', async () => {
      const payload = { payload: { transId: '12345' } };
      mockTransactionRepository.findOne.mockResolvedValue(null);

      await (webhookProcessor as any).processChargebackCreated(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Transaction not found for chargeback webhook',
        {
          authorizeNetTransactionId: '12345',
          webhookEventId: 'webhook-123',
        }
      );
    });

    it('should warn when no transaction ID in payload', async () => {
      const payload = { payload: {} };

      await (webhookProcessor as any).processChargebackCreated(
        mockWebhookEvent,
        payload
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'No transaction ID found in chargeback created webhook',
        {
          webhookEventId: 'webhook-123',
        }
      );
    });
  });

  describe('extractTransactionId', () => {
    it('should extract transaction ID from payload.transId', () => {
      const payload = { payload: { transId: 12345 } };
      const result = (webhookProcessor as any).extractTransactionId(payload);
      expect(result).toBe('12345');
    });

    it('should extract transaction ID from payload.id for payment events', () => {
      const payload = {
        payload: { id: 67890 },
        eventType: 'payment.completed',
      };
      const result = (webhookProcessor as any).extractTransactionId(payload);
      expect(result).toBe('67890');
    });

    it('should return null when no transaction ID found', () => {
      const payload = { payload: {} };
      const result = (webhookProcessor as any).extractTransactionId(payload);
      expect(result).toBeNull();
    });

    it('should return null when payload.id exists but not for payment event', () => {
      const payload = {
        payload: { id: 67890 },
        eventType: 'subscription.created',
      };
      const result = (webhookProcessor as any).extractTransactionId(payload);
      expect(result).toBeNull();
    });

    it('should handle string transaction IDs', () => {
      const payload = { payload: { transId: '12345' } };
      const result = (webhookProcessor as any).extractTransactionId(payload);
      expect(result).toBe('12345');
    });
  });

  describe('extractSubscriptionId', () => {
    it('should extract subscription ID from payload.subscriptionId', () => {
      const payload = { payload: { subscriptionId: 'sub-123' } };
      const result = (webhookProcessor as any).extractSubscriptionId(payload);
      expect(result).toBe('sub-123');
    });

    it('should extract subscription ID from payload.id for subscription events', () => {
      const payload = {
        payload: { id: 'sub-456' },
        eventType: 'subscription.created',
      };
      const result = (webhookProcessor as any).extractSubscriptionId(payload);
      expect(result).toBe('sub-456');
    });

    it('should return null when no subscription ID found', () => {
      const payload = { payload: {} };
      const result = (webhookProcessor as any).extractSubscriptionId(payload);
      expect(result).toBeNull();
    });

    it('should return null when payload.id exists but not for subscription event', () => {
      const payload = {
        payload: { id: 'sub-456' },
        eventType: 'payment.completed',
      };
      const result = (webhookProcessor as any).extractSubscriptionId(payload);
      expect(result).toBeNull();
    });

    it('should handle numeric subscription IDs', () => {
      const payload = { payload: { subscriptionId: 123456 } };
      const result = (webhookProcessor as any).extractSubscriptionId(payload);
      expect(result).toBe('123456');
    });
  });
});
