import { PrismaClient } from '@prisma/client';
import { CreatePaymentRequest, ConfirmPaymentRequest, RefundPaymentRequest } from './types';

export const prisma = new PrismaClient();

export class PaymentService {
  async createPayment(data: CreatePaymentRequest) {
    const { orderId, amount, currency, method } = data;
    
    // Verify order exists
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true }
    });

    if (!order) {
      throw new Error(`Order ${orderId} not found`);
    }

    // Create payment record
    const payment = await this.prisma.payment.create({
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
    
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true }
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Update payment status
    await this.prisma.payment.update({
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
    
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: { order: true }
    });

    if (!payment) {
      throw new Error(`Payment ${paymentId} not found`);
    }

    // Create refund record
    await this.prisma.refund.create({
      data: {
        paymentId,
        amount: amount || payment.amount,
        currency: currency || payment.currency,
        reason
      }
    });

    // Update payment status
    await this.prisma.payment.update({
      where: { id: paymentId },
      data: {
        status: 'refunded',
        updatedAt: new Date()
      }
    });

    return payment;
  }
}