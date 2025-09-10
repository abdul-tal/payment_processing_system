# Payment Backend Service - Technical Product Requirements Document

## Document Information
- **Version**: 1.0
- **Last Updated**: September 7, 2025
- **Related Documents**: [Payment Backend Business PRD](./payment-backend-prd.md)

## 1. System Architecture Overview

### 1.1 High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │───▶│   API Gateway   │───▶│  Payment API    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                                                        │
                       ┌─────────────────┐             │
                       │   Event Queue   │◀────────────┤
                       └─────────────────┘             │
                                │                      │
                       ┌─────────────────┐             │
                       │ Webhook Handler │             │
                       └─────────────────┘             │
                                                       │
┌─────────────────┐    ┌─────────────────┐             │
│ Authorize.Net   │◀───│   HTTP Client   │◀────────────┘
│   Sandbox API   │    └─────────────────┘
└─────────────────┘
                       ┌─────────────────┐
                       │   PostgreSQL    │
                       │    Database     │
                       └─────────────────┘
```

### 1.2 Core Components

#### 1.2.1 API Server (Express.js)
- **Purpose**: Handle HTTP requests and route to appropriate services
- **Technology**: Node.js + TypeScript + Express.js
- **Responsibilities**:
  - Request validation and sanitization
  - Authentication and authorization
  - Rate limiting
  - Response formatting
  - Correlation ID generation

#### 1.2.2 Payment Service Layer
- **Purpose**: Business logic for payment operations
- **Responsibilities**:
  - Payment flow orchestration
  - Authorize.Net API integration
  - Transaction state management
  - Idempotency handling
  - Retry logic implementation

#### 1.2.3 Webhook Processing System
- **Purpose**: Handle asynchronous payment events
- **Components**:
  - Webhook receiver endpoint
  - Event queue (Redis-based)
  - Event processors
  - Dead letter queue for failed events

#### 1.2.4 Data Access Layer
- **Purpose**: Database operations and data persistence
- **Technology**: TypeORM with PostgreSQL
- **Responsibilities**:
  - Transaction CRUD operations
  - Subscription management
  - Audit logging
  - Data encryption/decryption

## 2. Technology Stack Specifications

### 2.1 Runtime Environment
- **Node.js**: Version 18.x LTS
- **TypeScript**: Version 5.x
- **Package Manager**: npm or yarn

### 2.2 Core Dependencies
```json
{
  "express": "^4.18.x",
  "typescript": "^5.x.x",
  "typeorm": "^0.3.x",
  "pg": "^8.x.x",
  "redis": "^4.x.x",
  "joi": "^17.x.x",
  "winston": "^3.x.x",
  "helmet": "^7.x.x",
  "cors": "^2.x.x",
  "rate-limiter-flexible": "^3.x.x",
  "uuid": "^9.x.x",
  "crypto": "built-in",
  "axios": "^1.x.x"
}
```

### 2.3 Development Dependencies
```json
{
  "jest": "^29.x.x",
  "@types/jest": "^29.x.x",
  "supertest": "^6.x.x",
  "ts-node": "^10.x.x",
  "nodemon": "^3.x.x",
  "eslint": "^8.x.x",
  "@typescript-eslint/parser": "^6.x.x",
  "prettier": "^3.x.x"
}
```

## 3. API Specifications

### 3.1 Base Configuration
- **Base URL**: `/api/v1`
- **Content-Type**: `application/json`
- **Authentication**: API Key in header (`X-API-Key`)
- **Correlation ID**: `X-Correlation-ID` header (auto-generated if not provided)

### 3.2 Core Payment Endpoints

#### 3.2.1 Purchase Transaction
```typescript
POST /api/v1/payments/purchase

Request:
{
  "amount": number,           // Amount in cents
  "currency": "USD",          // Currency code
  "paymentMethod": {
    "type": "credit_card",
    "cardNumber": string,     // Will be tokenized
    "expiryMonth": string,
    "expiryYear": string,
    "cvv": string,
    "cardholderName": string
  },
  "customer": {
    "id": string,
    "email": string,
    "firstName": string,
    "lastName": string,
    "address": AddressObject
  },
  "metadata": object,         // Optional custom data
  "idempotencyKey": string    // Required for idempotency
}

