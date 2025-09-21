import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum WebhookEventType {
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  SUBSCRIPTION_CREATED = 'subscription.created',
  SUBSCRIPTION_UPDATED = 'subscription.updated',
  SUBSCRIPTION_CANCELLED = 'subscription.cancelled',
  REFUND_COMPLETED = 'refund.completed',
  CHARGEBACK_CREATED = 'chargeback.created',
}

export enum WebhookStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
  RETRYING = 'retrying',
}

@Entity('webhook_events')
@Index(['event_type', 'created_at'])
@Index(['status', 'created_at'])
@Index(['external_id'])
export class WebhookEvent {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  event_id!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  external_id!: string; // ID from external system (Authorize.Net)

  @Column({
    type: 'enum',
    enum: WebhookEventType,
  })
  event_type!: WebhookEventType;

  @Column({
    type: 'enum',
    enum: WebhookStatus,
    default: WebhookStatus.PENDING,
  })
  status!: WebhookStatus;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 255, nullable: true })
  source!: string; // Source system (e.g., 'authorize_net')

  @Column({ type: 'varchar', length: 100, nullable: true })
  related_transaction_id!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  related_subscription_id!: string | null;

  @Column({ type: 'integer', default: 0 })
  retry_count!: number;

  @Column({ type: 'integer', default: 3 })
  max_retries!: number;

  @Column({ type: 'timestamp', nullable: true })
  next_retry_at!: Date;

  @Column({ type: 'text', nullable: true })
  error_message!: string;

  @Column({ type: 'timestamp', nullable: true })
  processed_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
