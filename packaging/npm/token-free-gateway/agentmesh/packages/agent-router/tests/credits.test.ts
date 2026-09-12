import { beforeEach, describe, expect, it, vi } from "vitest";
import { InsufficientCreditsError } from "@agentmesh/credit-system";
import {
	computeRouteCost,
	routeChargeIdempotencyKey,
	routeQuestionWithCredits,
	BASE_ROUTE_COST,
	COST_PER_KNOWLEDGE_NODE,
} from "../src/credits.js";
import * as pipeline from "../src/pipeline.js";

/**
 * Minimal Prisma mock shaped around what credit-system touches:
 *   getCreditBalance → prisma.creditWallet.findUnique
 *   spendCredits     → prisma.$transaction({ creditLedger, creditWallet })
 */
function makePrismaMock(initialBalance: bigint) {
	let balance = initialBalance;
	const ledger = new Map<string, unknown>();

	const wallet = {
		findUnique: vi.fn(async () => ({ userId: "u1", balance })),
		update: vi.fn(async ({ data }: { data: { balance: { decrement: bigint } } }) => {
			balance -= data.balance.decrement;
			return { userId: "u1", balance };
		}),
	};

	const creditLedger = {
		findUnique: vi.fn(async ({ where }: { where: { idempotencyKey: string } }) =>
			ledger.get(where.idempotencyKey) ?? null,
		),
		create: vi.fn(async ({ data }: { data: { idempotencyKey: string } }) => {
			ledger.set(data.idempotencyKey, data);
			return data;
		}),
	};

	const prisma = {
		creditWallet: wallet,
		creditLedger,
		$transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
			fn({ creditWallet: wallet, creditLedger }),
		),
	};

	return {
		prisma: prisma as never,
		getBalance: () => balance,
		wallet,
		creditLedger,
	};
}

describe("computeRouteCost", () => {
	it("charges the base cost with zero knowledge", () => {
		expect(computeRouteCost(0)).toBe(BASE_ROUTE_COST);
	});

	it("adds cost per knowledge node used", () => {
		expect(computeRouteCost(5)).toBe(BASE_ROUTE_COST + 5 * COST_PER_KNOWLEDGE_NODE);
	});

	it("never goes negative for bogus knowledge counts", () => {
		expect(computeRouteCost(-3)).toBe(BASE_ROUTE_COST);
	});
});

describe("routeChargeIdempotencyKey", () => {
	it("is stable for the same user + question", () => {
		const a = routeChargeIdempotencyKey("user-1", "한국의 인구수는?");
		const b = routeChargeIdempotencyKey("user-1", "한국의 인구수는?");
		expect(a).toBe(b);
	});

	it("differs across users and questions", () => {
		const a = routeChargeIdempotencyKey("user-1", "hello");
		const b = routeChargeIdempotencyKey("user-2", "hello");
		const c = routeChargeIdempotencyKey("user-1", "world");
		expect(a).not.toBe(b);
		expect(a).not.toBe(c);
	});
});

describe("routeQuestionWithCredits", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("passes through without charging when prisma is null (dev mode)", async () => {
		vi.spyOn(pipeline, "routeQuestion").mockResolvedValue({
			category: { domain: "test" } as never,
			cast: {} as never,
			knowledgeUsed: 4,
		} as never);

		const out = await routeQuestionWithCredits("q", "u1", { prisma: null });
		expect(out.creditsEnforced).toBe(false);
		expect(out.creditsSpent).toBe(0);
		expect(out.balanceAfter).toBeNull();
		expect(out.knowledgeUsed).toBe(4);
	});

	it("charges the wallet after a successful route", async () => {
		vi.spyOn(pipeline, "routeQuestion").mockResolvedValue({
			category: { domain: "test" } as never,
			cast: {} as never,
			knowledgeUsed: 3,
		} as never);

		const mock = makePrismaMock(1_000n);
		const out = await routeQuestionWithCredits("q", "u1", { prisma: mock.prisma });

		const expected = BASE_ROUTE_COST + 3 * COST_PER_KNOWLEDGE_NODE;
		expect(out.creditsSpent).toBe(expected);
		expect(out.creditsEnforced).toBe(true);
		expect(out.balanceAfter).toBe(1_000n - BigInt(expected));
		expect(mock.getBalance()).toBe(1_000n - BigInt(expected));
	});

	it("fails fast with InsufficientCreditsError before running the pipeline", async () => {
		const spy = vi.spyOn(pipeline, "routeQuestion");
		const mock = makePrismaMock(1n); // far below the base cost

		await expect(
			routeQuestionWithCredits("q", "u1", { prisma: mock.prisma }),
		).rejects.toBeInstanceOf(InsufficientCreditsError);
		expect(spy).not.toHaveBeenCalled();
	});

	it("does not double-charge on replay (idempotency key)", async () => {
		vi.spyOn(pipeline, "routeQuestion").mockResolvedValue({
			category: { domain: "test" } as never,
			cast: {} as never,
			knowledgeUsed: 2,
		} as never);

		const mock = makePrismaMock(1_000n);
		const gate = { prisma: mock.prisma };

		const first = await routeQuestionWithCredits("same question", "u1", gate);
		const second = await routeQuestionWithCredits("same question", "u1", gate);

		const expected = BASE_ROUTE_COST + 2 * COST_PER_KNOWLEDGE_NODE;
		expect(first.creditsSpent).toBe(expected);
		// Replay is detected by the ledger idempotency key — no second debit.
		expect(second.creditsSpent).toBe(expected);
		expect(mock.getBalance()).toBe(1_000n - BigInt(expected));
		expect(mock.creditLedger.create).toHaveBeenCalledTimes(1);
	});
});
