import { Router, Request, Response } from 'express';
import Joi from 'joi';
import { validateRequest } from '../middleware/validation';
import { asyncHandler } from '../middleware/errorHandler';
import { logger } from '../config/logger';
import {
  paymentService,
  TransactionRequest,
  AuthorizeRequest,
  CaptureRequest,
} from '../services/paymentService';

const router = Router();

// Validation schemas
const createPaymentSchema = {
  body: Joi.object({
    amount: Joi.number().positive().precision(2).required(),
    currency: Joi.string().length(3).uppercase().default('USD'),
    description: Joi.string().max(255).optional(),
    customerEmail: Joi.string().email().required(),
    customerName: Joi.string().max(100).required(),
    invoiceNumber: Joi.string().max(20).optional(),
    paymentMethod: Joi.object({
      type: Joi.string().valid('credit_card').required(),
      cardNumber: Joi.string().creditCard().required(),
      expirationDate: Joi.string()
        .pattern(/^\d{4}$/)
        .required(), // MMYY format
      cardCode: Joi.string()
        .pattern(/^\d{3,4}$/)
        .required(),
      cardholderName: Joi.string().max(100).optional(),
    }).required(),
    billingAddress: Joi.object({
      firstName: Joi.string().max(50).required(),
      lastName: Joi.string().max(50).required(),
      company: Joi.string().max(50).optional(),
      address: Joi.string().max(100).required(),
      city: Joi.string().max(50).required(),
      state: Joi.string().max(50).required(),
      zip: Joi.string().max(10).required(),
      country: Joi.string().length(2).uppercase().default('US'),
    }).required(),
  }),
};

const authorizePaymentSchema = {
  body: Joi.object({
    amount: Joi.number().positive().precision(2).required(),
    currency: Joi.string().length(3).uppercase().default('USD'),
    description: Joi.string().max(255).optional(),
    customerEmail: Joi.string().email().required(),
    customerName: Joi.string().max(100).required(),
    invoiceNumber: Joi.string().max(20).optional(),
    paymentMethod: Joi.object({
      type: Joi.string().valid('credit_card').required(),
      cardNumber: Joi.string().creditCard().required(),
      expirationDate: Joi.string()
        .pattern(/^\d{4}$/)
        .required(),
      cardCode: Joi.string()
        .pattern(/^\d{3,4}$/)
        .required(),
      cardholderName: Joi.string().max(100).optional(),
    }).required(),
    billingAddress: Joi.object({
      firstName: Joi.string().max(50).required(),
      lastName: Joi.string().max(50).required(),
      company: Joi.string().max(50).optional(),
      address: Joi.string().max(100).required(),
      city: Joi.string().max(50).required(),
      state: Joi.string().max(50).required(),
      zip: Joi.string().max(10).required(),
      country: Joi.string().length(2).uppercase().default('US'),
    }).required(),
  }),
};

const capturePaymentSchema = {
  params: Joi.object({
    transactionId: Joi.string().required(),
  }),
  body: Joi.object({
    amount: Joi.number().positive().precision(2).optional(),
  }),
};

const getPaymentSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
};

const refundPaymentSchema = {
  params: Joi.object({
    id: Joi.string().uuid().required(),
  }),
  body: Joi.object({
    amount: Joi.number().positive().precision(2).optional(),
    reason: Joi.string().max(255).optional(),
  }),
};

