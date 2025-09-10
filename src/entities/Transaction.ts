import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum TransactionStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  REFUNDED = 'refunded',
}

export enum TransactionType {
  PAYMENT = 'payment',
  REFUND = 'refund',
  VOID = 'void',
  CAPTURE = 'capture',
  AUTHORIZATION = 'authorization',
}

@Entity('transactions')
@Index(['status', 'created_at'])
@Index(['customer_email'])
@Index(['authorize_net_transaction_id'])
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  transaction_id!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  authorize_net_transaction_id!: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
    default: TransactionType.PAYMENT,
  })
  type!: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status!: TransactionStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  amount!: number;

  @Column({ type: 'varchar', length: 3, default: 'USD' })
  currency!: string;

  @Column({ type: 'varchar', length: 255 })
  customer_email!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  customer_name!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  customer_phone!: string;

  @Column({ type: 'text', nullable: true })
  billing_address!: string;

  @Column({ type: 'varchar', length: 4, nullable: true })
  card_last_four!: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  card_type!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  failure_reason!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  reference_transaction_id!: string; // For refunds/voids

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}
