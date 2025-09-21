import { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { logger } from '../config/logger';

export interface WebhookRequest extends Request {
  rawBody?: Buffer;
}

/**
 * Middleware to verify Authorize.Net webhook signatures using HMAC-SHA512
 * Authorize.Net sends the signature in the 'X-ANET-Signature' header
 */
export const verifyWebhookSignature = (
  req: WebhookRequest,
  res: Response,
  next: NextFunction
): void => {
  try {
    const webhookSecret = process.env['WEBHOOK_SECRET'];
    console.log('in verifyWebhookSignature...');
    if (!webhookSecret) {
      logger.error('WEBHOOK_SECRET environment variable is not set');
      res.status(500).json({
        error: 'Webhook signature verification not configured',
      });
      return;
    }

    // Get the signature from the header
    const receivedSignature = req.get('X-ANET-Signature');

    if (!receivedSignature) {
      logger.warn('Webhook received without signature header');
      res.status(401).json({
        error: 'Missing webhook signature',
      });
      return;
    }

    // Get the raw body (should be set by raw body parser middleware)
    const rawBody = req.rawBody;

    if (!rawBody) {
      logger.error('Raw body not available for signature verification');
      res.status(400).json({
        error: 'Invalid request body for signature verification',
      });
      return;
    }

    // Parse the signature header format: "sha512=<hash>"
    const signatureParts = receivedSignature.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha512') {
      logger.warn('Invalid signature format received', {
        signature: receivedSignature,
      });
      res.status(401).json({
        error: 'Invalid signature format',
      });
      return;
    }

    const receivedHash = signatureParts[1];

    // Calculate the expected signature
    const expectedSignature = createHmac('sha512', webhookSecret)
      .update(rawBody)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const receivedHashBuffer = Buffer.from(receivedHash || '', 'hex');
    const expectedHashBuffer = Buffer.from(expectedSignature, 'hex');

    if (receivedHashBuffer.length !== expectedHashBuffer.length) {
      logger.warn('Signature length mismatch', {
        received: receivedHashBuffer.length,
        expected: expectedHashBuffer.length,
      });
      res.status(401).json({
        error: 'Invalid webhook signature',
      });
      return;
    }

    const isValid = timingSafeEqual(receivedHashBuffer, expectedHashBuffer);

    if (!isValid) {
      logger.warn('Webhook signature verification failed', {
        receivedSignature,
        expectedSignature: `sha512=${expectedSignature}`,
      });
      res.status(401).json({
        error: 'Invalid webhook signature',
      });
      return;
    }

    logger.debug('Webhook signature verified successfully');
    next();
  } catch (error) {
    logger.error('Error during webhook signature verification:', error);
    res.status(500).json({
      error: 'Webhook signature verification failed',
    });
  }
};

/**
 * Middleware to capture raw body for signature verification
 * This should be used before any JSON parsing middleware
 */
export const captureRawBody = (
  req: WebhookRequest,
  res: Response,
  next: NextFunction
): void => {
  console.log('in captureRawBody...');
  // With express.raw(), the body is already available as req.body (Buffer)
  if (req.body && Buffer.isBuffer(req.body)) {
    req.rawBody = req.body;
    next();
  } else {
    logger.error('Raw body not available or not a Buffer');
    res.status(400).json({ error: 'Invalid request body' });
  }
};
