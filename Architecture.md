# System Architecture

This document provides a comprehensive overview of the Payment Backend Service architecture, including API endpoints, system flows, database schema, entity relationships, and key design decisions.

## 🏗️ High-Level Architecture

```mermaid
graph TB
    Client[Client Applications] --> Gateway[API Gateway/Load Balancer]
    Gateway --> API[Payment API Server]
    
    API --> PaymentSvc[Payment Service]
    API --> SubSvc[Subscription Service]
    API --> WebhookSvc[Webhook Service]
    
    PaymentSvc --> AuthNet[Authorize.Net API]
    PaymentSvc --> DB[(PostgreSQL)]
    
    SubSvc --> Queue[Redis Queue]
    SubSvc --> DB
    
    WebhookSvc --> Queue
    WebhookSvc --> DB
    
    Queue --> Workers[Background Workers]
    Workers --> DB
    Workers --> AuthNet
    
    API --> Redis[(Redis Cache)]
    API --> Metrics[Prometheus Metrics]
    
    subgraph "Monitoring Stack"
        Metrics --> Grafana[Grafana Dashboard]
        API --> Logs[Winston Logs]
    end
```

## 🔄 System Flows

### 1. Purchase Transaction Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant PaymentSvc
    participant AuthNet
    participant DB
    
    Client->>API: POST /payments/purchase
    API->>API: Validate Request & Generate Correlation ID
    API->>PaymentSvc: Process Purchase
    PaymentSvc->>DB: Check Idempotency Key
    PaymentSvc->>AuthNet: Create Transaction
    AuthNet-->>PaymentSvc: Transaction Response
    PaymentSvc->>DB: Store Transaction
    PaymentSvc-->>API: Payment Result
    API-->>Client: Response with Transaction ID
```

### 2. Authorize + Capture Flow

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant PaymentSvc
    participant AuthNet
    participant DB
    
    Note over Client,DB: Authorization Phase
    Client->>API: POST /payments/authorize
    API->>PaymentSvc: Process Authorization
    PaymentSvc->>AuthNet: Create Authorization
    AuthNet-->>PaymentSvc: Auth Response
    PaymentSvc->>DB: Store Authorization
    PaymentSvc-->>API: Auth Result
    API-->>Client: Authorization ID
    
    Note over Client,DB: Capture Phase (Later)
    Client->>API: POST /payments/capture
    API->>PaymentSvc: Process Capture
    PaymentSvc->>DB: Validate Authorization
    PaymentSvc->>AuthNet: Capture Transaction
    AuthNet-->>PaymentSvc: Capture Response
    PaymentSvc->>DB: Update Transaction
    PaymentSvc-->>API: Capture Result
    API-->>Client: Transaction ID
```

### 3. Subscription Billing Flow

```mermaid
sequenceDiagram
    participant Scheduler
    participant Queue
    participant Worker
    participant PaymentSvc
    participant AuthNet
    participant DB
    
    Scheduler->>Queue: Schedule Billing Job
    Queue->>Worker: Process Billing
    Worker->>DB: Get Due Subscriptions
    Worker->>PaymentSvc: Process Payment
    PaymentSvc->>AuthNet: Create Transaction
    AuthNet-->>PaymentSvc: Payment Result
    
    alt Payment Success
        PaymentSvc->>DB: Update Subscription
        Worker->>DB: Schedule Next Billing
    else Payment Failed
        PaymentSvc->>DB: Log Failed Payment
        Worker->>Queue: Schedule Retry (with backoff)
    end
```

### 4. Webhook Processing Flow

```mermaid
sequenceDiagram
    participant AuthNet
    participant API
    participant Queue
    participant Worker
    participant DB
    
    AuthNet->>API: POST /webhooks/authorize-net
    API->>API: Verify Signature
    API->>Queue: Queue Event
    API-->>AuthNet: 200 OK
    
    Queue->>Worker: Process Event
    Worker->>DB: Check Duplicate
    
    alt New Event
        Worker->>DB: Update Transaction Status
        Worker->>DB: Log Event Processing
    else Duplicate Event
        Worker->>DB: Log Duplicate
    end
    
    alt Processing Failed
        Worker->>Queue: Move to Dead Letter Queue
    end
```

