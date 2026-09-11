import { PrismaClient } from '@prisma/client';
import { CreatePaymentRequest, ConfirmPaymentRequest, RefundPaymentRequest } from './types';

/**
 * NOTE: `order`/`payment`/`refund` Prisma models will exist once the payment
 * schema.prisma is generated. Until then we extend the client type so the
 * server build (services/api) can typecheck against the planned models.
 * This cast is intentionally narrow — it disappears once `prisma generate`
 * emits the real models.
 */
type PaymentPrismaClient = PrismaClient & {
	order: {
		findUnique: (args: { where: { id: string }; select?: Record<string, boolean> }) => Promise<{ id: string } | null>;
	};
	payment: {
		create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
		findUnique: (args: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
		update: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
	};
	refund: {
		create: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
	};
};

export const prisma = new PrismaClient() as PaymentPrismaClient;

export class PaymentService {
  async createPayment(data: CreatePaymentRequest) {
    const { orderId, amount, currency, method } = data;
    
    // Verify order exists
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        orderId,
        amount,
        currency,
        method,
        status: 'pending'
      }
    });

    return payment;
  }

  async confirmPayment(data: ConfirmPaymentRequest) {
    const { paymentId } = data;
    
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true }
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'paid',
        updatedAt: new Date()
      }
    });

    return payment;
  }

  async refundPayment(data: RefundPaymentRequest) {
    const { paymentId, amount, currency, reason } = data;
    
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true }
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Create refund record
    await prisma.refund.create({
      data: {
        paymentId,
        amount: amount || payment.amount,
        currency: currency || payment.currency,
        reason
      }
    });

    // Update payment status
    await prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'refunded',
        updatedAt: new Date()
      }
    });

    return payment;
  }
}