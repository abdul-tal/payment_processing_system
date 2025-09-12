import {
  purchasePaymentSchema,
  authorizePaymentSchema,
  capturePaymentSchema,
  refundPaymentSchema,
  cancelPaymentSchema,
} from '../../src/validation/paymentSchemas';

describe('Payment Validation Schemas', () => {
  const validPaymentData = {
    amount: 100.0,
    currency: 'USD',
    description: 'Test payment',
    customerEmail: 'test@example.com',
    customerName: 'John Doe',
    invoiceNumber: 'INV-001',
    paymentMethod: {
      type: 'credit_card',
      cardNumber: '4111111111111111',
      expirationDate: '1225',
      cardCode: '123',
      cardholderName: 'John Doe',
    },
    billingAddress: {
      firstName: 'John',
      lastName: 'Doe',
      address: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345',
      country: 'US',
    },
  };

  describe('Purchase Payment Schema', () => {
    it('should validate valid purchase payment data', () => {
      const { error } = purchasePaymentSchema.body.validate(validPaymentData);
      expect(error).toBeUndefined();
    });

    it('should require amount', () => {
      const invalidData = { ...validPaymentData } as any;
      delete invalidData.amount;

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('amount');
    });

    it('should reject negative amount', () => {
      const invalidData = { ...validPaymentData, amount: -10 };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('amount');
    });

    it('should reject zero amount', () => {
      const invalidData = { ...validPaymentData, amount: 0 };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('amount');
    });

    it('should default currency to USD', () => {
      const dataWithoutCurrency = { ...validPaymentData };
      delete (dataWithoutCurrency as any).currency;

      const { error, value } =
        purchasePaymentSchema.body.validate(dataWithoutCurrency);
      expect(error).toBeUndefined();
      expect(value.currency).toBe('USD');
    });

    it('should validate currency format', () => {
      const invalidData = { ...validPaymentData, currency: 'INVALID' };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('currency');
    });

    it('should require valid email format', () => {
      const invalidData = {
        ...validPaymentData,
        customerEmail: 'invalid-email',
      };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('customerEmail');
    });

    it('should require payment method', () => {
      const invalidData = { ...validPaymentData };
      delete (invalidData as any).paymentMethod;

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('paymentMethod');
    });

    it('should validate payment method type', () => {
      const invalidData = {
        ...validPaymentData,
        paymentMethod: {
          ...validPaymentData.paymentMethod,
          type: 'invalid_type' as any,
        },
      };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toEqual(['paymentMethod', 'type']);
    });

    it('should validate card number format', () => {
      const invalidData = {
        ...validPaymentData,
        paymentMethod: {
          ...validPaymentData.paymentMethod,
          cardNumber: '1234', // Invalid card number
        },
      };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toEqual([
        'paymentMethod',
        'cardNumber',
      ]);
    });

    it('should validate expiration date format', () => {
      const invalidData = {
        ...validPaymentData,
        paymentMethod: {
          ...validPaymentData.paymentMethod,
          expirationDate: '12/25', // Invalid format, should be MMYY
        },
      };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toEqual([
        'paymentMethod',
        'expirationDate',
      ]);
    });

    it('should validate card code format', () => {
      const invalidData = {
        ...validPaymentData,
        paymentMethod: {
          ...validPaymentData.paymentMethod,
          cardCode: '12', // Too short
        },
      };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toEqual(['paymentMethod', 'cardCode']);
    });

    it('should require billing address', () => {
      const invalidData = { ...validPaymentData };
      delete (invalidData as any).billingAddress;

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('billingAddress');
    });

    it('should validate billing address fields', () => {
      const invalidData = {
        ...validPaymentData,
        billingAddress: {
          ...validPaymentData.billingAddress,
          firstName: '', // Required field
        },
      };

      const { error } = purchasePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toEqual([
        'billingAddress',
        'firstName',
      ]);
    });

    it('should default country to US', () => {
      const dataWithoutCountry = {
        ...validPaymentData,
        billingAddress: {
          ...validPaymentData.billingAddress,
        },
      };
      delete (dataWithoutCountry as any).billingAddress.country;

      const { error, value } =
        purchasePaymentSchema.body.validate(dataWithoutCountry);
      expect(error).toBeUndefined();
      expect(value.billingAddress.country).toBe('US');
    });

    it('should validate idempotency key format', () => {
      const validDataWithKey = {
        ...validPaymentData,
        idempotencyKey: 'valid-key-12345',
      };

      const { error } = purchasePaymentSchema.body.validate(validDataWithKey);
      expect(error).toBeUndefined();
    });

    it('should reject invalid idempotency key format', () => {
      const invalidDataWithKey = {
        ...validPaymentData,
        idempotencyKey: 'invalid key!',
      };

      const { error } = purchasePaymentSchema.body.validate(invalidDataWithKey);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('idempotencyKey');
    });

    it('should validate idempotency key in headers', () => {
      const validHeaders = {
        'idempotency-key': 'valid-header-key-12345',
        'content-type': 'application/json',
      };

      const { error } = purchasePaymentSchema.headers.validate(validHeaders);
      expect(error).toBeUndefined();
    });
  });

  describe('Authorize Payment Schema', () => {
    it('should validate valid authorize payment data', () => {
      const { error } = authorizePaymentSchema.body.validate(validPaymentData);
      expect(error).toBeUndefined();
    });

    it('should have same validation rules as purchase schema', () => {
      const invalidData = { ...validPaymentData, amount: -10 };

      const { error } = authorizePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('amount');
    });
  });

  describe('Capture Payment Schema', () => {
    it('should validate valid capture data', () => {
      const captureData = {
        params: { transactionId: 'txn_123456789' },
        body: { amount: 50.0 },
      };

      const paramsValidation = capturePaymentSchema.params.validate(
        captureData.params
      );
      const bodyValidation = capturePaymentSchema.body.validate(
        captureData.body
      );

      expect(paramsValidation.error).toBeUndefined();
      expect(bodyValidation.error).toBeUndefined();
    });

    it('should require transaction ID in params', () => {
      const { error } = capturePaymentSchema.params.validate({});
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('transactionId');
    });

    it('should allow empty body for full capture', () => {
      const { error } = capturePaymentSchema.body.validate({});
      expect(error).toBeUndefined();
    });

    it('should validate amount when provided', () => {
      const invalidData = { amount: -10 };

      const { error } = capturePaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('amount');
    });
  });

  describe('Refund Payment Schema', () => {
    it('should validate valid refund data', () => {
      const refundData = {
        params: { transactionId: 'txn_123456789' },
        body: { amount: 25.0, reason: 'Customer request' },
      };

      const paramsValidation = refundPaymentSchema.params.validate(
        refundData.params
      );
      const bodyValidation = refundPaymentSchema.body.validate(refundData.body);

      expect(paramsValidation.error).toBeUndefined();
      expect(bodyValidation.error).toBeUndefined();
    });

    it('should require transaction ID in params', () => {
      const { error } = refundPaymentSchema.params.validate({});
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('transactionId');
    });

    it('should allow empty body for full refund', () => {
      const { error } = refundPaymentSchema.body.validate({});
      expect(error).toBeUndefined();
    });

    it('should validate amount when provided', () => {
      const invalidData = { amount: 0 };

      const { error } = refundPaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('amount');
    });

    it('should validate reason length', () => {
      const longReason = 'a'.repeat(256);
      const invalidData = { reason: longReason };

      const { error } = refundPaymentSchema.body.validate(invalidData);
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('reason');
    });
  });

  describe('Cancel Payment Schema', () => {
    it('should validate valid cancel data', () => {
      const cancelData = {
        params: { transactionId: 'auth_123456789' },
      };

      const { error } = cancelPaymentSchema.params.validate(cancelData.params);
      expect(error).toBeUndefined();
    });

    it('should require transaction ID in params', () => {
      const { error } = cancelPaymentSchema.params.validate({});
      expect(error).toBeDefined();
      expect(error?.details?.[0]?.path).toContain('transactionId');
    });
  });
});
