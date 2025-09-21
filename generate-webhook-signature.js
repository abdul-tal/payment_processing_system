const crypto = require('crypto');

// Your webhook payload (exactly as it will be sent)
const payload = JSON.stringify({
  "notificationId": "12345678-1234-1234-1234-123456789012",
  "eventType": "net.authorize.payment.authcapture.created",
  "eventDate": "2025-01-18T21:37:00.000Z",
  "webhookId": "webhook-123",
  "id": "event-12345",
  "payload": {
    "responseCode": 1,
    "authCode": "ABC123",
    "avsResponse": "Y",
    "transId": "40012345678",
    "refTransId": "",
    "transHash": "hash123",
    "testRequest": "false",
    "accountNumber": "XXXX1234",
    "accountType": "Visa",
    "requestedAmount": "25.00",
    "authAmount": "25.00",
    "settleAmount": "25.00"
  }
});

// Use the actual webhook secret from your .env file
const webhookSecret = process.env.WEBHOOK_SECRET || 'E2B8E654D40C0037CFFBC76A025C06930F8A9D3478EBC0CC01CDD4A48A6D56481264A38CF7E4E4E41E4C35381F4021940A87F8DEF599448A6ECFD4560F71968D';

// Generate HMAC-SHA512 signature
const signature = crypto
  .createHmac('sha512', webhookSecret)
  .update(payload)
  .digest('hex');

console.log('Webhook Secret:', webhookSecret);
console.log('Payload:', payload);
console.log('Generated Signature:', `sha512=${signature}`);
console.log('\nCurl command with correct signature:');
console.log(`curl --location 'http://localhost:3000/api/v1/webhooks/authorize-net' \\
--header 'Content-Type: application/json' \\
--header 'X-ANET-Signature: sha512=${signature}' \\
--data '${payload}'`);
