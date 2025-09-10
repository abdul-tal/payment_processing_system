# Payment Backend Service

A robust, production-ready payment backend service that integrates with Authorize.Net Sandbox API. This service handles core payment operations, recurring billing, webhook processing, and provides enterprise-grade features including distributed tracing, comprehensive monitoring, and PCI DSS compliance considerations.

## 🚀 Features

### Core Payment Operations
- **Purchase Transactions**: Single-step payment processing
- **Authorize + Capture**: Two-step payment flow with authorization holds
- **Refunds**: Full and partial refund capabilities
- **Transaction Cancellation**: Cancel authorized but uncaptured transactions

### Advanced Features
- **Recurring Billing**: Automated subscription management with multiple billing cycles
- **Webhook Processing**: Asynchronous event handling with queue-based processing
- **Idempotency**: Prevent duplicate transactions using idempotency keys
- **Distributed Tracing**: End-to-end request tracking with correlation IDs
- **Comprehensive Monitoring**: Health checks, metrics, and observability

### Security & Compliance
- **PCI DSS Considerations**: Secure payment data handling
- **Data Encryption**: AES-256 encryption for sensitive data
- **Rate Limiting**: API abuse prevention
- **Audit Logging**: Comprehensive transaction audit trail

## 🛠 Technology Stack

- **Runtime**: Node.js 18.x LTS with TypeScript 5.x
- **Framework**: Express.js with security middleware
- **Database**: PostgreSQL with TypeORM
- **Queue System**: Redis for webhook processing
- **Testing**: Jest with ≥80% coverage target
- **Monitoring**: Prometheus metrics, Winston logging
- **Containerization**: Docker with Docker Compose

## 📋 Prerequisites

Before setting up the project, ensure you have the following installed:

- **Node.js**: Version 18.x LTS or higher
- **npm**: Version 8.x or higher (or yarn)
- **PostgreSQL**: Version 14.x or higher
- **Redis**: Version 6.x or higher
- **Docker**: Version 20.x or higher (optional, for containerized setup)
- **Docker Compose**: Version 2.x or higher (optional)

## 🚀 Quick Start

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd payment-backend
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Application
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=payment_backend
DB_USER=postgres
DB_PASSWORD=your_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Authorize.Net (Sandbox)
ANET_API_LOGIN_ID=your_sandbox_login_id
ANET_TRANSACTION_KEY=your_sandbox_transaction_key
ANET_ENVIRONMENT=sandbox

# Security
API_SECRET_KEY=your-secret-key-here
WEBHOOK_SECRET=your-webhook-secret
ENCRYPTION_KEY=your-32-character-encryption-key

# Monitoring
LOG_LEVEL=info
METRICS_PORT=9090
```

### 3. Database Setup

#### Option A: Manual Database Setup

1. Create PostgreSQL database:
```sql
CREATE DATABASE payment_backend;
CREATE USER payment_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE payment_backend TO payment_user;
```

2. Run migrations:
```bash
npm run migration:run
```

#### Option B: Docker Setup (Recommended)

Start all services using Docker Compose:

```bash
docker-compose up -d
```

This will start:
- PostgreSQL database
- Redis server
- Application server
- Prometheus (metrics)
- Grafana (dashboards)

### 4. Start the Application

#### Development Mode
```bash
npm run dev
```

#### Production Mode
```bash
npm run build
npm start
```

### 5. Verify Installation

Check if the service is running:

```bash
curl http://localhost:3000/api/v1/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-09-08T02:39:55.000Z",
  "version": "1.0.0",
  "dependencies": {
    "database": "healthy",
    "redis": "healthy",
    "authorize_net": "healthy"
  }
}
```

## 📊 Monitoring and Observability

### Health Checks
- **Endpoint**: `GET /api/v1/health`
- **Metrics**: `GET /api/v1/metrics` (Prometheus format)

### Logging
Structured JSON logs are written to:
- Console (development)
- Files: `logs/app.log`, `logs/error.log` (production)

### Metrics Dashboard
Access Grafana dashboard at: http://localhost:3001 (Docker setup)
- Username: `admin`
- Password: `admin`

## 🧪 Testing

### Run All Tests
```bash
npm test
```

### Run Tests with Coverage
```bash
npm run test:coverage
```

### Run Integration Tests
```bash
npm run test:integration
```

### Run Specific Test Suite
```bash
npm test -- --testPathPattern=payment.service
```

## 🔧 Development Workflow

### Code Quality
```bash
# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:check
```

### Database Operations
```bash
# Create new migration
npm run migration:create -- -n MigrationName