## 🗄️ Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    TRANSACTIONS {
        uuid id PK
        varchar transaction_id UK
        varchar correlation_id
        varchar type
        varchar status
        decimal amount
        varchar currency
        varchar customer_id
        varchar payment_method_token
        varchar auth_code
        varchar reference_number
        uuid parent_transaction_id FK
        varchar idempotency_key UK
        jsonb metadata
        timestamp created_at
        timestamp updated_at
        timestamp expires_at
    }
    
    SUBSCRIPTIONS {
        uuid id PK
        varchar subscription_id UK
        varchar customer_id
        varchar plan_id
        varchar status
        decimal amount
        varchar currency
        varchar billing_cycle
        varchar payment_method_token
        timestamp next_billing_date
        timestamp trial_end_date
        timestamp canceled_at
        jsonb metadata
        timestamp created_at
        timestamp updated_at
    }
    
    WEBHOOK_EVENTS {
        uuid id PK
        varchar event_id UK
        varchar event_type
        jsonb payload
        timestamp processed_at
        integer retry_count
        varchar status
        text error_message
        timestamp created_at
    }
    
    AUDIT_LOGS {
        uuid id PK
        varchar correlation_id
        varchar action
        varchar entity_type
        varchar entity_id
        varchar user_id
        jsonb changes
        inet ip_address
        text user_agent
        timestamp created_at
    }
    
    TRANSACTIONS ||--o{ TRANSACTIONS : "parent_transaction_id"
    SUBSCRIPTIONS ||--o{ TRANSACTIONS : "generates"
    WEBHOOK_EVENTS ||--o{ TRANSACTIONS : "updates"
    AUDIT_LOGS ||--o{ TRANSACTIONS : "tracks"
    AUDIT_LOGS ||--o{ SUBSCRIPTIONS : "tracks"
```

### Database Indexes

```sql
-- Performance Indexes
CREATE INDEX idx_transactions_transaction_id ON transactions(transaction_id);
CREATE INDEX idx_transactions_correlation_id ON transactions(correlation_id);
CREATE INDEX idx_transactions_customer_id ON transactions(customer_id);
CREATE INDEX idx_transactions_status ON transactions(status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);
CREATE INDEX idx_transactions_idempotency_key ON transactions(idempotency_key);

CREATE INDEX idx_subscriptions_subscription_id ON subscriptions(subscription_id);
CREATE INDEX idx_subscriptions_customer_id ON subscriptions(customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing_date ON subscriptions(next_billing_date);

CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);

CREATE INDEX idx_audit_logs_correlation_id ON audit_logs(correlation_id);
CREATE INDEX idx_audit_logs_entity_type_id ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
```

## 🌐 API Endpoints Overview

### Payment Endpoints
| Method | Endpoint | Purpose | Authentication |
|--------|----------|---------|----------------|
| POST | `/api/v1/payments/purchase` | Single-step payment | API Key |
| POST | `/api/v1/payments/authorize` | Authorization hold | API Key |
| POST | `/api/v1/payments/capture` | Capture authorized payment | API Key |
| POST | `/api/v1/payments/refund` | Refund transaction | API Key |
| POST | `/api/v1/payments/cancel` | Cancel authorization | API Key |

### Subscription Endpoints
| Method | Endpoint | Purpose | Authentication |
|--------|----------|---------|----------------|
| POST | `/api/v1/subscriptions` | Create subscription | API Key |
| GET | `/api/v1/subscriptions/{id}` | Get subscription details | API Key |
| PUT | `/api/v1/subscriptions/{id}` | Update subscription | API Key |
| DELETE | `/api/v1/subscriptions/{id}` | Cancel subscription | API Key |

### System Endpoints
| Method | Endpoint | Purpose | Authentication |
|--------|----------|---------|----------------|
| GET | `/api/v1/health` | Health check | None |
| GET | `/api/v1/metrics` | Prometheus metrics | None |
| POST | `/api/v1/webhooks/authorize-net` | Webhook receiver | Signature |

## 🏛️ Design Trade-offs and Decisions

### 1. Synchronous vs Asynchronous Processing

#### Decision: Hybrid Approach
- **Synchronous**: Core payment operations (purchase, authorize, capture)
- **Asynchronous**: Webhook processing, subscription billing, retry logic

#### Rationale:
- **Real-time Response**: Payment operations need immediate feedback
- **Scalability**: Webhook processing can handle high volumes without blocking
- **Reliability**: Async processing allows for retry mechanisms and dead letter queues

#### Implementation:
```typescript
// Synchronous payment processing
app.post('/payments/purchase', async (req, res) => {
  const result = await paymentService.processPurchase(req.body);
  res.json(result); // Immediate response
});

// Asynchronous webhook processing
app.post('/webhooks/authorize-net', async (req, res) => {
  await webhookQueue.add('process-event', req.body);
  res.status(200).send('OK'); // Immediate acknowledgment
});
```

### 2. Database Transaction Strategy

#### Decision: Optimistic Locking with Idempotency Keys
- **Optimistic Locking**: Assume conflicts are rare, check at commit time
- **Idempotency Keys**: Prevent duplicate transactions at application level

#### Rationale:
- **Performance**: Better throughput than pessimistic locking
- **Reliability**: Idempotency keys ensure exactly-once processing
- **Scalability**: Reduces lock contention in high-concurrency scenarios

#### Implementation:
```typescript
async processPurchase(request: PurchaseRequest): Promise<TransactionResult> {
  // Check idempotency key first
  const existing = await this.transactionRepo.findByIdempotencyKey(
    request.idempotencyKey
  );
  if (existing) {
    return existing; // Return cached result
  }

  // Process with optimistic locking
  return await this.transactionRepo.transaction(async (manager) => {
    const transaction = await this.authorizeNet.createTransaction(request);
    return await manager.save(Transaction, transaction);
  });
}
```

### 3. Retry Strategy

#### Decision: Exponential Backoff with Circuit Breaker
- **Exponential Backoff**: Gradually increase retry intervals
- **Circuit Breaker**: Stop retrying after consecutive failures
- **Dead Letter Queue**: Handle permanently failed messages

#### Rationale:
- **Resilience**: Handle transient failures gracefully
- **Resource Protection**: Prevent overwhelming downstream services
- **Observability**: Failed messages are preserved for analysis

#### Implementation:
```typescript
const retryConfig = {
  attempts: 3,
  delay: (attemptNumber) => Math.pow(2, attemptNumber) * 1000, // 1s, 2s, 4s
  onFailedAttempt: (error) => {
    logger.warn(`Attempt ${error.attemptNumber} failed: ${error.message}`);
  }
};

// Circuit breaker configuration
const circuitBreaker = new CircuitBreaker(paymentService.processPayment, {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 60000
});
```

### 4. Data Encryption Strategy

#### Decision: Field-Level Encryption with Key Rotation
- **AES-256**: Industry standard encryption algorithm
- **Field-Level**: Encrypt only sensitive fields, not entire records
- **Key Rotation**: Support for periodic key rotation

#### Rationale:
- **PCI Compliance**: Meets data protection requirements
- **Performance**: Selective encryption minimizes overhead
- **Security**: Key rotation limits exposure window

#### Implementation:
```typescript
@Entity()
export class Transaction {
  @Column({ transformer: new EncryptionTransformer() })
  paymentMethodToken: string;

  @Column({ transformer: new EncryptionTransformer() })
  customerEmail: string;

  // Non-sensitive fields remain unencrypted
  @Column()
  amount: number;
}
```

### 5. Queue Architecture

#### Decision: Redis-Based Queue with Bull
- **Redis**: In-memory data structure store for queues
- **Bull**: Robust job queue library with retry logic
- **Multiple Queues**: Separate queues for different job types

#### Rationale:
- **Performance**: Redis provides fast queue operations
- **Reliability**: Bull handles job persistence and retry logic
- **Scalability**: Multiple workers can process jobs concurrently
- **Monitoring**: Built-in job monitoring and metrics

#### Implementation:
```typescript
// Queue definitions
const webhookQueue = new Queue('webhook processing', redisConfig);
const billingQueue = new Queue('subscription billing', redisConfig);

// Job processors
webhookQueue.process('process-event', 5, webhookProcessor);
billingQueue.process('process-billing', 3, billingProcessor);

// Job scheduling
await billingQueue.add('process-billing', 
  { subscriptionId }, 
  { delay: calculateNextBilling(subscription) }
);
```

## 🔒 Compliance Considerations

### PCI DSS Requirements

#### Data Storage
- **Never Store**: Full credit card numbers, CVV codes
- **Tokenization**: Use Authorize.Net payment tokens
- **Encryption**: AES-256 for sensitive data at rest
- **Access Control**: Role-based access to payment data

#### Network Security
- **TLS 1.3**: All communications encrypted in transit
- **Firewall**: Restrict access to payment processing systems
- **Network Segmentation**: Isolate payment processing environment

#### Monitoring and Logging
- **Audit Trail**: Log all payment operations
- **Access Monitoring**: Track all data access attempts
- **Anomaly Detection**: Monitor for suspicious activities
- **Log Protection**: Secure and tamper-evident logging

### Implementation Example:
```typescript
// PCI-compliant payment data handling
interface SecurePaymentData {
  // Safe to store
  cardLast4: string;
  cardType: string;
  paymentToken: string; // Authorize.Net token
  expiryMonth: string;
  expiryYear: string;
  
  // Never stored
  // cardNumber: NEVER
  // cvv: NEVER
}

// Audit logging for compliance
async auditPaymentOperation(operation: string, data: any) {
  await this.auditService.log({
    action: operation,
    entityType: 'payment',
    entityId: data.transactionId,
    userId: data.userId,
    ipAddress: data.ipAddress,
    changes: sanitizeForAudit(data), // Remove sensitive fields
    timestamp: new Date()
  });
}
```

## 📊 Performance Considerations

### Database Optimization
- **Connection Pooling**: 5-20 connections per instance
- **Query Optimization**: Proper indexing strategy
- **Read Replicas**: Separate read/write operations for scaling

### Caching Strategy
- **Redis Cache**: Payment tokens, customer data (30 min TTL)
- **Application Cache**: Configuration data, rate limit counters
- **CDN**: Static assets and documentation

### Monitoring Metrics
- **Response Time**: 95th percentile < 500ms
- **Throughput**: 1000+ transactions per minute
- **Error Rate**: < 0.5% for payment operations
- **Queue Processing**: < 30 seconds end-to-end

---

This architecture provides a robust, scalable, and compliant foundation for payment processing while maintaining flexibility for future enhancements and integrations.
