#!/usr/bin/env node

const crypto = require('crypto');
const https = require('https');
const http = require('http');

// Configuration
const SERVER_URL = 'http://localhost:3000';
const WEBHOOK_ENDPOINT = '/api/webhooks/authorize-net';
const SIGNATURE_KEY = process.env.AUTHORIZE_NET_WEBHOOK_SIGNATURE_KEY || 'test-key-123';

// Sample webhook payload
const samplePayload = {
  notificationId: `test-notification-${Date.now()}`,
  eventType: "net.authorize.payment.authcapture.created",
  eventDate: new Date().toISOString(),
  webhookId: `webhook-test-${Date.now()}`,
  payload: {
    responseCode: 1,
    authCode: "ABC123",
    avsResultCode: "Y",
    cvvResultCode: "P",
    transId: `${Math.floor(Math.random() * 1000000000)}`,
    refTransID: "",
    transHash: "hash123",
    testRequest: "0",
    accountNumber: "XXXX1234",
    entryMode: "Keyed",
    accountType: "Visa",
    authAmount: "100.00",
    settleAmount: "100.00",
    taxExempt: "false",
    payment: {
      creditCard: {
        cardNumber: "XXXX1234",
        expirationDate: "XXXX",
        cardType: "Visa"
      }
    },
    customer: {
      type: "individual",
      id: `customer-${Date.now()}`,
      email: "test@example.com"
    },
    billTo: {
      firstName: "John",
      lastName: "Doe",
      address: "123 Main St",
      city: "Anytown",
      state: "CA",
      zip: "12345",
      country: "US"
    },
    recurringBilling: "false",
    customerIP: "192.168.1.1",
    product: "Card Not Present",
    marketType: "eCommerce"
  }
};

function generateSignature(payload, key) {
  const payloadString = JSON.stringify(payload);
  const signature = crypto
    .createHmac('sha512', key)
    .update(payloadString, 'utf8')
    .digest('hex');
  return `sha512=${signature}`;
}

function sendWebhook(payload, withSignature = true) {
  return new Promise((resolve, reject) => {
    const payloadString = JSON.stringify(payload);
    const signature = withSignature ? generateSignature(payload, SIGNATURE_KEY) : '';
    
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: WEBHOOK_ENDPOINT,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payloadString),
        ...(withSignature && { 'X-ANET-Signature': signature })
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(payloadString);
    req.end();
  });
}

async function testWebhookHealth() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/webhooks/health',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function testWebhookEvents() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: '/api/webhooks/events?limit=5',
      method: 'GET'
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          body: data
        });
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function runTests() {
  console.log('🚀 Starting Webhook Tests...\n');

  try {
    // Test 1: Health Check
    console.log('1️⃣ Testing webhook health endpoint...');
    const healthResponse = await testWebhookHealth();
    console.log(`   Status: ${healthResponse.statusCode}`);
    console.log(`   Response: ${healthResponse.body}\n`);

    // Test 2: Send webhook with signature
    console.log('2️⃣ Testing webhook with valid signature...');
    const webhookResponse = await sendWebhook(samplePayload, true);
    console.log(`   Status: ${webhookResponse.statusCode}`);
    console.log(`   Response: ${webhookResponse.body}\n`);

    // Wait a moment for processing
    console.log('⏳ Waiting 2 seconds for event processing...\n');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Test 3: Check events
    console.log('3️⃣ Checking webhook events...');
    const eventsResponse = await testWebhookEvents();
    console.log(`   Status: ${eventsResponse.statusCode}`);
    console.log(`   Response: ${eventsResponse.body}\n`);

    // Test 4: Send webhook without signature (should fail if verification enabled)
    console.log('4️⃣ Testing webhook without signature...');
    const noSigResponse = await sendWebhook(samplePayload, false);
    console.log(`   Status: ${noSigResponse.statusCode}`);
    console.log(`   Response: ${noSigResponse.body}\n`);

    console.log('✅ All tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Webhook Testing Script

Usage:
  node test-webhook.js                 # Run all tests
  node test-webhook.js --health        # Test health endpoint only
  node test-webhook.js --send          # Send sample webhook only
  node test-webhook.js --events        # Check events only

Environment Variables:
  AUTHORIZE_NET_WEBHOOK_SIGNATURE_KEY  # Signature key for HMAC verification
  `);
  process.exit(0);
}

if (args.includes('--health')) {
  testWebhookHealth().then(res => {
    console.log('Health Check Result:');
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${res.body}`);
  }).catch(console.error);
} else if (args.includes('--send')) {
  sendWebhook(samplePayload, true).then(res => {
    console.log('Webhook Send Result:');
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${res.body}`);
  }).catch(console.error);
} else if (args.includes('--events')) {
  testWebhookEvents().then(res => {
    console.log('Events Check Result:');
    console.log(`Status: ${res.statusCode}`);
    console.log(`Response: ${res.body}`);
  }).catch(console.error);
} else {
  runTests();
}
