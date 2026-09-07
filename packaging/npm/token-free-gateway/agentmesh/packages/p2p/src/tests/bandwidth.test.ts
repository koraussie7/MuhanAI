import { describe, expect, it } from "vitest";
import { createRateLimiter, createSemaphore, makePerPeerKey } from "../bandwidth.js";

describe("bandwidth primitives", () => {
	describe("createRateLimiter", () => {
		it("drains and refills", () => {
			const rl = createRateLimiter({ capacity: 2, refillPerSecond: 1 });
			expect(rl.tryAcquire()).toBe(true);
			expect(rl.tryAcquire()).toBe(true);
			expect(rl.tryAcquire()).toBe(false);
			rl.release();
			expect(rl.available()).toBeGreaterThan(0);
		});

		it("clamps at capacity", () => {
			const rl = createRateLimiter({ capacity: 5, refillPerSecond: 100 });
			for (let i = 0; i < 10; i++) rl.release();
			expect(rl.available()).toBeLessThanOrEqual(5);
		});
	});

	describe("createSemaphore", () => {
		it("caps concurrency", () => {
			const s = createSemaphore(2);
			expect(s.tryAcquire()).toBe(true);
			expect(s.tryAcquire()).toBe(true);
			expect(s.tryAcquire()).toBe(false);
			s.release();
			expect(s.tryAcquire()).toBe(true);
		});

		it("does not go negative on excess release", () => {
			const s = createSemaphore(1);
			s.tryAcquire();
			s.release();
			s.release(); // would set active to -1 in naive impl
			s.release();
			expect(s.available()).toBe(1);
		});
	});

	describe("makePerPeerKey", () => {
		it("returns identity-only key (no room dimension)", () => {
			expect(makePerPeerKey("12D3KooX")).toBe("12D3KooX");
		});
	});
});