Response:
{
  "transactionId": string,
  "status": "success" | "failed" | "pending",
  "amount": number,
  "currency": string,
  "authCode": string,
  "transactionReference": string,
  "timestamp": string,
  "correlationId": string,
  "error": ErrorObject | null
}
```

#### 3.2.2 Authorize Transaction
```typescript
POST /api/v1/payments/authorize

Request: (Same as purchase)

Response:
{
  "authorizationId": string,
  "status": "authorized" | "declined",
  "amount": number,
  "expiresAt": string,
  "correlationId": string,
  "error": ErrorObject | null
}
```

#### 3.2.3 Capture Transaction
```typescript
POST /api/v1/payments/capture

Request:
{
  "authorizationId": string,
  "amount": number,           // Optional, defaults to full amount
  "idempotencyKey": string
}

Response:
{
  "transactionId": string,
  "capturedAmount": number,
  "status": "captured" | "failed",
  "correlationId": string,
  "error": ErrorObject | null
}
```

### 3.3 Subscription Endpoints

#### 3.3.1 Create Subscription
```typescript
POST /api/v1/subscriptions

Request:
{
  "customerId": string,
  "planId": string,
  "paymentMethod": PaymentMethodObject,
  "billingCycle": "monthly" | "quarterly" | "annually",
  "amount": number,
  "startDate": string,
  "trialPeriodDays": number,  // Optional
  "metadata": object
}

Response:
{
  "subscriptionId": string,
  "status": "active" | "trial" | "failed",
  "nextBillingDate": string,
  "correlationId": string
}
```

### 3.4 Webhook Endpoint
```typescript
POST /api/v1/webhooks/authorize-net

Headers:
{
  "X-ANET-Signature": string  // Webhook signature for verification
}

Request: (Authorize.Net webhook payload)
Response: 200 OK (acknowledgment only)
```

## 4. Data Models & Database Schema

### 4.1 Database Tables

#### 4.1.1 Transactions Table
```sql
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id VARCHAR(255) UNIQUE NOT NULL,
    correlation_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL, -- 'purchase', 'authorize', 'capture', 'refund'
    status VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    customer_id VARCHAR(255),
    payment_method_token VARCHAR(255),
    auth_code VARCHAR(255),
    reference_number VARCHAR(255),
    parent_transaction_id UUID, -- For captures/refunds
    idempotency_key VARCHAR(255) UNIQUE,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP, -- For authorizations
    
    INDEX idx_transaction_id (transaction_id),
    INDEX idx_correlation_id (correlation_id),
    INDEX idx_customer_id (customer_id),
    INDEX idx_idempotency_key (idempotency_key),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

#### 4.1.2 Subscriptions Table
```sql
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id VARCHAR(255) UNIQUE NOT NULL,
    customer_id VARCHAR(255) NOT NULL,
    plan_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    billing_cycle VARCHAR(20) NOT NULL,
    payment_method_token VARCHAR(255),
    next_billing_date TIMESTAMP,
    trial_end_date TIMESTAMP,
    canceled_at TIMESTAMP,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_subscription_id (subscription_id),
    INDEX idx_customer_id (customer_id),
    INDEX idx_status (status),
    INDEX idx_next_billing_date (next_billing_date)
);
```

#### 4.1.3 Webhook Events Table
```sql
CREATE TABLE webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    processed_at TIMESTAMP,
    retry_count INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_event_id (event_id),
    INDEX idx_event_type (event_type),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
);
```

#### 4.1.4 Audit Logs Table
```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    changes JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    
    INDEX idx_correlation_id (correlation_id),
    INDEX idx_entity_type_id (entity_type, entity_id),
    INDEX idx_created_at (created_at)
);
```

### 4.2 TypeScript Interfaces

#### 4.2.1 Core Types
```typescript
interface Transaction {
  id: string;
  transactionId: string;
  correlationId: string;
  type: TransactionType;
  status: TransactionStatus;
  amount: number;
  currency: string;
  customerId?: string;
  paymentMethodToken?: string;
  authCode?: string;
  referenceNumber?: string;
  parentTransactionId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

enum TransactionType {
  PURCHASE = 'purchase',
  AUTHORIZE = 'authorize',
  CAPTURE = 'capture',
  REFUND = 'refund',
  VOID = 'void'
}

enum TransactionStatus {
  PENDING = 'pending',
  SUCCESS = 'success',
  FAILED = 'failed',
  AUTHORIZED = 'authorized',
  CAPTURED = 'captured',
  REFUNDED = 'refunded',
  VOIDED = 'voided'
}
```

