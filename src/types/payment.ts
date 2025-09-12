// Payment-specific DTOs and types

export interface PaymentMethodDto {
  type: 'credit_card';
  cardNumber: string;
  expirationDate: string; // MMYY format
  cardCode: string;
  cardholderName?: string;
}

export interface BillingAddressDto {
  firstName: string;
  lastName: string;
  company?: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface CreatePaymentDto {
  amount: number;
  currency: string;
  description?: string;
  customerEmail: string;
  customerName: string;
  invoiceNumber?: string;
  paymentMethod: PaymentMethodDto;
  billingAddress: BillingAddressDto;
  idempotencyKey?: string;
}

export interface AuthorizePaymentDto extends CreatePaymentDto {
  // Inherits all fields from CreatePaymentDto
}

export interface CapturePaymentDto {
  amount?: number; // If not provided, captures the full authorized amount
}

export interface RefundPaymentDto {
  amount?: number; // If not provided, refunds the full amount
  reason?: string;
}

export interface PaymentResponseDto {
  id: string;
  status:
    | 'pending'
    | 'authorized'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'refunded';
  amount: number;
  currency: string;
  description?: string | undefined;
  customerEmail: string;
  customerName: string;
  authCode?: string | undefined;
  avsResult?: string | undefined;
  cvvResult?: string | undefined;
  createdAt: string;
  updatedAt?: string | undefined;
  correlationId: string;
}

export interface RefundResponseDto {
  id: string;
  paymentId: string;
  status: 'pending' | 'completed' | 'failed';
  amount: number;
  reason?: string | undefined;
  createdAt: string;
  correlationId: string;
}

export interface CancelResponseDto {
  id: string;
  originalTransactionId: string;
  status: 'cancelled';
  cancelledAt: string;
  correlationId: string;
}

export interface CaptureResponseDto {
  id: string;
  originalTransactionId: string;
  status: 'captured';
  amount: number | string;
  authCode?: string | undefined;
  capturedAt: string;
  correlationId: string;
}
