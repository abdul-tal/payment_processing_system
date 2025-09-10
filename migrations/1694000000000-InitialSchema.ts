import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1694000000000 implements MigrationInterface {
  name = 'InitialSchema1694000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "transaction_status_enum" AS ENUM(
        'pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "transaction_type_enum" AS ENUM(
        'payment', 'refund', 'void', 'capture', 'authorization'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "subscription_status_enum" AS ENUM(
        'active', 'inactive', 'cancelled', 'suspended', 'expired'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "billing_interval_enum" AS ENUM(
        'monthly', 'quarterly', 'yearly'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "webhook_event_type_enum" AS ENUM(
        'payment.completed', 'payment.failed', 'subscription.created',
        'subscription.updated', 'subscription.cancelled', 'refund.completed',
        'chargeback.created'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "webhook_status_enum" AS ENUM(
        'pending', 'processing', 'processed', 'failed', 'retrying'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "audit_action_enum" AS ENUM(
        'create', 'update', 'delete', 'login', 'logout', 'payment_attempt',
        'refund_attempt', 'subscription_change', 'webhook_received', 'api_call'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "audit_entity_type_enum" AS ENUM(
        'transaction', 'subscription', 'webhook_event', 'user', 'system'
      )
    `);

    // Create transactions table
    await queryRunner.query(`
      CREATE TABLE "transactions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "transaction_id" character varying(100) NOT NULL,
        "authorize_net_transaction_id" character varying(100),
        "type" "transaction_type_enum" NOT NULL DEFAULT 'payment',
        "status" "transaction_status_enum" NOT NULL DEFAULT 'pending',
        "amount" numeric(10,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "customer_email" character varying(255) NOT NULL,
        "customer_name" character varying(100),
        "customer_phone" character varying(20),
        "billing_address" text,
        "card_last_four" character varying(4),
        "card_type" character varying(20),
        "description" text,
        "metadata" jsonb,
        "failure_reason" text,
        "reference_transaction_id" character varying(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_transactions_transaction_id" UNIQUE ("transaction_id")
      )
    `);

    // Create subscriptions table
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "subscription_id" character varying(100) NOT NULL,
        "authorize_net_subscription_id" character varying(100),
        "customer_email" character varying(255) NOT NULL,
        "customer_name" character varying(100),
        "status" "subscription_status_enum" NOT NULL DEFAULT 'active',
        "plan_name" character varying(100) NOT NULL,
        "amount" numeric(10,2) NOT NULL,
        "currency" character varying(3) NOT NULL DEFAULT 'USD',
        "billing_interval" "billing_interval_enum" NOT NULL DEFAULT 'monthly',
        "start_date" TIMESTAMP NOT NULL,
        "end_date" TIMESTAMP,
        "next_billing_date" TIMESTAMP NOT NULL,
        "last_billing_date" TIMESTAMP,
        "billing_cycles_completed" integer NOT NULL DEFAULT 0,
        "total_billing_cycles" integer,
        "card_last_four" character varying(4),
        "card_type" character varying(20),
        "metadata" jsonb,
        "cancellation_reason" text,
        "cancelled_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_subscriptions_subscription_id" UNIQUE ("subscription_id")
      )
    `);

    // Create webhook_events table
    await queryRunner.query(`
      CREATE TABLE "webhook_events" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "event_id" character varying(100) NOT NULL,
        "external_id" character varying(100),
        "event_type" "webhook_event_type_enum" NOT NULL,
        "status" "webhook_status_enum" NOT NULL DEFAULT 'pending',
        "payload" jsonb NOT NULL,
        "source" character varying(255),
        "related_transaction_id" character varying(100),
        "related_subscription_id" character varying(100),
        "retry_count" integer NOT NULL DEFAULT 0,
        "max_retries" integer NOT NULL DEFAULT 3,
        "next_retry_at" TIMESTAMP,
        "error_message" text,
        "processed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_webhook_events_event_id" UNIQUE ("event_id")
      )
    `);

    // Create audit_logs table
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "action" "audit_action_enum" NOT NULL,
        "entity_type" "audit_entity_type_enum" NOT NULL,
        "entity_id" character varying(100),
        "user_id" character varying(100),
        "user_email" character varying(255),
        "ip_address" inet,
        "user_agent" character varying(500),
        "description" text,
        "old_values" jsonb,
        "new_values" jsonb,
        "metadata" jsonb,
        "session_id" character varying(100),
        "request_id" character varying(100),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for performance optimization
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_status_created_at" ON "transactions" ("status", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_customer_email" ON "transactions" ("customer_email")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_transactions_authorize_net_transaction_id" ON "transactions" ("authorize_net_transaction_id")`
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_subscriptions_status_next_billing_date" ON "subscriptions" ("status", "next_billing_date")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscriptions_customer_email" ON "subscriptions" ("customer_email")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_subscriptions_authorize_net_subscription_id" ON "subscriptions" ("authorize_net_subscription_id")`
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_event_type_created_at" ON "webhook_events" ("event_type", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_status_created_at" ON "webhook_events" ("status", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_webhook_events_external_id" ON "webhook_events" ("external_id")`
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_entity_type_entity_id" ON "audit_logs" ("entity_type", "entity_id")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_action_created_at" ON "audit_logs" ("action", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_user_id_created_at" ON "audit_logs" ("user_id", "created_at")`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_ip_address_created_at" ON "audit_logs" ("ip_address", "created_at")`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(
      `DROP INDEX "IDX_audit_logs_ip_address_created_at"`
    );
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_user_id_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_logs_action_created_at"`);
    await queryRunner.query(
      `DROP INDEX "IDX_audit_logs_entity_type_entity_id"`
    );

    await queryRunner.query(`DROP INDEX "IDX_webhook_events_external_id"`);
    await queryRunner.query(
      `DROP INDEX "IDX_webhook_events_status_created_at"`
    );
    await queryRunner.query(
      `DROP INDEX "IDX_webhook_events_event_type_created_at"`
    );

    await queryRunner.query(
      `DROP INDEX "IDX_subscriptions_authorize_net_subscription_id"`
    );
    await queryRunner.query(`DROP INDEX "IDX_subscriptions_customer_email"`);
    await queryRunner.query(
      `DROP INDEX "IDX_subscriptions_status_next_billing_date"`
    );

    await queryRunner.query(
      `DROP INDEX "IDX_transactions_authorize_net_transaction_id"`
    );
    await queryRunner.query(`DROP INDEX "IDX_transactions_customer_email"`);
    await queryRunner.query(`DROP INDEX "IDX_transactions_status_created_at"`);

    // Drop tables
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "webhook_events"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TABLE "transactions"`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE "audit_entity_type_enum"`);
    await queryRunner.query(`DROP TYPE "audit_action_enum"`);
    await queryRunner.query(`DROP TYPE "webhook_status_enum"`);
    await queryRunner.query(`DROP TYPE "webhook_event_type_enum"`);
    await queryRunner.query(`DROP TYPE "billing_interval_enum"`);
    await queryRunner.query(`DROP TYPE "subscription_status_enum"`);
    await queryRunner.query(`DROP TYPE "transaction_type_enum"`);
    await queryRunner.query(`DROP TYPE "transaction_status_enum"`);
  }
}
