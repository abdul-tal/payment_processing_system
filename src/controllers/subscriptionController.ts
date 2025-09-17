import { Request, Response } from 'express';
import {
  SubscriptionService,
  CreateSubscriptionRequest,
  UpdateSubscriptionRequest,
} from '../services/subscriptionService';
import { SubscriptionStatus, BillingInterval } from '../entities/Subscription';
import { logger } from '../config/logger';
import { randomUUID } from 'crypto';

export class SubscriptionController {
  private subscriptionService: SubscriptionService;

  constructor() {
    this.subscriptionService = new SubscriptionService();
  }

  /**
   * POST /api/v1/subscriptions
   * Create a new subscription
   */
  async createSubscription(req: Request, res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    try {
      const {
        customer_email,
        customer_name,
        plan_name,
        amount,
        currency,
        billing_interval,
        start_date,
        total_billing_cycles,
        card_number,
        expiry_month,
        expiry_year,
        cvv,
        billing_address,
        metadata,
      } = req.body;

      // Validate required fields
      if (
        !customer_email ||
        !plan_name ||
        !amount ||
        !billing_interval ||
        !card_number ||
        !expiry_month ||
        !expiry_year ||
        !cvv
      ) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields',
          required_fields: [
            'customer_email',
            'plan_name',
            'amount',
            'billing_interval',
            'card_number',
            'expiry_month',
            'expiry_year',
            'cvv',
          ],
        });
        return;
      }

      // Validate billing interval
      if (!Object.values(BillingInterval).includes(billing_interval)) {
        res.status(400).json({
          success: false,
          error: 'Invalid billing interval',
          valid_intervals: Object.values(BillingInterval),
        });
        return;
      }

      // Validate amount
      if (typeof amount !== 'number' || amount <= 0) {
        res.status(400).json({
          success: false,
          error: 'Amount must be a positive number',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customer_email)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email format',
        });
        return;
      }

      const createRequest: CreateSubscriptionRequest = {
        customer_email,
        customer_name,
        plan_name,
        amount: parseFloat(amount.toFixed(2)),
        currency: currency || 'USD',
        billing_interval,
        start_date: start_date ? new Date(start_date) : undefined,
        total_billing_cycles,
        card_number,
        expiry_month,
        expiry_year,
        cvv,
        billing_address,
        metadata,
      };

      const subscription =
        await this.subscriptionService.createSubscription(createRequest);

      logger.info('Subscription created via API', {
        correlationId,
        subscription_id: subscription.subscription_id,
        customer_email: subscription.customer_email,
      });

      res.status(201).json({
        success: true,
        data: {
          id: subscription.id,
          subscription_id: subscription.subscription_id,
          customer_email: subscription.customer_email,
          customer_name: subscription.customer_name,
          plan_name: subscription.plan_name,
          amount: subscription.amount,
          currency: subscription.currency,
          billing_interval: subscription.billing_interval,
          status: subscription.status,
          start_date: subscription.start_date,
          next_billing_date: subscription.next_billing_date,
          billing_cycles_completed: subscription.billing_cycles_completed,
          total_billing_cycles: subscription.total_billing_cycles,
          created_at: subscription.created_at,
        },
      });
    } catch (error) {
      logger.error('Failed to create subscription via API', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to create subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /api/v1/subscriptions/:id
   * Get subscription by ID
   */
  async getSubscription(req: Request, res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    try {
      const { id } = req.params;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
        });
        return;
      }

      const subscription = await this.subscriptionService.getSubscription(id);

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Subscription not found',
        });
        return;
      }

      logger.info('Subscription retrieved via API', {
        correlationId,
        subscription_id: subscription.subscription_id,
      });

      res.status(200).json({
        success: true,
        data: {
          id: subscription.id,
          subscription_id: subscription.subscription_id,
          customer_email: subscription.customer_email,
          customer_name: subscription.customer_name,
          plan_name: subscription.plan_name,
          amount: subscription.amount,
          currency: subscription.currency,
          billing_interval: subscription.billing_interval,
          status: subscription.status,
          start_date: subscription.start_date,
          end_date: subscription.end_date,
          next_billing_date: subscription.next_billing_date,
          last_billing_date: subscription.last_billing_date,
          billing_cycles_completed: subscription.billing_cycles_completed,
          total_billing_cycles: subscription.total_billing_cycles,
          card_last_four: subscription.card_last_four,
          card_type: subscription.card_type,
          cancellation_reason: subscription.cancellation_reason,
          cancelled_at: subscription.cancelled_at,
          metadata: subscription.metadata,
          created_at: subscription.created_at,
          updated_at: subscription.updated_at,
        },
      });
    } catch (error) {
      logger.error('Failed to get subscription via API', {
        correlationId,
        subscription_id: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * PUT /api/v1/subscriptions/:id
   * Update subscription
   */
  async updateSubscription(req: Request, res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    try {
      const { id } = req.params;
      const { plan_name, amount, billing_interval, status, metadata } =
        req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
        });
        return;
      }

      // Validate billing interval if provided
      if (
        billing_interval &&
        !Object.values(BillingInterval).includes(billing_interval)
      ) {
        res.status(400).json({
          success: false,
          error: 'Invalid billing interval',
          valid_intervals: Object.values(BillingInterval),
        });
        return;
      }

      // Validate status if provided
      if (status && !Object.values(SubscriptionStatus).includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid subscription status',
          valid_statuses: Object.values(SubscriptionStatus),
        });
        return;
      }

      // Validate amount if provided
      if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
        res.status(400).json({
          success: false,
          error: 'Amount must be a positive number',
        });
        return;
      }

      const updateRequest: UpdateSubscriptionRequest = {
        plan_name,
        amount: amount ? parseFloat(amount.toFixed(2)) : undefined,
        billing_interval,
        status,
        metadata,
      };

      const subscription = await this.subscriptionService.updateSubscription(
        id,
        updateRequest
      );

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Subscription not found',
        });
        return;
      }

      logger.info('Subscription updated via API', {
        correlationId,
        subscription_id: subscription.subscription_id,
        updates: updateRequest,
      });

      res.status(200).json({
        success: true,
        data: {
          id: subscription.id,
          subscription_id: subscription.subscription_id,
          customer_email: subscription.customer_email,
          customer_name: subscription.customer_name,
          plan_name: subscription.plan_name,
          amount: subscription.amount,
          currency: subscription.currency,
          billing_interval: subscription.billing_interval,
          status: subscription.status,
          start_date: subscription.start_date,
          end_date: subscription.end_date,
          next_billing_date: subscription.next_billing_date,
          last_billing_date: subscription.last_billing_date,
          billing_cycles_completed: subscription.billing_cycles_completed,
          total_billing_cycles: subscription.total_billing_cycles,
          cancellation_reason: subscription.cancellation_reason,
          cancelled_at: subscription.cancelled_at,
          metadata: subscription.metadata,
          updated_at: subscription.updated_at,
        },
      });
    } catch (error) {
      logger.error('Failed to update subscription via API', {
        correlationId,
        subscription_id: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to update subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * DELETE /api/v1/subscriptions/:id
   * Cancel subscription
   */
  async cancelSubscription(req: Request, res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    try {
      const { id } = req.params;
      const { reason } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
        });
        return;
      }

      const subscription = await this.subscriptionService.cancelSubscription(
        id,
        reason
      );

      if (!subscription) {
        res.status(404).json({
          success: false,
          error: 'Subscription not found',
        });
        return;
      }

      logger.info('Subscription cancelled via API', {
        correlationId,
        subscription_id: subscription.subscription_id,
        reason: reason || 'No reason provided',
      });

      res.status(200).json({
        success: true,
        data: {
          id: subscription.id,
          subscription_id: subscription.subscription_id,
          status: subscription.status,
          cancelled_at: subscription.cancelled_at,
          cancellation_reason: subscription.cancellation_reason,
          end_date: subscription.end_date,
        },
        message: 'Subscription cancelled successfully',
      });
    } catch (error) {
      logger.error('Failed to cancel subscription via API', {
        correlationId,
        subscription_id: req.params.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * GET /api/v1/subscriptions/customer/:email
   * Get subscriptions by customer email
   */
  async getSubscriptionsByCustomer(req: Request, res: Response): Promise<void> {
    const correlationId =
      (req.headers['x-correlation-id'] as string) || randomUUID();

    try {
      const { email } = req.params;

      if (!email) {
        res.status(400).json({
          success: false,
          error: 'Customer email is required',
        });
        return;
      }

      // Validate email format
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        res.status(400).json({
          success: false,
          error: 'Invalid email format',
        });
        return;
      }

      const subscriptions =
        await this.subscriptionService.getSubscriptionsByCustomer(email);

      logger.info('Customer subscriptions retrieved via API', {
        correlationId,
        customer_email: email,
        count: subscriptions.length,
      });

      res.status(200).json({
        success: true,
        data: subscriptions.map(subscription => ({
          id: subscription.id,
          subscription_id: subscription.subscription_id,
          plan_name: subscription.plan_name,
          amount: subscription.amount,
          currency: subscription.currency,
          billing_interval: subscription.billing_interval,
          status: subscription.status,
          start_date: subscription.start_date,
          next_billing_date: subscription.next_billing_date,
          billing_cycles_completed: subscription.billing_cycles_completed,
          created_at: subscription.created_at,
        })),
        count: subscriptions.length,
      });
    } catch (error) {
      logger.error('Failed to get customer subscriptions via API', {
        correlationId,
        customer_email: req.params.email,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve customer subscriptions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
