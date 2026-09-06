/**
 * Credit wallet + ledger routes.
 *
 * Endpoints (protected by x-api-key hook in server.ts):
 *
 *   GET  /api/credits/balance?userId=...
 *   POST /api/credits/grant-welcome   (server-side signup integration only)
 *   POST /api/credits/spend
 *
 * The browser-facing flow uses the dev-server proxy (vite: /api → :3001)
 * and includes the userId via the standard auth context. In production,
 * the API key header is enforced by the onRequest hook.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  WELCOME_CREDITS,
  getCreditBalance,
  grantWelcomeBonus,
  spendCredits,
} from "@agentmesh/credits";
import { prisma } from "./db.js";
import { Prisma } from "@prisma/client";
import { clientError, formatZodError } from "./error-shapes.js";

const UserIdQuerySchema = z.object({
  userId: z.string().min(1).max(256),
});

const SpendBodySchema = z.object({
  userId: z.string().min(1).max(256),
  amount: z.union([z.number().int().positive(), z.string().regex(/^[0-9]+$/)])
    .transform((v) => (typeof v === "string" ? BigInt(v) : v)),
  reason: z.string().min(1).max(64).default("spend"),
  idempotencyKey: z.string().min(1).max(256),
  metadata: z.record(z.unknown()).optional(),
});

const GrantWelcomeSchema = z.object({
  userId: z.string().min(1).max(256),
  signupMethod: z.string().min(1).max(64).default("email"),
});

export async function creditsRoutes(app: FastifyInstance) {
  /**
   * GET /api/credits/balance?userId=...
   *
   * Returns the current wallet balance as a string (BigInt serialization).
   */
  app.get("/api/credits/balance", async (request, reply) => {
    const parse = UserIdQuerySchema.safeParse(request.query);
    if (!parse.success) {
      return clientError(reply, 400, formatZodError(parse.error), request.id);
    }
    try {
      const balance = await getCreditBalance(prisma, parse.data.userId);
      return { balance: balance.toString(), userId: parse.data.userId };
    } catch (err) {
      request.log.error({ err }, "credit balance lookup failed");
      return clientError(reply, 500, "Internal server error", request.id);
    }
  });

  /**
   * POST /api/credits/grant-welcome
   *
   * Server-side signup integration. Idempotent — second call for the same
   * userId returns `granted: false` with the current balance. Never expose
   * this route to the browser; the welcome bonus must be granted by the
   * server during account creation.
   */
  app.post("/api/credits/grant-welcome", async (request, reply) => {
    const parse = GrantWelcomeSchema.safeParse(request.body);
    if (!parse.success) {
      return clientError(reply, 400, formatZodError(parse.error), request.id);
    }
    try {
      const result = await grantWelcomeBonus(prisma, parse.data.userId, {
        signupMethod: parse.data.signupMethod,
      });
      return {
        granted: result.granted,
        balance: result.balance.toString(),
        bonus: WELCOME_CREDITS.toString(),
        userId: parse.data.userId,
      };
    } catch (err) {
      request.log.error({ err }, "welcome bonus grant failed");
      return clientError(reply, 500, "Internal server error", request.id);
    }
  });

  /**
   * POST /api/credits/spend
   *
   * Atomic debit with overdraft rejection. Idempotency-key protected so
   * retries cannot double-charge.
   */
  app.post("/api/credits/spend", async (request, reply) => {
    const parse = SpendBodySchema.safeParse(request.body);
    if (!parse.success) {
      return clientError(reply, 400, formatZodError(parse.error), request.id);
    }
    try {
      const result = await spendCredits(prisma, {
        userId: parse.data.userId,
        amount: parse.data.amount,
        reason: parse.data.reason as never,
        idempotencyKey: parse.data.idempotencyKey,
        metadata: parse.data.metadata as Record<string, never> | undefined,
      });
      return {
        balance: result.balance.toString(),
        userId: parse.data.userId,
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
        return clientError(reply, 404, "Wallet not found", request.id);
      }
      if (err instanceof Error && err.name === "InsufficientCreditsError") {
        return clientError(reply, 402, "Insufficient credits", request.id);
      }
      request.log.error({ err }, "credit spend failed");
      return clientError(reply, 500, "Internal server error", request.id);
    }
  });
}
