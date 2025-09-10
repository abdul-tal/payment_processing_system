import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum AuditAction {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LOGIN = 'login',
  LOGOUT = 'logout',
  PAYMENT_ATTEMPT = 'payment_attempt',
  REFUND_ATTEMPT = 'refund_attempt',
  SUBSCRIPTION_CHANGE = 'subscription_change',
  WEBHOOK_RECEIVED = 'webhook_received',
  API_CALL = 'api_call',
}

export enum AuditEntityType {
  TRANSACTION = 'transaction',
  SUBSCRIPTION = 'subscription',
  WEBHOOK_EVENT = 'webhook_event',
  USER = 'user',
  SYSTEM = 'system',
}

@Entity('audit_logs')
@Index(['entity_type', 'entity_id'])
@Index(['action', 'created_at'])
@Index(['user_id', 'created_at'])
@Index(['ip_address', 'created_at'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action!: AuditAction;

  @Column({
    type: 'enum',
    enum: AuditEntityType,
  })
  entity_type!: AuditEntityType;

  @Column({ type: 'varchar', length: 100, nullable: true })
  entity_id!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  user_id!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_email!: string;

  @Column({ type: 'inet', nullable: true })
  ip_address!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  user_agent!: string;

  @Column({ type: 'text', nullable: true })
  description!: string;

  @Column({ type: 'jsonb', nullable: true })
  old_values!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  new_values!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown>;

  @Column({ type: 'varchar', length: 100, nullable: true })
  session_id!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  request_id!: string;

  @CreateDateColumn()
  created_at!: Date;
}
