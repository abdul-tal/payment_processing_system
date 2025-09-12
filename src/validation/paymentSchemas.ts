import Joi from 'joi';

// Base payment method schema
const paymentMethodSchema = Joi.object({
  type: Joi.string().valid('credit_card').required(),
  cardNumber: Joi.string().creditCard().required(),
  expirationDate: Joi.string()
    .pattern(/^\d{4}$/)
    .required()
    .messages({
      'string.pattern.base': 'Expiration date must be in MMYY format',
    }),
  cardCode: Joi.string()
    .pattern(/^\d{3,4}$/)
    .required()
    .messages({
      'string.pattern.base': 'Card code must be 3 or 4 digits',
    }),
  cardholderName: Joi.string().max(100).optional(),
});

// Base billing address schema
const billingAddressSchema = Joi.object({
  firstName: Joi.string().max(50).required(),
  lastName: Joi.string().max(50).required(),
  company: Joi.string().max(50).optional(),
  address: Joi.string().max(100).required(),
  city: Joi.string().max(50).required(),
  state: Joi.string().max(50).required(),
  zip: Joi.string().max(10).required(),
  country: Joi.string().length(2).uppercase().default('US'),
});

// Purchase payment validation schema
export const purchasePaymentSchema = {
  body: Joi.object({
    amount: Joi.number().positive().precision(2).required(),
    currency: Joi.string().length(3).uppercase().default('USD'),
    description: Joi.string().max(255).optional(),
    customerEmail: Joi.string().email().required(),
    customerName: Joi.string().max(100).required(),
    invoiceNumber: Joi.string().max(20).optional(),
    paymentMethod: paymentMethodSchema.required(),
    billingAddress: billingAddressSchema.required(),
    idempotencyKey: Joi.string()
      .pattern(/^[a-zA-Z0-9-_]{10,50}$/)
      .optional(),
  }),
  headers: Joi.object({
    'idempotency-key': Joi.string()
      .pattern(/^[a-zA-Z0-9-_]{10,50}$/)
      .optional(),
  }).unknown(true),
};

// Authorize payment validation schema
export const authorizePaymentSchema = {
  body: Joi.object({
    amount: Joi.number().positive().precision(2).required(),
    currency: Joi.string().length(3).uppercase().default('USD'),
    description: Joi.string().max(255).optional(),
    customerEmail: Joi.string().email().required(),
    customerName: Joi.string().max(100).required(),
    invoiceNumber: Joi.string().max(20).optional(),
    paymentMethod: paymentMethodSchema.required(),
    billingAddress: billingAddressSchema.required(),
    idempotencyKey: Joi.string()
      .pattern(/^[a-zA-Z0-9-_]{10,50}$/)
      .optional(),
  }),
  headers: Joi.object({
    'idempotency-key': Joi.string()
      .pattern(/^[a-zA-Z0-9-_]{10,50}$/)
      .optional(),
  }).unknown(true),
};

// Capture payment validation schema
export const capturePaymentSchema = {
  params: Joi.object({
    transactionId: Joi.string().required(),
  }),
  body: Joi.object({
    amount: Joi.number().positive().precision(2).optional(),
  }),
};

// Refund payment validation schema
export const refundPaymentSchema = {
  params: Joi.object({
    transactionId: Joi.string().required(),
  }),
  body: Joi.object({
    amount: Joi.number().positive().precision(2).optional(),
    reason: Joi.string().max(255).optional(),
  }),
  headers: Joi.object({
    'idempotency-key': Joi.string()
      .pattern(/^[a-zA-Z0-9-_]{10,50}$/)
      .optional(),
  }).unknown(true),
};

// Cancel payment validation schema
export const cancelPaymentSchema = {
  params: Joi.object({
    transactionId: Joi.string().required(),
  }),
  headers: Joi.object({
    'idempotency-key': Joi.string()
      .pattern(/^[a-zA-Z0-9-_]{10,50}$/)
      .optional(),
  }).unknown(true),
};
