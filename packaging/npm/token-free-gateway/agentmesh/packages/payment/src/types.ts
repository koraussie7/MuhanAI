export type PaymentMethod = 'card' | 'paypal' | 'bank_transfer' | 'crypto';
export enum PaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Failed = 'failed',
  Refunded = 'refunded',
}
export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePaymentRequest {
  orderId: string;
  amount: number;
  currency: string;
  method: PaymentMethod;
}

export interface ConfirmPaymentRequest {
  paymentId: string;
  amount?: number;
  currency?: string;
}

export interface RefundPaymentRequest {
  paymentId: string;
  amount?: number;
  currency?: string;
  reason: string;
}