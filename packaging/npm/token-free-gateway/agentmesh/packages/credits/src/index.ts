import type { Prisma, PrismaClient } from "@prisma/client";

type JsonMetadata = Record<string, Prisma.InputJsonValue>;

export const WELCOME_CREDITS = 1_000_000;
export const WELCOME_BONUS_CODE = "welcome_signup_v1";

export type CreditReason =
  | "welcome_bonus"
  | "purchase"
  | "contribution"
  | "referral"
  | "spend"
  | "refund"
  | "admin_adjustment";

export interface CreditLedgerEntry {
  id: string;
  userId: string;
  amount: bigint;
  reason: CreditReason;
  idempotencyKey: string;
  metadata: JsonMetadata | null;
  createdAt: Date;
}

export class InsufficientCreditsError extends Error {
  constructor(public readonly balance: bigint, public readonly required: bigint) {
    super(`Insufficient credits: balance=${balance}, required=${required}`);
    this.name = "InsufficientCreditsError";
  }
}

export async function getCreditBalance(prisma: PrismaClient, userId: string): Promise<bigint> {
  const wallet = await prisma.creditWallet.findUnique({ where: { userId } });
  return wallet?.balance ?? 0n;
}

export async function grantCredits(
  prisma: PrismaClient,
  input: {
    userId: string;
    amount: bigint | number;
    reason: CreditReason;
    idempotencyKey: string;
    metadata?: JsonMetadata;
  }
): Promise<{ balance: bigint; granted: boolean }> {
  const amount = BigInt(input.amount);
  if (amount <= 0n) throw new Error("Credit amount must be positive");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.creditLedger.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });

    if (existing) {
      const wallet = await tx.creditWallet.findUnique({ where: { userId: input.userId } });
      return { balance: wallet?.balance ?? 0n, granted: false };
    }

    const wallet = await tx.creditWallet.upsert({
      where: { userId: input.userId },
      create: { userId: input.userId, balance: 0n },
      update: {}
    });

    const updated = await tx.creditWallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: amount } }
    });

    await tx.creditLedger.create({
      data: {
        userId: input.userId,
        amount,
        direction: "credit",
        reason: input.reason,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });

    return { balance: updated.balance, granted: true };
  });
}

export async function spendCredits(
  prisma: PrismaClient,
  input: {
    userId: string;
    amount: bigint | number;
    reason?: CreditReason;
    idempotencyKey: string;
    metadata?: JsonMetadata;
  }
): Promise<{ balance: bigint }> {
  const amount = BigInt(input.amount);
  if (amount <= 0n) throw new Error("Credit amount must be positive");

  return prisma.$transaction(async (tx) => {
    const existing = await tx.creditLedger.findUnique({
      where: { idempotencyKey: input.idempotencyKey }
    });
    if (existing) {
      const wallet = await tx.creditWallet.findUnique({ where: { userId: input.userId } });
      return { balance: wallet?.balance ?? 0n };
    }

    const wallet = await tx.creditWallet.findUnique({ where: { userId: input.userId } });
    const balance = wallet?.balance ?? 0n;

    if (balance < amount) throw new InsufficientCreditsError(balance, amount);

    const updated = await tx.creditWallet.update({
      where: { userId: input.userId },
      data: { balance: { decrement: amount } }
    });

    await tx.creditLedger.create({
      data: {
        userId: input.userId,
        amount,
        direction: "debit",
        reason: input.reason ?? "spend",
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata as Prisma.InputJsonValue | undefined
      }
    });

    return { balance: updated.balance };
  });
}

export async function grantWelcomeBonus(
  prisma: PrismaClient,
  userId: string,
  metadata: JsonMetadata = {}
) {
  return grantCredits(prisma, {
    userId,
    amount: WELCOME_CREDITS,
    reason: "welcome_bonus",
    idempotencyKey: `${WELCOME_BONUS_CODE}:${userId}`,
    metadata: { ...metadata, campaign: WELCOME_BONUS_CODE }
  });
}
