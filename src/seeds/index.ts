import { AppDataSource } from '../config/database';
import {
  Transaction,
  TransactionStatus,
  TransactionType,
  Subscription,
  SubscriptionStatus,
  BillingInterval,
  WebhookEvent,
  WebhookEventType,
  WebhookStatus,
  AuditLog,
  AuditAction,
  AuditEntityType,
} from '../entities';

export async function seedDatabase(): Promise<void> {
  console.log('Starting database seeding...');

  try {
    // Seed sample transactions
    const transactionRepository = AppDataSource.getRepository(Transaction);

    const sampleTransactions = [
      {
        transaction_id: 'TXN_001_DEV',
        authorize_net_transaction_id: 'AUTH_12345',
        type: TransactionType.PAYMENT,
        status: TransactionStatus.COMPLETED,
        amount: 99.99,
        currency: 'USD',
        customer_email: 'john.doe@example.com',
        customer_name: 'John Doe',
        customer_phone: '+1234567890',
        billing_address: '123 Main St, Anytown, ST 12345',
        card_last_four: '1234',
        card_type: 'Visa',
        description: 'Sample payment transaction',
        metadata: { source: 'web', campaign: 'summer2023' },
      },
      {
        transaction_id: 'TXN_002_DEV',
        type: TransactionType.PAYMENT,
        status: TransactionStatus.FAILED,
        amount: 149.99,
        currency: 'USD',
        customer_email: 'jane.smith@example.com',
        customer_name: 'Jane Smith',
        description: 'Failed payment transaction',
        failure_reason: 'Insufficient funds',
        metadata: { source: 'mobile', retry_count: 1 },
      },
    ];

    for (const txnData of sampleTransactions) {
      const existingTxn = await transactionRepository.findOne({
        where: { transaction_id: txnData.transaction_id },
      });

      if (!existingTxn) {
        const transaction = transactionRepository.create(txnData);
        await transactionRepository.save(transaction);
        console.log(`Created transaction: ${txnData.transaction_id}`);
      }
    }

    // Seed sample subscriptions
    const subscriptionRepository = AppDataSource.getRepository(Subscription);

    const sampleSubscriptions = [
      {
        subscription_id: 'SUB_001_DEV',
        authorize_net_subscription_id: 'AUTH_SUB_67890',
        customer_email: 'subscriber@example.com',
        customer_name: 'Premium User',
        status: SubscriptionStatus.ACTIVE,
        plan_name: 'Premium Monthly',
        amount: 29.99,
        currency: 'USD',
        billing_interval: BillingInterval.MONTHLY,
        start_date: new Date('2023-01-01'),
        next_billing_date: new Date('2024-01-01'),
        billing_cycles_completed: 12,
        card_last_four: '5678',
        card_type: 'Mastercard',
        metadata: { plan_features: ['premium_support', 'advanced_analytics'] },
      },
    ];

    for (const subData of sampleSubscriptions) {
      const existingSub = await subscriptionRepository.findOne({
        where: { subscription_id: subData.subscription_id },
      });

      if (!existingSub) {
        const subscription = subscriptionRepository.create(subData);
        await subscriptionRepository.save(subscription);
        console.log(`Created subscription: ${subData.subscription_id}`);
      }
    }

    // Seed sample webhook events
    const webhookRepository = AppDataSource.getRepository(WebhookEvent);

    const sampleWebhooks = [
      {
        event_id: 'WH_001_DEV',
        external_id: 'auth_net_webhook_123',
        event_type: WebhookEventType.PAYMENT_COMPLETED,
        status: WebhookStatus.PROCESSED,
        payload: {
          transaction_id: 'TXN_001_DEV',
          amount: 99.99,
          status: 'completed',
          timestamp: new Date().toISOString(),
        },
        source: 'authorize_net',
        related_transaction_id: 'TXN_001_DEV',
        processed_at: new Date(),
      },
    ];

    for (const webhookData of sampleWebhooks) {
      const existingWebhook = await webhookRepository.findOne({
        where: { event_id: webhookData.event_id },
      });

      if (!existingWebhook) {
        const webhook = webhookRepository.create(webhookData);
        await webhookRepository.save(webhook);
        console.log(`Created webhook event: ${webhookData.event_id}`);
      }
    }

    // Seed sample audit logs
    const auditRepository = AppDataSource.getRepository(AuditLog);

    const sampleAudits = [
      {
        action: AuditAction.PAYMENT_ATTEMPT,
        entity_type: AuditEntityType.TRANSACTION,
        entity_id: 'TXN_001_DEV',
        user_email: 'john.doe@example.com',
        ip_address: '192.168.1.100',
        user_agent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        description: 'Payment attempt successful',
        new_values: { status: 'completed', amount: 99.99 },
        metadata: { source: 'payment_form' },
      },
    ];

    for (const auditData of sampleAudits) {
      const audit = auditRepository.create(auditData);
      await auditRepository.save(audit);
      console.log(`Created audit log for: ${auditData.entity_id}`);
    }

    console.log('Database seeding completed successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
    throw error;
  }
}

export async function clearDatabase(): Promise<void> {
  console.log('Clearing database...');

  try {
    await AppDataSource.getRepository(AuditLog).clear();
    await AppDataSource.getRepository(WebhookEvent).clear();
    await AppDataSource.getRepository(Subscription).clear();
    await AppDataSource.getRepository(Transaction).clear();

    console.log('Database cleared successfully!');
  } catch (error) {
    console.error('Error clearing database:', error);
    throw error;
  }
}
