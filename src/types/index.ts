// Common type definitions for the payment backend

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaymentRequest {
  amount: number;
  currency: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  billingAddress?: BillingAddress;
}

export interface BillingAddress {
  firstName: string;
  lastName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface PaymentResponse {
  transactionId: string;
  status: 'approved' | 'declined' | 'error';
  message: string;
  authCode?: string;
  avsResult?: string;
  cvvResult?: string;
}
