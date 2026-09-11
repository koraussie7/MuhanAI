import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PaymentService } from '@agentmesh/payment/src/payment-service';

const createPaymentSchema = z.object({
  orderId: z.string(),
  amount: z.number().positive(),
  currency: z.string().min(3).max(3),
  method: z.enum(['card', 'paypal', 'bank_transfer', 'crypto'])
});

const confirmPaymentSchema = z.object({
  paymentId: z.string()
});

const refundPaymentSchema = z.object({
  paymentId: z.string(),
  reason: z.string(),
  amount: z.number().positive().optional()
});

export async function paymentRoutes(fastify: FastifyInstance) {
  const paymentService = new PaymentService();

  fastify.post('/api/payments', async (request, reply) => {
    try {
      const body = createPaymentSchema.parse(request.body);
      const payment = await paymentService.createPayment(body);
      return reply.code(201).send(payment);
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.post('/api/payments/:paymentId/confirm', async (request, reply) => {
    try {
      const { paymentId } = request.params as { paymentId: string };
      const body = confirmPaymentSchema.parse({ paymentId });
      const payment = await paymentService.confirmPayment(body);
      return reply.send(payment);
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });

  fastify.post('/api/payments/:paymentId/refund', async (request, reply) => {
    try {
      const { paymentId } = request.params as { paymentId: string };
      const body = refundPaymentSchema.parse({ ...request.body, paymentId });
      const payment = await paymentService.refundPayment(body);
      return reply.send(payment);
    } catch (error) {
      return reply.code(400).send({ error: error.message });
    }
  });
}