#### 4.2.2 Payment Method Types
```typescript
interface PaymentMethod {
  type: 'credit_card' | 'bank_account';
  cardNumber?: string;
  expiryMonth?: string;
  expiryYear?: string;
  cvv?: string;
  cardholderName?: string;
  accountNumber?: string;
  routingNumber?: string;
  accountType?: 'checking' | 'savings';
}

interface Customer {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  address: Address;
}

interface Address {
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}
```

## 5. Error Handling & Logging

### 5.1 Error Response Format
```typescript
interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    correlationId: string;
    timestamp: string;
  };
}
```

### 5.2 Error Codes
```typescript
enum ErrorCodes {
  // Validation Errors (4xx)
  INVALID_REQUEST = 'INVALID_REQUEST',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_PAYMENT_METHOD = 'INVALID_PAYMENT_METHOD',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  
  // Business Logic Errors (4xx)
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  CARD_DECLINED = 'CARD_DECLINED',
  EXPIRED_AUTHORIZATION = 'EXPIRED_AUTHORIZATION',
  REFUND_LIMIT_EXCEEDED = 'REFUND_LIMIT_EXCEEDED',
  
  // System Errors (5xx)
  PAYMENT_GATEWAY_ERROR = 'PAYMENT_GATEWAY_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE'
}
```

### 5.3 Logging Structure
```typescript
interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  correlationId: string;
  service: string;
  operation: string;
  message: string;
  metadata?: Record<string, any>;
  error?: {
    name: string;
    message: string;
    stack: string;
  };
}
```

## 6. Security Specifications

### 6.1 Data Encryption
- **At Rest**: AES-256 encryption for sensitive fields
- **In Transit**: TLS 1.3 for all communications
- **Key Management**: Environment variables with rotation capability

### 6.2 PCI DSS Compliance
```typescript
// Sensitive data handling
interface SecurePaymentData {
  // Never store full card numbers
  cardNumberLast4: string;
  cardType: string;
  paymentToken: string; // Authorize.Net token
  expiryMonth: string;
  expiryYear: string;
  // CVV is never stored
}
```

### 6.3 Rate Limiting Configuration
```typescript
const rateLimitConfig = {
  payment_endpoints: {
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
    skipSuccessfulRequests: false
  },
  webhook_endpoints: {
    windowMs: 60 * 1000,
    max: 1000, // Higher limit for webhooks
    skipSuccessfulRequests: true
  }
};
```

## 7. Integration Specifications

### 7.1 Authorize.Net SDK Configuration
```typescript
interface AuthorizeNetConfig {
  apiLoginId: string;
  transactionKey: string;
  environment: 'sandbox' | 'production';
  timeout: number; // 30 seconds
  retryAttempts: number; // 3 attempts
  retryDelay: number; // 1000ms base delay
}
```

### 7.2 Webhook Signature Verification
```typescript
function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha512', secret)
    .update(payload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}
```

## 8. Performance & Scalability

### 8.1 Performance Targets
- **API Response Time**: <500ms (95th percentile)
- **Database Query Time**: <100ms (95th percentile)
- **Webhook Processing**: <30 seconds end-to-end
- **Throughput**: 1000+ transactions per minute

### 8.2 Caching Strategy
```typescript
interface CacheConfig {
  redis: {
    host: string;
    port: number;
    ttl: {
      paymentTokens: 3600, // 1 hour
      customerData: 1800,  // 30 minutes
      subscriptionPlans: 86400 // 24 hours
    }
  };
}
```

### 8.3 Connection Pooling
```typescript
const dbConfig = {
  type: 'postgres',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  pool: {
    min: 5,
    max: 20,
    acquireTimeoutMillis: 30000,
    idleTimeoutMillis: 30000
  }
};
```

## 9. Testing Specifications

