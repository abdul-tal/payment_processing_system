# Project Structure

This document explains the organization and purpose of each folder and key module in the Payment Backend Service project.

## 📁 Root Directory Structure

```
payment-backend/
├── src/                          # Main application source code
├── tests/                        # Test files and test utilities
├── migrations/                   # Database migration files
├── docs/                         # Additional documentation
├── scripts/                      # Build and deployment scripts
├── logs/                         # Application log files (created at runtime)
├── tasks/                        # Project task breakdown files
├── docker-compose.yml            # Docker services configuration
├── Dockerfile                    # Application container definition
├── package.json                  # Node.js dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── .env.example                  # Environment variables template
├── .gitignore                    # Git ignore patterns
├── .eslintrc.js                  # ESLint configuration
├── .prettierrc                   # Prettier configuration
├── jest.config.js                # Jest testing configuration
└── README.md                     # Project overview and setup guide
```

## 📂 Source Code Structure (`src/`)

### Core Application Layers

```
src/
├── controllers/                  # HTTP request handlers (Presentation Layer)
│   ├── payment.controller.ts     # Payment operations endpoints
│   ├── subscription.controller.ts # Subscription management endpoints
│   ├── webhook.controller.ts     # Webhook event handlers
│   └── health.controller.ts      # Health check and metrics endpoints
├── services/                     # Business logic layer
│   ├── payment.service.ts        # Core payment processing logic
│   ├── subscription.service.ts   # Subscription management logic
│   ├── webhook.service.ts        # Webhook event processing
│   ├── authorize-net.service.ts  # Authorize.Net API integration
│   ├── encryption.service.ts     # Data encryption/decryption
│   └── audit.service.ts          # Audit logging service
├── repositories/                 # Data access layer
│   ├── transaction.repository.ts # Transaction data operations
│   ├── subscription.repository.ts # Subscription data operations
│   ├── webhook-event.repository.ts # Webhook event data operations
│   └── audit-log.repository.ts   # Audit log data operations
├── models/                       # TypeORM entities and database models
│   ├── transaction.entity.ts     # Transaction database entity
│   ├── subscription.entity.ts    # Subscription database entity
│   ├── webhook-event.entity.ts   # Webhook event database entity
│   └── audit-log.entity.ts       # Audit log database entity
├── middleware/                   # Express middleware functions
│   ├── auth.middleware.ts        # API key authentication
│   ├── validation.middleware.ts  # Request validation using Joi
│   ├── correlation.middleware.ts # Correlation ID generation/tracking
│   ├── rate-limit.middleware.ts  # Rate limiting configuration
│   ├── error.middleware.ts       # Global error handling
│   └── logging.middleware.ts     # Request/response logging
├── utils/                        # Utility functions and helpers
│   ├── logger.ts                 # Winston logging configuration
│   ├── crypto.ts                 # Cryptographic utilities
│   ├── validators.ts             # Custom validation functions
│   ├── constants.ts              # Application constants
│   └── helpers.ts                # General helper functions
├── config/                       # Configuration management
│   ├── database.ts               # TypeORM database configuration
│   ├── redis.ts                  # Redis connection configuration
│   ├── authorize-net.ts          # Authorize.Net SDK configuration
│   ├── environment.ts            # Environment variable validation
│   └── app.ts                    # Express app configuration
├── types/                        # TypeScript type definitions
│   ├── payment.types.ts          # Payment-related type definitions
│   ├── subscription.types.ts     # Subscription-related types
│   ├── webhook.types.ts          # Webhook event types
│   ├── api.types.ts              # API request/response types
│   └── common.types.ts           # Shared type definitions
├── queues/                       # Queue processing system
│   ├── webhook.queue.ts          # Webhook event queue configuration
│   ├── subscription.queue.ts     # Subscription billing queue
│   └── processors/               # Queue job processors
│       ├── webhook.processor.ts  # Webhook event processor
│       └── billing.processor.ts  # Subscription billing processor
├── routes/                       # API route definitions
│   ├── index.ts                  # Main route aggregator
│   ├── payment.routes.ts         # Payment endpoint routes
│   ├── subscription.routes.ts    # Subscription endpoint routes
│   ├── webhook.routes.ts         # Webhook endpoint routes
│   └── system.routes.ts          # Health and metrics routes
├── app.ts                        # Express application setup
└── server.ts                     # Application entry point
```

## 🧪 Test Structure (`tests/`)

```
tests/
├── unit/                         # Unit tests for individual components
│   ├── services/                 # Service layer unit tests
│   ├── repositories/             # Repository layer unit tests
│   ├── utils/                    # Utility function tests
│   └── middleware/               # Middleware unit tests
├── integration/                  # Integration tests
│   ├── api/                      # API endpoint integration tests
│   ├── database/                 # Database integration tests
│   └── external/                 # External service integration tests
├── e2e/                          # End-to-end tests
│   ├── payment-flows.test.ts     # Complete payment workflow tests
│   └── subscription-flows.test.ts # Subscription workflow tests
├── fixtures/                     # Test data and fixtures
│   ├── payments.json             # Sample payment data
│   ├── subscriptions.json        # Sample subscription data
│   └── webhooks.json             # Sample webhook payloads
├── mocks/                        # Mock implementations
│   ├── authorize-net.mock.ts     # Authorize.Net API mocks
│   └── database.mock.ts          # Database operation mocks
└── setup/                        # Test setup and teardown
    ├── database.setup.ts         # Test database configuration
    └── global.setup.ts           # Global test configuration
```

