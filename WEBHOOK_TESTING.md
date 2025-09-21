# Webhook Testing Guide

## Overview
This guide shows how to test the Authorize.Net webhook integration with your payment processing system.

## Prerequisites
- Server running on port 3000 (npm start)
- Worker running (npm run worker)
- Redis running
- PostgreSQL running

## Testing Endpoints

### 1. Health Check
```bash
curl -X GET http://localhost:3000/api/v1/webhooks/health
```

### 2. Webhook Receiver (Main Endpoint)
```bash
curl -X POST http://localhost:3000/api/v1/webhooks/authorize-net \
  -H "Content-Type: application/json" \
  -H "X-ANET-Signature: sha512=YOUR_SIGNATURE_HERE" \
  -d '{
    "notificationId": "test-notification-123",
    "eventType": "net.authorize.payment.authcapture.created",
    "eventDate": "2025-09-18T14:30:00.000Z",
    "webhookId": "webhook-test-456",
    "payload": {
      "responseCode": 1,
      "authCode": "ABC123",
      "avsResultCode": "Y",
      "cvvResultCode": "P",
      "cavvResultCode": "2",
      "transId": "12345678901",
      "refTransID": "",
      "transHash": "hash123",
      "testRequest": "0",
      "accountNumber": "XXXX1234",
      "entryMode": "Keyed",
      "accountType": "Visa",
      "splitTenderId": "",
      "prePaidCard": {
        "requestedAmount": "0.00",
        "approvedAmount": "0.00",
        "balanceOnCard": "0.00"
      },
      "authAmount": "100.00",
      "settleAmount": "100.00",
      "taxExempt": "false",
      "payment": {
        "creditCard": {
          "cardNumber": "XXXX1234",
          "expirationDate": "XXXX",
          "cardType": "Visa"
        }
      },
      "customer": {
        "type": "individual",
        "id": "customer123",
        "email": "test@example.com"
      },
      "billTo": {
        "firstName": "John",
        "lastName": "Doe",
        "company": "",
        "address": "123 Main St",
        "city": "Anytown",
        "state": "CA",
        "zip": "12345",
        "country": "US"
      },
      "shipTo": {
        "firstName": "John",
        "lastName": "Doe",
        "company": "",
        "address": "123 Main St",
        "city": "Anytown",
        "state": "CA",
        "zip": "12345",
        "country": "US"
      },
      "recurringBilling": "false",
      "customerIP": "192.168.1.1",
      "product": "Card Not Present",
      "marketType": "eCommerce"
    }
  }'
```

### 3. Event Status Check
```bash
# Replace {eventId} with actual event ID from webhook response
curl -X GET http://localhost:3000/api/v1/webhooks/events/{eventId}
```

### 4. List Events
```bash
# Get all events
curl -X GET http://localhost:3000/api/v1/webhooks/events

# With filters
curl -X GET "http://localhost:3000/api/v1/webhooks/events?status=processed&eventType=net.authorize.payment.authcapture.created&limit=10&offset=0"
```

## Sample Webhook Payloads

### Payment Authorization Created
```json
{
  "notificationId": "auth-notification-123",
  "eventType": "net.authorize.payment.authorization.created",
  "eventDate": "2025-09-18T14:30:00.000Z",
  "webhookId": "webhook-auth-456",
  "payload": {
    "responseCode": 1,
    "authCode": "AUTH123",
    "transId": "98765432101",
    "authAmount": "50.00",
    "payment": {
      "creditCard": {
        "cardNumber": "XXXX5555",
        "expirationDate": "XXXX",
        "cardType": "MasterCard"
      }
    },
    "customer": {
      "id": "customer456",
      "email": "customer@example.com"
    }
  }
}
```

### Subscription Created
```json
{
  "notificationId": "sub-notification-789",
  "eventType": "net.authorize.customer.subscription.created",
  "eventDate": "2025-09-18T14:30:00.000Z",
  "webhookId": "webhook-sub-101",
  "payload": {
    "subscriptionId": "sub_123456",
    "status": "active",
    "profile": {
      "customerProfileId": "profile_789",
      "customerPaymentProfileId": "payment_101",
      "customerShippingAddressId": "shipping_202"
    },
    "subscription": {
      "name": "Monthly Service",
      "paymentSchedule": {
        "interval": {
          "length": 1,
          "unit": "months"
        },
        "startDate": "2025-09-18",
        "totalOccurrences": 12
      },
      "amount": "29.99",
      "trialAmount": "0.00"
    }
  }
}
```

### Refund Created
```json
{
  "notificationId": "refund-notification-456",
  "eventType": "net.authorize.payment.refund.created",
  "eventDate": "2025-09-18T14:30:00.000Z",
  "webhookId": "webhook-refund-789",
  "payload": {
    "responseCode": 1,
    "authCode": "REFUND123",
    "transId": "11223344556",
    "refTransID": "12345678901",
    "settleAmount": "25.00",
    "payment": {
      "creditCard": {
        "cardNumber": "XXXX1234",
        "expirationDate": "XXXX",
        "cardType": "Visa"
      }
    }
  }
}
```

## Testing Without Signature (Development)

For development testing without proper HMAC signatures, you can temporarily disable signature verification by setting:

```bash
export WEBHOOK_SIGNATURE_VERIFICATION=false
```

Then restart your server.

## Testing with Proper Signatures

To test with proper HMAC-SHA512 signatures:

1. Set your webhook signature key:
```bash
export AUTHORIZE_NET_WEBHOOK_SIGNATURE_KEY="your_signature_key_here"
```

2. Generate the signature using the webhook payload and your signature key:
```javascript
const crypto = require('crypto');
const payload = JSON.stringify(webhookPayload);
const signature = crypto.createHmac('sha512', process.env.AUTHORIZE_NET_WEBHOOK_SIGNATURE_KEY)
  .update(payload, 'utf8')
  .digest('hex');
const headerValue = `sha512=${signature}`;
```

3. Include the signature in the `X-ANET-Signature` header.

## Monitoring Webhook Processing

### Check Worker Logs
The worker logs webhook processing status every minute. Look for:
- Queue health information
- Event processing status
- Error messages

### Check Database
```sql
-- Check webhook events
SELECT * FROM webhook_events ORDER BY created_at DESC LIMIT 10;

-- Check processing status
SELECT status, COUNT(*) FROM webhook_events GROUP BY status;

-- Check recent transactions
SELECT * FROM transactions WHERE created_at > NOW() - INTERVAL '1 hour';
```

### Check Redis Queue
If you have Redis CLI access:
```bash
redis-cli
> KEYS webhook:*
> LLEN webhook:queue
> LLEN webhook:failed
```

## Expected Flow

1. **Webhook Received**: POST to `/api/v1/webhooks/authorize-net`
2. **Signature Verified**: HMAC-SHA512 validation
3. **Event Stored**: Saved to `webhook_events` table with PENDING status
4. **Queued for Processing**: Added to Redis queue
5. **Worker Processes**: Event status changes to PROCESSING
6. **Business Logic**: Updates transactions/subscriptions based on event type
7. **Completion**: Event status changes to PROCESSED or FAILED

## Troubleshooting

- **Signature Verification Fails**: Check your signature key and payload format
- **Worker Not Processing**: Check Redis connection and worker logs
- **Database Errors**: Verify PostgreSQL connection and table structure
- **Queue Issues**: Check Redis memory and connection limits