// POST /api/payments - Create a new payment (purchase transaction)
router.post(
  '/',
  validateRequest(createPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Payment creation requested', {
      correlationId: req.correlationId,
      amount: req.body.amount,
      currency: req.body.currency,
      customerEmail: req.body.customerEmail,
    });

    // Validate payment method
    const validationErrors = paymentService.validatePaymentMethod(
      req.body.paymentMethod
    );
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid payment method',
        details: validationErrors,
        correlationId: req.correlationId,
      });
    }

    // Prepare transaction request
    const transactionRequest: TransactionRequest = {
      amount: req.body.amount,
      paymentMethod: {
        cardNumber: req.body.paymentMethod.cardNumber,
        expirationDate: req.body.paymentMethod.expirationDate,
        cardCode: req.body.paymentMethod.cardCode,
        cardholderName: req.body.paymentMethod.cardholderName,
      },
      billingAddress: {
        firstName: req.body.billingAddress.firstName,
        lastName: req.body.billingAddress.lastName,
        company: req.body.billingAddress.company,
        address: req.body.billingAddress.address,
        city: req.body.billingAddress.city,
        state: req.body.billingAddress.state,
        zip: req.body.billingAddress.zip,
        country: req.body.billingAddress.country,
      },
      description: req.body.description,
      invoiceNumber: req.body.invoiceNumber,
      customerEmail: req.body.customerEmail,
      merchantTransactionId: req.correlationId,
    };

    try {
      // Process payment with Authorize.Net
      const result = await paymentService.processPurchase(transactionRequest);

      if (result.success) {
        const response = {
          id: result.transactionId,
          status: 'completed',
          amount: req.body.amount,
          currency: req.body.currency,
          description: req.body.description,
          customerEmail: req.body.customerEmail,
          customerName: req.body.customerName,
          authCode: result.authCode,
          avsResult: result.avsResultCode,
          cvvResult: result.cvvResultCode,
          createdAt: new Date().toISOString(),
          correlationId: req.correlationId,
        };

        logger.info('Payment processed successfully', {
          correlationId: req.correlationId,
          transactionId: result.transactionId,
          authCode: result.authCode,
        });

        res.status(201).json(response);
      } else {
        logger.warn('Payment processing failed', {
          correlationId: req.correlationId,
          responseCode: result.responseCode,
          responseText: result.responseText,
          errors: result.errors,
        });

        res.status(400).json({
          error: 'Payment processing failed',
          message: result.responseText,
          details: result.errors,
          correlationId: req.correlationId,
        });
      }
    } catch (error) {
      logger.error('Payment processing error', {
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Payment processing failed due to a system error',
        correlationId: req.correlationId,
      });
    }
  })
);

// POST /api/payments/authorize - Authorize a payment (hold funds)
router.post(
  '/authorize',
  validateRequest(authorizePaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    logger.info('Payment authorization requested', {
      correlationId: req.correlationId,
      amount: req.body.amount,
      customerEmail: req.body.customerEmail,
    });

    // Validate payment method
    const validationErrors = paymentService.validatePaymentMethod(
      req.body.paymentMethod
    );
    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: 'Invalid payment method',
        details: validationErrors,
        correlationId: req.correlationId,
      });
    }

    // Prepare authorization request
    const authorizeRequest: AuthorizeRequest = {
      amount: req.body.amount,
      paymentMethod: {
        cardNumber: req.body.paymentMethod.cardNumber,
        expirationDate: req.body.paymentMethod.expirationDate,
        cardCode: req.body.paymentMethod.cardCode,
        cardholderName: req.body.paymentMethod.cardholderName,
      },
      billingAddress: {
        firstName: req.body.billingAddress.firstName,
        lastName: req.body.billingAddress.lastName,
        company: req.body.billingAddress.company,
        address: req.body.billingAddress.address,
        city: req.body.billingAddress.city,
        state: req.body.billingAddress.state,
        zip: req.body.billingAddress.zip,
        country: req.body.billingAddress.country,
      },
      description: req.body.description,
      invoiceNumber: req.body.invoiceNumber,
      customerEmail: req.body.customerEmail,
      merchantTransactionId: req.correlationId,
    };

    try {
      const result =
        await paymentService.authorizeTransaction(authorizeRequest);

      if (result.success) {
        const response = {
          id: result.transactionId,
          status: 'authorized',
          amount: req.body.amount,
          currency: req.body.currency,
          description: req.body.description,
          customerEmail: req.body.customerEmail,
          customerName: req.body.customerName,
          authCode: result.authCode,
          avsResult: result.avsResultCode,
          cvvResult: result.cvvResultCode,
          createdAt: new Date().toISOString(),
          correlationId: req.correlationId,
        };

        logger.info('Payment authorized successfully', {
          correlationId: req.correlationId,
          transactionId: result.transactionId,
          authCode: result.authCode,
        });

        res.status(201).json(response);
      } else {
        logger.warn('Payment authorization failed', {
          correlationId: req.correlationId,
          responseCode: result.responseCode,
          responseText: result.responseText,
        });

        res.status(400).json({
          error: 'Payment authorization failed',
          message: result.responseText,
          details: result.errors,
          correlationId: req.correlationId,
        });
      }
    } catch (error) {
      logger.error('Payment authorization error', {
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Payment authorization failed due to a system error',
        correlationId: req.correlationId,
      });
    }
  })
);