## 🗄️ Database Migrations (`migrations/`)

```
migrations/
├── 001_create_transactions_table.ts      # Initial transaction table
├── 002_create_subscriptions_table.ts     # Subscription management table
├── 003_create_webhook_events_table.ts    # Webhook event tracking
├── 004_create_audit_logs_table.ts        # Audit logging table
├── 005_add_indexes_performance.ts        # Performance optimization indexes
└── 006_add_encryption_fields.ts          # Encrypted field additions
```

## 📜 Scripts (`scripts/`)

```
scripts/
├── build.sh                     # Application build script
├── deploy.sh                    # Deployment automation
├── migrate.sh                   # Database migration runner
├── seed.sh                      # Database seeding script
├── test.sh                      # Test execution script
└── cleanup.sh                   # Development cleanup script
```

## 📋 Tasks (`tasks/`)

```
tasks/
├── 001-project-setup.md         # Project initialization and setup
├── 002-database-setup.md        # Database configuration and migrations
├── 003-express-server-setup.md  # Express server and middleware setup
├── 004-authorize-net-integration.md # Payment gateway integration
├── 005-payment-endpoints.md     # Core payment API endpoints
├── 006-subscription-management.md # Recurring billing system
├── 007-webhook-system.md        # Webhook processing implementation
├── 008-distributed-tracing.md   # Tracing and correlation IDs
├── 009-security-implementation.md # Security and PCI compliance
├── 010-monitoring-observability.md # Monitoring and metrics
├── 011-testing-implementation.md # Comprehensive testing suite
└── 012-containerization-deployment.md # Docker and deployment
```

## 🔧 Key Module Purposes

### Controllers Layer
- **Purpose**: Handle HTTP requests and responses
- **Responsibilities**: 
  - Request validation and parsing
  - Response formatting
  - Error handling delegation
  - Route-specific logic coordination

### Services Layer
- **Purpose**: Implement business logic and orchestration
- **Responsibilities**:
  - Payment processing workflows
  - Business rule enforcement
  - External API integration
  - Transaction state management
  - Subscription lifecycle management

### Repositories Layer
- **Purpose**: Data access abstraction
- **Responsibilities**:
  - Database query operations
  - Data transformation
  - Connection management
  - Query optimization

### Models Layer
- **Purpose**: Define data structure and relationships
- **Responsibilities**:
  - Database entity definitions
  - Relationship mapping
  - Data validation rules
  - Migration support

### Middleware Layer
- **Purpose**: Cross-cutting concerns and request processing
- **Responsibilities**:
  - Authentication and authorization
  - Request/response logging
  - Error handling
  - Rate limiting
  - Correlation ID management

### Utils Layer
- **Purpose**: Shared utilities and helper functions
- **Responsibilities**:
  - Logging configuration
  - Cryptographic operations
  - Validation utilities
  - Common helper functions

### Config Layer
- **Purpose**: Application configuration management
- **Responsibilities**:
  - Environment variable handling
  - Database connection setup
  - External service configuration
  - Application settings

### Types Layer
- **Purpose**: TypeScript type safety and documentation
- **Responsibilities**:
  - Interface definitions
  - Type unions and enums
  - API contract definitions
  - Shared type utilities

### Queues Layer
- **Purpose**: Asynchronous job processing
- **Responsibilities**:
  - Webhook event processing
  - Subscription billing automation
  - Failed job retry logic
  - Queue monitoring

## 📊 Data Flow Architecture

```
HTTP Request
    ↓
Middleware Stack (Auth, Validation, Logging)
    ↓
Controller (Request Handling)
    ↓
Service Layer (Business Logic)
    ↓
Repository Layer (Data Access)
    ↓
Database/External APIs
    ↓
Response Processing
    ↓
HTTP Response
```

## 🔄 Queue Processing Flow

```
Webhook Event → Queue → Processor → Database Update → Notification
Subscription Billing → Queue → Processor → Payment API → Database Update
```

## 🏗️ Architectural Patterns

### Layered Architecture
- **Presentation Layer**: Controllers and Routes
- **Business Layer**: Services and Business Logic
- **Data Access Layer**: Repositories and Models
- **Infrastructure Layer**: Configuration and Utilities

### Dependency Injection
- Services injected into controllers
- Repositories injected into services
- Configuration injected where needed

### Repository Pattern
- Abstract data access operations
- Testable data layer
- Database technology independence

### Queue Pattern
- Asynchronous processing
- Scalable event handling
- Retry mechanisms for failed jobs

## 🔒 Security Considerations

### Sensitive Data Handling
- Encryption services for PII data
- Secure configuration management
- API key rotation capabilities
- Audit trail for all operations

### Input Validation
- Joi schema validation
- SQL injection prevention
- XSS protection
- Rate limiting implementation

## 📈 Scalability Features

### Horizontal Scaling
- Stateless application design
- Database connection pooling
- Queue-based processing
- Load balancer compatibility

### Performance Optimization
- Database indexing strategy
- Caching layer (Redis)
- Async processing for heavy operations
- Connection pooling

---

This structure promotes maintainability, testability, and scalability while following Node.js and TypeScript best practices for enterprise applications.
