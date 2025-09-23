import { Router } from 'express';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { idempotencyMiddleware } from '../middleware/idempotency';
import { jwtAuth } from '../middleware/jwtAuth';
import { paymentController } from '../controllers/paymentController';
import {
  purchasePaymentSchema,
  authorizePaymentSchema,
  capturePaymentSchema,
  refundPaymentSchema,
  cancelPaymentSchema,
} from '../validation/paymentSchemas';

const router = Router();

// Apply JWT authentication to all routes
router.use(jwtAuth);

// Apply idempotency middleware to all routes
router.use(idempotencyMiddleware);

// POST /api/v1/payments/purchase - Process a purchase transaction (charge immediately)
router.post(
  '/purchase',
  validateRequest(purchasePaymentSchema),
  asyncHandler(paymentController.processPurchase.bind(paymentController))
);

// POST /api/v1/payments/authorize - Authorize a payment (hold funds without capturing)
router.post(
  '/authorize',
  validateRequest(authorizePaymentSchema),
  asyncHandler(paymentController.authorizePayment.bind(paymentController))
);

// POST /api/v1/payments/:transactionId/capture - Capture a previously authorized payment
router.post(
  '/:transactionId/capture',
  validateRequest(capturePaymentSchema),
  asyncHandler(paymentController.capturePayment.bind(paymentController))
);

// POST /api/v1/payments/:transactionId/refund - Refund a previously completed payment
router.post(
  '/:transactionId/refund',
  validateRequest(refundPaymentSchema),
  asyncHandler(paymentController.refundPayment.bind(paymentController))
);

// POST /api/v1/payments/:transactionId/cancel - Cancel (void) a previously authorized payment
router.post(
  '/:transactionId/cancel',
  validateRequest(cancelPaymentSchema),
  asyncHandler(paymentController.cancelPayment.bind(paymentController))
);

export default router;