# Run migrations
npm run migration:run

# Revert last migration
npm run migration:revert

# Show migration status
npm run migration:show
```

### Building
```bash
# Build TypeScript
npm run build

# Build Docker image
docker build -t payment-backend .
```

## 📚 API Documentation

### Base Configuration
- **Base URL**: `http://localhost:3000/api/v1`
- **Content-Type**: `application/json`
- **Authentication**: API Key in header (`X-API-Key`)

### Core Endpoints

#### Payment Operations
```bash
# Purchase Transaction
POST /api/v1/payments/purchase

# Authorize Transaction
POST /api/v1/payments/authorize

# Capture Transaction
POST /api/v1/payments/capture

# Refund Transaction
POST /api/v1/payments/refund

# Cancel Transaction
POST /api/v1/payments/cancel
```

#### Subscription Management
```bash
# Create Subscription
POST /api/v1/subscriptions

# Get Subscription
GET /api/v1/subscriptions/{id}

# Update Subscription
PUT /api/v1/subscriptions/{id}

# Cancel Subscription
DELETE /api/v1/subscriptions/{id}
```

#### System Endpoints
```bash
# Health Check
GET /api/v1/health

# Metrics (Prometheus)
GET /api/v1/metrics

# Webhook Endpoint
POST /api/v1/webhooks/authorize-net
```

For detailed API documentation, see [API-SPECIFICATION.yml](./API-SPECIFICATION.yml).

## 🔒 Security Considerations

### PCI DSS Compliance
- Never store full credit card numbers
- Use Authorize.Net tokenization for card references
- Encrypt sensitive data at rest using AES-256
- All communications use HTTPS/TLS 1.3

### API Security
- API key authentication required
- Rate limiting: 100 requests/minute for payment endpoints
- Input validation and sanitization
- Correlation IDs for request tracking

### Data Protection
- Sensitive fields encrypted in database
- Secure error handling (no sensitive data in responses)
- Comprehensive audit logging
- Regular security dependency updates

## 🚨 Troubleshooting

### Common Issues

#### Database Connection Failed
```bash
# Check PostgreSQL status
pg_isready -h localhost -p 5432

# Verify credentials in .env file
# Ensure database exists and user has permissions
```

#### Redis Connection Failed
```bash
# Check Redis status
redis-cli ping

# Should return: PONG
```

#### Authorize.Net API Errors
- Verify API credentials in `.env`
- Ensure using sandbox environment for development
- Check Authorize.Net developer documentation for error codes

#### Port Already in Use
```bash
# Find process using port 3000
lsof -i :3000

# Kill process if needed
kill -9 <PID>
```

### Logs and Debugging

#### View Application Logs
```bash
# Docker setup
docker-compose logs -f app

# Local setup
tail -f logs/app.log
```

#### Enable Debug Logging
Set `LOG_LEVEL=debug` in `.env` file and restart the application.

## 📖 Additional Documentation

- [Project Structure](./PROJECT_STRUCTURE.md) - Detailed project organization
- [Architecture](./Architecture.md) - System architecture and design decisions
- [Observability](./OBSERVABILITY.md) - Monitoring and logging strategy
- [API Specification](./API-SPECIFICATION.yml) - Complete API documentation

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/new-feature`
3. Make changes and add tests
4. Ensure all tests pass: `npm test`
5. Run linting: `npm run lint`
6. Commit changes: `git commit -am 'Add new feature'`
7. Push to branch: `git push origin feature/new-feature`
8. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For questions or issues:
- Create an issue in the repository
- Check the troubleshooting section above
- Review the additional documentation files

---

**Version**: 1.0.0  
**Last Updated**: September 8, 2025
