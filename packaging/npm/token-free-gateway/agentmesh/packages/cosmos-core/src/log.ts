/**
 * Append-only event log.
 *
 * Two implementations ship here:
 *  - `createMemoryLog()` — zero-dependency, used by tests and dev servers.
 *  - `createJsonlLog(path)` — one JSON object per line on disk. This is *the*
 *    durable form of the cosmic log for now: replay is a line scan, append is
 *    an O(1) file append, and nothing is ever rewritten in place.
 *
 * Both share the same semantics: monotonic `sequence` starting at 1, ids from
 * `randomUUID()` when the caller does not supply one, and fan-out to
 * subscribers with optional replay.
 */

import { randomUUID } from "node:crypto";
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import type {
	AppendOnlyLog,
	CosmosEvent,
	CosmosEventInput,
	EventFilter,
} from "./types.js";

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Concept ids referenced anywhere in an event payload. */
export function conceptIdsOf(event: CosmosEvent): string[] {
	const payload = event.payload as Record<string, unknown>;
	const ids = new Set<string>();

	const conceptId = payload.conceptId;
	if (typeof conceptId === "string") ids.add(conceptId);

	const list = payload.conceptIds;
	if (Array.isArray(list)) {
		for (const id of list) if (typeof id === "string") ids.add(id);
	}

	return [...ids];
}

/** True when `event` satisfies every populated clause of `filter`. */
export function matchesFilter(event: CosmosEvent, filter?: EventFilter): boolean {
	if (!filter) return true;

	if (filter.kinds && !filter.kinds.includes(event.kind)) return false;
	if (filter.sources && !filter.sources.includes(event.source)) return false;
	if (filter.sinceSequence !== undefined && event.sequence <= filter.sinceSequence) return false;
	if (filter.sinceTimestamp !== undefined && event.timestamp < filter.sinceTimestamp) return false;
	if (filter.actorId !== undefined && event.actorId !== filter.actorId) return false;
	if (filter.conceptId !== undefined && !conceptIdsOf(event).includes(filter.conceptId)) {
		return false;
	}

	return true;
}

// ---------------------------------------------------------------------------
// Subscriber channel (push → async iterator)
// ---------------------------------------------------------------------------

interface Channel<T> {
	push: (value: T) => void;
	close: () => void;
	iterate: () => AsyncIterable<T>;
}

function createChannel<T>(): Channel<T> {
	const buffer: T[] = [];
	let pending: ((result: IteratorResult<T>) => void) | null = null;
	let closed = false;

	const deliver = (result: IteratorResult<T>) => {
		if (pending) {
			const resolve = pending;
			pending = null;
			resolve(result);
		}
	};

	return {
		push(value: T) {
			if (closed) return;
			if (pending) deliver({ value, done: false });
			else buffer.push(value);
		},
		close() {
			closed = true;
			deliver({ value: undefined as never, done: true });
		},
		iterate() {
			return {
				[Symbol.asyncIterator](): AsyncIterator<T> {
					return {
						next(): Promise<IteratorResult<T>> {
							const queued = buffer.shift();
							if (queued !== undefined) {
								return Promise.resolve({ value: queued, done: false });
							}
							if (closed) {
								return Promise.resolve({ value: undefined as never, done: true });
							}
							return new Promise((resolve) => {
								pending = resolve;
							});
						},
						return(): Promise<IteratorResult<T>> {
							closed = true;
							return Promise.resolve({ value: undefined as never, done: true });
						},
					};
				},
			};
		},
	};
}

interface Subscriber {
	filter?: EventFilter;
	channel: Channel<CosmosEvent>;
}

/** Shared subscribe/publish plumbing for both log flavours. */
class SubscriberHub {
	#subscribers = new Set<Subscriber>();

	add(channel: Channel<CosmosEvent>, filter?: EventFilter): Subscriber {
		const sub: Subscriber = { channel, ...(filter ? { filter } : {}) };
		this.#subscribers.add(sub);
		return sub;
	}

	remove(sub: Subscriber): void {
		this.#subscribers.delete(sub);
		sub.channel.close();
	}

