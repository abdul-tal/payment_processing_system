import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SubscriptionStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CANCELLED = 'cancelled',
  SUSPENDED = 'suspended',
  EXPIRED = 'expired',
}

export enum BillingInterval {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  YEARLY = 'yearly',
}

@Entity('subscriptions')
@Index(['status', 'next_billing_date'])
@Index(['customer_email'])
@Index(['authorize_net_subscription_id'])
export class Subscription {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  subscription_id!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  authorize_net_subscription_id!: string;

  @Column({ type: 'varchar', length: 255 })
  customer_email!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customer_name!: string;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status!: SubscriptionStatus;

  @Column({ type: 'varchar', length: 100 })
  plan_name!: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({
    type: 'enum',
    enum: BillingInterval,
    default: BillingInterval.MONTHLY,
  })
  billing_interval!: BillingInterval;

  @Column({ type: 'timestamp' })
  start_date!: Date;

  @Column({ type: 'timestamp', nullable: true })
  end_date!: Date;

  @Column({ type: 'timestamp' })
  next_billing_date!: Date;

  @Column({ type: 'timestamp', nullable: true })
  last_billing_date!: Date;

  @Column({ type: 'integer', default: 0 })
  billing_cycles_completed!: number;

  @Column({ type: 'integer', nullable: true })
  total_billing_cycles!: number;

  @Column({ type: 'varchar', length: 4, nullable: true })
  card_last_four!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  card_type!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  cancellation_reason!: string;

  @Column({ type: 'timestamp', nullable: true })
  cancelled_at!: Date;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
