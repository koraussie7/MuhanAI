/**
 * Bandwidth primitives — pure, no libp2p imports.
 *
 * Pattern source: folklore/infrastructure/bandwidth-limiter.ts verbatim:
 *   - `createRateLimiter` token bucket (capacity + refill rate)
 *   - `Semaphore` bounded concurrency (tryAcquire / release / available)
 *   - `makePerPeerKey` identity-only keying (room dimension retired in v5)
 *
 * Used by services/api to:
 *   - bound concurrent SSE subscribers per gossip pulse topic
 *   - cap concurrent outbound share-syncs (when added in Phase 2)
 *   - rate-limit inbound messages per peer
 */

export interface RateLimiter {
	tryAcquire(tokens?: number): boolean;
	release(tokens?: number): void;
	available(): number;
}

export interface RateLimiterOpts {
	capacity: number;
	refillPerSecond: number;
}

export function createRateLimiter(opts: RateLimiterOpts): RateLimiter {
	let tokens = opts.capacity;
	let last = Date.now();

	function refill(now: number): void {
		const elapsed = (now - last) / 1000;
		if (elapsed > 0) {
			tokens = Math.min(opts.capacity, tokens + elapsed * opts.refillPerSecond);
			last = now;
		}
	}

	return {
		tryAcquire(t = 1): boolean {
			refill(Date.now());
			if (tokens < t) return false;
			tokens -= t;
			return true;
		},
		release(t = 1): void {
			tokens = Math.min(opts.capacity, tokens + t);
		},
		available(): number {
			refill(Date.now());
			return tokens;
		},
	};
}

export const makePerPeerKey = (peerId: string): string => peerId;

export interface Semaphore {
	tryAcquire(): boolean;
	release(): void;
	available(): number;
}

export function createSemaphore(maxConcurrent: number): Semaphore {
	let active = 0;
	return {
		tryAcquire(): boolean {
			if (active >= maxConcurrent) return false;
			active++;
			return true;
		},
		release(): void {
			if (active > 0) active--;
		},
		available(): number {
			return maxConcurrent - active;
		},
	};
}
