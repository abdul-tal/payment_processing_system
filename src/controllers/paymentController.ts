import { Request, Response } from 'express';
import { logger } from '../config/logger';
import {
  paymentService,
  TransactionRequest,
  AuthorizeRequest,
  CaptureRequest,
  RefundRequest,
  CancelRequest,
} from '../services/paymentService';
import {
  CreatePaymentDto,
  AuthorizePaymentDto,
  CapturePaymentDto,
  RefundPaymentDto,
  PaymentResponseDto,
  RefundResponseDto,
  CancelResponseDto,
  CaptureResponseDto,
} from '../types/payment';
import { IdempotentRequest } from '../middleware/idempotency';

export class PaymentController {
  /**
   * Process a purchase transaction (charge immediately)
   * POST /api/v1/payments/purchase
   */
  public async processPurchase(
    req: IdempotentRequest,
    res: Response
  ): Promise<void> {
    const body = req.body as CreatePaymentDto;

    logger.info('Payment purchase requested', {
      correlationId: req.correlationId,
      amount: body.amount,
      currency: body.currency,
      customerEmail: body.customerEmail,
      idempotencyKey: req.idempotencyKey,
    });

    // Validate payment method
    const validationErrors = paymentService.validatePaymentMethod(
      body.paymentMethod
    );
    if (validationErrors.length > 0) {
      res.status(400).json({
        error: 'Invalid payment method',
        details: validationErrors,
        correlationId: req.correlationId,
      });
      return;
    }

    // Prepare transaction request
    const transactionRequest: TransactionRequest = {
      amount: body.amount,
      paymentMethod: {
        cardNumber: body.paymentMethod.cardNumber,
        expirationDate: body.paymentMethod.expirationDate,
        cardCode: body.paymentMethod.cardCode,
        cardholderName: body.paymentMethod.cardholderName || undefined,
      },
      billingAddress: body.billingAddress,
      description: body.description || undefined,
      invoiceNumber: body.invoiceNumber || undefined,
      customerEmail: body.customerEmail,
      merchantTransactionId: req.correlationId || undefined,
    };

    try {
      const result = await paymentService.processPurchase(transactionRequest);

      if (result.success) {
        const response: PaymentResponseDto = {
          id: result.transactionId!,
          status: 'completed',
          amount: body.amount,
          currency: body.currency,
          description: body.description || undefined,
          customerEmail: body.customerEmail,
          customerName: body.customerName,
          authCode: result.authCode || undefined,
          avsResult: result.avsResultCode || undefined,
          cvvResult: result.cvvResultCode || undefined,
          createdAt: new Date().toISOString(),
          correlationId: req.correlationId!,
        };

        logger.info('Payment purchase processed successfully', {
          correlationId: req.correlationId,
          transactionId: result.transactionId,
          authCode: result.authCode,
        });

        res.status(201).json(response);
      } else {
        logger.warn('Payment purchase failed', {
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
      logger.error('Payment purchase error', {
        correlationId: req.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Payment processing failed due to a system error',
        correlationId: req.correlationId,
      });
    }
  }

  /**
   * Authorize a payment (hold funds without capturing)
   * POST /api/v1/payments/authorize
   */
  public async authorizePayment(
    req: IdempotentRequest,
    res: Response
  ): Promise<void> {
    const body = req.body as AuthorizePaymentDto;

    logger.info('Payment authorization requested', {
      correlationId: req.correlationId,
      amount: body.amount,
      customerEmail: body.customerEmail,
      idempotencyKey: req.idempotencyKey,
    });

    // Validate payment method
    const validationErrors = paymentService.validatePaymentMethod(
      body.paymentMethod
    );
    if (validationErrors.length > 0) {
      res.status(400).json({
        error: 'Invalid payment method',
        details: validationErrors,
        correlationId: req.correlationId,
      });
      return;
    }

    // Prepare authorization request
    const authorizeRequest: AuthorizeRequest = {
      amount: body.amount,
      paymentMethod: {
        cardNumber: body.paymentMethod.cardNumber,
        expirationDate: body.paymentMethod.expirationDate,
        cardCode: body.paymentMethod.cardCode,
        cardholderName: body.paymentMethod.cardholderName || undefined,
      },
      billingAddress: body.billingAddress,
      description: body.description || undefined,
      invoiceNumber: body.invoiceNumber || undefined,
      customerEmail: body.customerEmail,
      merchantTransactionId: req.correlationId || undefined,
    };

    try {
      const result =
        await paymentService.authorizeTransaction(authorizeRequest);

      if (result.success) {
        const response: PaymentResponseDto = {
          id: result.transactionId!,
          status: 'authorized',
          amount: body.amount,
          currency: body.currency,
          description: body.description || undefined,
          customerEmail: body.customerEmail,
          customerName: body.customerName,
          authCode: result.authCode || undefined,
          avsResult: result.avsResultCode || undefined,
          cvvResult: result.cvvResultCode || undefined,
          createdAt: new Date().toISOString(),
          correlationId: req.correlationId!,
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
  }

  /**
   * Capture a previously authorized payment
   * POST /api/v1/payments/:transactionId/capture
   */
  public async capturePayment(req: Request, res: Response): Promise<void> {
    const { transactionId } = req.params;
    const body = req.body as CapturePaymentDto;

    if (!transactionId) {
      res.status(400).json({
        error: 'Transaction ID is required',
        correlationId: req.correlationId,
      });
      return;
    }

    logger.info('Payment capture requested', {
      correlationId: req.correlationId,
      transactionId,
      amount: body.amount,
    });

    const captureRequest: CaptureRequest = {
      transactionId,
      amount: body.amount,
    };

    try {
      const result = await paymentService.captureTransaction(captureRequest);

      if (result.success) {
        const response: CaptureResponseDto = {
          id: result.transactionId!,
          originalTransactionId: transactionId,
          status: 'captured',
          amount: body.amount || 'full_amount',
          authCode: result.authCode,
          capturedAt: new Date().toISOString(),
          correlationId: req.correlationId!,
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
  }

  /**
   * Refund a previously completed payment
   * POST /api/v1/payments/:transactionId/refund
   */
  public async refundPayment(
    req: IdempotentRequest,
    res: Response
  ): Promise<void> {
    const { transactionId } = req.params;
    const body = req.body as RefundPaymentDto;

    if (!transactionId) {
      res.status(400).json({
        error: 'Transaction ID is required',
        correlationId: req.correlationId,
      });
      return;
    }

    logger.info('Payment refund requested', {
      correlationId: req.correlationId,
      transactionId,
      amount: body.amount,
      reason: body.reason,
      idempotencyKey: req.idempotencyKey,
    });

    const refundRequest: RefundRequest = {
      transactionId,
      amount: body.amount || 0,
      paymentMethod: {
        cardNumber: '****',
        expirationDate: '****',
        cardCode: '***',
      },
      reason: body.reason || 'Refund requested',
    };

    try {
      const result = await paymentService.refundTransaction(refundRequest);

      if (result.success) {
        const refundId = `ref_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const response: RefundResponseDto = {
          id: refundId,
          paymentId: transactionId,
          status: 'completed',
          amount: body.amount || result.amount || 0,
          reason: body.reason,
          createdAt: new Date().toISOString(),
          correlationId: req.correlationId!,
        };

        logger.info('Payment refunded successfully', {
          correlationId: req.correlationId,
          refundId,
          transactionId: result.transactionId,
        });

        res.status(201).json(response);
      } else {
        logger.warn('Payment refund failed', {
          correlationId: req.correlationId,
          transactionId,
          responseCode: result.responseCode,
          responseText: result.responseText,
        });

        res.status(400).json({
          error: 'Payment refund failed',
          message: result.responseText,
          details: result.errors,
          correlationId: req.correlationId,
        });
      }
    } catch (error) {
      logger.error('Payment refund error', {
        correlationId: req.correlationId,
        transactionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Payment refund failed due to a system error',
        correlationId: req.correlationId,
      });
    }
  }

  /**
   * Cancel (void) a previously authorized payment
   * POST /api/v1/payments/:transactionId/cancel
   */
  public async cancelPayment(
    req: IdempotentRequest,
    res: Response
  ): Promise<void> {
    const { transactionId } = req.params;

    if (!transactionId) {
      res.status(400).json({
        error: 'Transaction ID is required',
        correlationId: req.correlationId,
      });
      return;
    }

    logger.info('Payment cancel requested', {
      correlationId: req.correlationId,
      transactionId,
      idempotencyKey: req.idempotencyKey,
    });

    const cancelRequest: CancelRequest = {
      transactionId,
    };

    try {
      const result = await paymentService.cancelTransaction(cancelRequest);

      if (result.success) {
        const response: CancelResponseDto = {
          id: result.transactionId!,
          originalTransactionId: transactionId,
          status: 'cancelled',
          cancelledAt: new Date().toISOString(),
          correlationId: req.correlationId!,
        };

        logger.info('Payment cancelled successfully', {
          correlationId: req.correlationId,
          transactionId: result.transactionId,
        });

        res.status(200).json(response);
      } else {
        logger.warn('Payment cancel failed', {
          correlationId: req.correlationId,
          transactionId,
          responseCode: result.responseCode,
          responseText: result.responseText,
        });

        res.status(400).json({
          error: 'Payment cancel failed',
          message: result.responseText,
          details: result.errors,
          correlationId: req.correlationId,
        });
      }
    } catch (error) {
      logger.error('Payment cancel error', {
        correlationId: req.correlationId,
        transactionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal server error',
        message: 'Payment cancel failed due to a system error',
        correlationId: req.correlationId,
      });
    }
  }
}

export const paymentController = new PaymentController();
