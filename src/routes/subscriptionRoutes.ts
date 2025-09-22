import { Router } from 'express';
import { SubscriptionController } from '../controllers/subscriptionController';
import { correlationIdMiddleware } from '../middleware/correlationId';
import { idempotencyMiddleware } from '../middleware/idempotency';

const router = Router();
const subscriptionController = new SubscriptionController();

// Apply correlation ID middleware to all routes
router.use(correlationIdMiddleware);

// POST /api/v1/subscriptions - Create new subscription
router.post(
  '/',
  idempotencyMiddleware,
  subscriptionController.createSubscription.bind(subscriptionController)
);

// GET /api/v1/subscriptions/customer/:email - Get subscriptions by customer email (must be before /:id)
router.get(
  '/customer/:email',
  subscriptionController.getSubscriptionsByCustomer.bind(subscriptionController)
);

// GET /api/v1/subscriptions/:id - Get subscription by ID
router.get(
  '/:id',
  subscriptionController.getSubscription.bind(subscriptionController)
);

// PUT /api/v1/subscriptions/:id - Update subscription
router.put(
  '/:id',
  subscriptionController.updateSubscription.bind(subscriptionController)
);

// DELETE /api/v1/subscriptions/:id - Cancel subscription
router.delete(
  '/:id',
  subscriptionController.cancelSubscription.bind(subscriptionController)
);

export { router as subscriptionRoutes };