	publish(event: CosmosEvent): void {
		for (const sub of [...this.#subscribers]) {
			if (matchesFilter(event, sub.filter)) sub.channel.push(event);
		}
	}

	clear(): void {
		for (const sub of [...this.#subscribers]) this.remove(sub);
	}
}

// ---------------------------------------------------------------------------
// Memory log
// ---------------------------------------------------------------------------

/** In-process append-only log (tests, dev, ephemeral sessions). */
export function createMemoryLog(): AppendOnlyLog {
	const events: CosmosEvent[] = [];
	const hub = new SubscriberHub();
	let sequence = 0;

	const assign = (input: CosmosEventInput): CosmosEvent => {
		sequence += 1;
		return {
			...input,
			id: input.id ?? randomUUID(),
			sequence,
		} as CosmosEvent;
	};

	const append = async (input: CosmosEventInput): Promise<CosmosEvent> => {
		const event = assign(input);
		events.push(event);
		hub.publish(event);
		return event;
	};

	return {
		async append(input) {
			return append(input);
		},

		async appendMany(inputs) {
			const stored: CosmosEvent[] = [];
			for (const input of inputs) stored.push(await append(input));
			return stored;
		},

		async getRange(fromSequence, toSequence) {
			return events.filter((e) => e.sequence > fromSequence && e.sequence <= toSequence);
		},

		async query(filter) {
			return events.filter((e) => matchesFilter(e, filter));
		},

		async tail(limit, filter) {
			const matched = events.filter((e) => matchesFilter(e, filter));
			return matched.slice(Math.max(0, matched.length - Math.max(0, limit)));
		},

		async lastSequence() {
			return sequence;
		},

		async size() {
			return events.length;
		},

		subscribe(filter, options) {
			const channel = createChannel<CosmosEvent>();
			const since = options?.sinceSequence ?? 0;

			if (since > 0) {
				for (const event of events) {
					if (event.sequence > since && matchesFilter(event, filter)) channel.push(event);
				}
			}

			const sub = hub.add(channel, filter);
			return { events: channel.iterate(), unsubscribe: () => hub.remove(sub) };
		},

		async reset() {
			events.length = 0;
			sequence = 0;
			hub.clear();
		},
	};
}

// ---------------------------------------------------------------------------
// JSONL log
// ---------------------------------------------------------------------------

/**
 * Durable append-only log backed by a newline-delimited JSON file.
 *
 * Trade-off: the whole file is read once at construction to rebuild the
 * in-memory index; appends are single `appendFileSync` calls. When the log
 * outgrows a single node we swap the storage behind this same interface
 * (see plan Phase 1 → 2), so callers never change.
 */
export function createJsonlLog(path: string): AppendOnlyLog {
	const memory = createMemoryLog();
	let hydrated = false;

	const ensureHydrated = () => {
		if (hydrated) return;
		hydrated = true;
		if (!existsSync(path)) return;
		const raw = readFileSync(path, "utf8");
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			try {
				// Re-appends keep the exact stored ids but re-derive sequences in
				// file order, so a partially written tail line is simply skipped.
				const parsed = JSON.parse(trimmed) as CosmosEventInput;
				void memory.append(parsed);
			} catch {
				// Skip corrupt/partial trailing line.
			}
		}
	};

	const persist = (event: CosmosEvent) => {
		try {
			appendFileSync(path, `${JSON.stringify(event)}\n`, "utf8");
		} catch {
			// Disk failures must not break the read path; callers can surface
			// durability metrics separately.
		}
	};

	return {
		async append(input) {
			ensureHydrated();
			const event = await memory.append(input);
			persist(event);
			return event;
		},

		async appendMany(inputs) {
			ensureHydrated();
			const stored = await memory.appendMany(inputs);
			for (const event of stored) persist(event);
			return stored;
		},

		getRange: (from, to) => memory.getRange(from, to),
		query: (filter) => memory.query(filter),
		tail: (limit, filter) => memory.tail(limit, filter),
		lastSequence: () => memory.lastSequence(),
		size: () => memory.size(),

		subscribe(filter, options) {
			ensureHydrated();
			return memory.subscribe(filter, options);
		},

		async reset() {
			hydrated = true;
			await memory.reset();
			try {
				writeFileSync(path, "", "utf8");
			} catch {
				// ignore
			}
		},
	};
}