### 9.1 Unit Testing Requirements
- **Coverage Target**: ≥80%
- **Test Framework**: Jest with TypeScript
- **Mock Strategy**: Mock external dependencies (Authorize.Net API, database)

### 9.2 Test Structure
```typescript
describe('PaymentService', () => {
  describe('processPurchase', () => {
    it('should successfully process a valid purchase', async () => {
      // Test implementation
    });
    
    it('should handle declined cards gracefully', async () => {
      // Test implementation
    });
    
    it('should prevent duplicate transactions', async () => {
      // Test implementation
    });
  });
});
```

### 9.3 Integration Testing
- **Sandbox Integration**: Full end-to-end testing with Authorize.Net Sandbox
- **Database Testing**: Test with actual database transactions
- **Webhook Testing**: Simulate webhook events and verify processing

## 10. Monitoring & Observability

### 10.1 Metrics Collection
```typescript
interface Metrics {
  counters: {
    'payments.total': number;
    'payments.success': number;
    'payments.failed': number;
    'webhooks.received': number;
    'webhooks.processed': number;
  };
  
  histograms: {
    'api.response_time': number[];
    'db.query_time': number[];
    'payment.processing_time': number[];
  };
  
  gauges: {
    'active_connections': number;
    'queue_size': number;
    'memory_usage': number;
  };
}
```

### 10.2 Health Check Endpoint
```typescript
GET /api/v1/health

Response:
{
  "status": "healthy" | "degraded" | "unhealthy",
  "timestamp": string,
  "version": string,
  "dependencies": {
    "database": "healthy" | "unhealthy",
    "redis": "healthy" | "unhealthy",
    "authorize_net": "healthy" | "unhealthy"
  },
  "metrics": {
    "uptime": number,
    "memory_usage": number,
    "active_connections": number
  }
}
```

## 11. Deployment & Infrastructure

### 11.1 Environment Configuration
```typescript
interface EnvironmentConfig {
  NODE_ENV: 'development' | 'staging' | 'production';
  PORT: number;
  
  // Database
  DB_HOST: string;
  DB_PORT: number;
  DB_NAME: string;
  DB_USER: string;
  DB_PASSWORD: string;
  
  // Redis
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  
  // Authorize.Net
  ANET_API_LOGIN_ID: string;
  ANET_TRANSACTION_KEY: string;
  ANET_ENVIRONMENT: 'sandbox' | 'production';
  
  // Security
  API_SECRET_KEY: string;
  WEBHOOK_SECRET: string;
  ENCRYPTION_KEY: string;
  
  // Monitoring
  LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
  METRICS_PORT: number;
}
```

### 11.2 Docker Configuration
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY dist/ ./dist/
COPY migrations/ ./migrations/

EXPOSE 3000 9090

CMD ["node", "dist/server.js"]
```

### 11.3 Database Migrations
```typescript
// Migration structure using TypeORM
export class CreateTransactionsTable1694123456789 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Migration up logic
  }
  
  public async down(queryRunner: QueryRunner): Promise<void> {
    // Migration down logic
  }
}
```

## 12. Development Workflow

### 12.1 Project Structure
```
src/
├── controllers/          # HTTP request handlers
├── services/            # Business logic layer
├── repositories/        # Data access layer
├── models/             # TypeORM entities
├── middleware/         # Express middleware
├── utils/              # Utility functions
├── config/             # Configuration files
├── types/              # TypeScript type definitions
└── tests/              # Test files

migrations/             # Database migrations
docs/                  # API documentation
scripts/               # Build and deployment scripts
```

### 12.2 Code Quality Standards
- **ESLint**: Enforce coding standards
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit checks
- **TypeScript**: Strict mode enabled
- **SonarQube**: Code quality analysis

### 12.3 CI/CD Pipeline
1. **Code Commit**: Trigger automated pipeline
2. **Linting & Formatting**: ESLint and Prettier checks
3. **Unit Tests**: Jest test execution with coverage
4. **Integration Tests**: Database and API tests
5. **Security Scan**: Dependency vulnerability check
6. **Build**: TypeScript compilation and Docker image
7. **Deploy**: Automated deployment to staging/production

---

**Document Version**: 1.0  
**Last Updated**: September 7, 2025  
**Next Review**: October 7, 2025