// POST /api/payments/:transactionId/capture - Capture an authorized payment
router.post(
  '/:transactionId/capture',
  validateRequest(capturePaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { transactionId } = req.params;
    const { amount } = req.body;

    logger.info('Payment capture requested', {
      correlationId: req.correlationId,
      transactionId,
      amount,
    });

    const captureRequest: CaptureRequest = {
      transactionId,
      amount,
    };

    try {
      const result = await paymentService.captureTransaction(captureRequest);

      if (result.success) {
        const response = {
          id: result.transactionId,
          originalTransactionId: transactionId,
          status: 'captured',
          amount: amount || 'full_amount',
          authCode: result.authCode,
          capturedAt: new Date().toISOString(),
          correlationId: req.correlationId,
        };

        logger.info('Payment captured successfully', {
          correlationId: req.correlationId,
          transactionId: result.transactionId,
          authCode: result.authCode,
        });

        res.status(200).json(response);
      } else {
        logger.warn('Payment capture failed', {
          correlationId: req.correlationId,
          transactionId,
          responseCode: result.responseCode,
          responseText: result.responseText,
        });

        res.status(400).json({
          error: 'Payment capture failed',
          message: result.responseText,
          details: result.errors,
          correlationId: req.correlationId,
        });
      }
    } catch (error) {
      logger.error('Payment capture error', {
        correlationId: req.correlationId,
        transactionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Payment capture failed due to a system error',
        correlationId: req.correlationId,
      });
    }
  })
);

// GET /api/payments/:id - Get payment details
router.get(
  '/:id',
  validateRequest(getPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;

    logger.info('Payment details requested', {
      correlationId: req.correlationId,
      paymentId: id,
    });

    // TODO: Implement database lookup
    // This is a placeholder response
    const payment = {
      id,
      status: 'completed',
      amount: 100.0,
      currency: 'USD',
      description: 'Test payment',
      customerEmail: 'customer@example.com',
      customerName: 'John Doe',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      correlationId: req.correlationId,
    };

    res.json(payment);
  })
);

// POST /api/payments/:id/refund - Refund a payment
router.post(
  '/:id/refund',
  validateRequest(refundPaymentSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const { amount, reason } = req.body;

    logger.info('Payment refund requested', {
      correlationId: req.correlationId,
      paymentId: id,
      refundAmount: amount,
      reason,
    });

    // TODO: Implement Authorize.Net refund processing
    // This is a placeholder response
    const refundId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const response = {
      id: refundId,
      paymentId: id,
      status: 'pending',
      amount: amount || 100.0,
      reason: reason || 'Customer request',
      createdAt: new Date().toISOString(),
      correlationId: req.correlationId,
    };

    logger.info('Refund processed successfully', {
      correlationId: req.correlationId,
      refundId,
      paymentId: id,
      status: response.status,
    });

    res.status(201).json(response);
  })
);

// GET /api/payments - List payments with pagination
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt(req.query['page'] as string) || 1;
    const limit = parseInt(req.query['limit'] as string) || 10;
    const status = req.query['status'] as string;

    logger.info('Payments list requested', {
      correlationId: req.correlationId,
      page,
      limit,
      status,
    });

    // TODO: Implement database query with pagination
    // This is a placeholder response
    const payments = Array.from({ length: Math.min(limit, 5) }, (_, i) => ({
      id: `pay_${Date.now()}_${i}`,
      status: 'completed',
      amount: (i + 1) * 50.0,
      currency: 'USD',
      customerEmail: `customer${i + 1}@example.com`,
      createdAt: new Date().toISOString(),
    }));

    const response = {
      data: payments,
      pagination: {
        page,
        limit,
        total: 25,
        totalPages: Math.ceil(25 / limit),
      },
      correlationId: req.correlationId,
    };

    res.json(response);
  })
);

export default router;
