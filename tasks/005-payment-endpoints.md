# Task 005: Core Payment API Endpoints

## Overview
Implement REST API endpoints for core payment operations including purchase, authorize, capture, and refund.

## Objectives
- Implement POST /api/v1/payments/purchase endpoint
- Implement POST /api/v1/payments/authorize endpoint
- Implement POST /api/v1/payments/capture endpoint
- Implement POST /api/v1/payments/refund endpoint
- Implement POST /api/v1/payments/cancel endpoint
- Add request validation for all endpoints
- Implement idempotency handling

## Deliverables
- Payment controller with all endpoint handlers
- Request/response DTOs and validation schemas
- Idempotency key handling middleware
- Transaction state management
- Integration with payment service layer
- API endpoint tests

## Acceptance Criteria
- [ ] All payment endpoints respond correctly
- [ ] Request validation prevents invalid data
- [ ] Idempotency keys prevent duplicate transactions
- [ ] Proper HTTP status codes are returned
- [ ] Error responses follow standard format
- [ ] All endpoints are covered by tests

## Dependencies
- Task 003 (Express Server Setup)
- Task 004 (Authorize.Net Integration)

## Estimated Time
5-6 hours
