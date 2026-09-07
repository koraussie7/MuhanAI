/**
 * Tests for the pure EventSource lifecycle in pulse-subscriber.ts.
 *
 * Strategy: a controllable MockEventSource captures handlers; we drive
 * events and assert the callbacks fire correctly. No React, no jsdom —
 * the subscriber is a plain factory over an injected EventSourceCtor.
 */

import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
	createPulseSubscriber,
	type EventSourceCtor,
	type MinimalEventSource,
} from "./pulse-subscriber.js";
import type { PulseMessage } from "./useGossipPulse.js";

class MockEventSource implements MinimalEventSource {
	static instances: MockEventSource[] = [];
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSED = 2;

	url: string;
	onopen: ((ev: Event) => void) | null = null;
	onerror: ((ev: Event) => void) | null = null;
	onmessage: ((ev: MessageEvent<string>) => void) | null = null;
	readyState: number = MockEventSource.CONNECTING;
	closed = false;

	constructor(url: string) {
		this.url = url;
		MockEventSource.instances.push(this);
	}

	close() {
		this.closed = true;
		this.readyState = MockEventSource.CLOSED;
	}

	// Test helpers
	fireOpen() {
		this.readyState = MockEventSource.OPEN;
		this.onopen?.(new Event("open"));
	}
	fireMessage(data: string) {
		this.onmessage?.(new MessageEvent("message", { data }));
	}
	fireError(terminal: boolean) {
		if (terminal) this.readyState = MockEventSource.CLOSED;
		this.onerror?.(new Event("error"));
	}
}

function makeMsg(overrides: Partial<PulseMessage> = {}): PulseMessage {
	return {
		v: 1,
		kind: "pulse",
		fromPeerId: "peer-A",
		payload: { hello: "world" },
		ts: 1000,
		...overrides,
	};
}

interface CapturedCallbacks {
	status: string[];
	reconnects: number;
	messages: PulseMessage[];
}

function makeCallbacks(): CapturedCallbacks {
	return { status: [], reconnects: 0, messages: [] };
}

describe("createPulseSubscriber", () => {
	beforeEach(() => {
		MockEventSource.instances = [];
	});

	test("opens an EventSource on construction", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/api/pulse/stream",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		assert.equal(MockEventSource.instances.length, 1);
		assert.equal(MockEventSource.instances[0]?.url, "/api/pulse/stream");
	});

	test("emits 'connecting' status immediately", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		assert.deepEqual(cb.status, ["connecting"]);
	});

	test("onopen fires status='open' and increments reconnect count", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		assert.deepEqual(cb.status, ["connecting", "open"]);
		assert.equal(cb.reconnects, 1);
	});

	test("onmessage parses JSON and invokes onMessage", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		MockEventSource.instances[0]?.fireMessage(JSON.stringify(makeMsg({ fromPeerId: "p1" })));
		MockEventSource.instances[0]?.fireMessage(JSON.stringify(makeMsg({ fromPeerId: "p2" })));
		assert.equal(cb.messages.length, 2);
		assert.equal(cb.messages[0]?.fromPeerId, "p1");
		assert.equal(cb.messages[1]?.fromPeerId, "p2");
	});

	test("kinds filter restricts which messages are delivered", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			kinds: ["reply"],
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		MockEventSource.instances[0]?.fireMessage(JSON.stringify(makeMsg({ kind: "pulse" })));
		MockEventSource.instances[0]?.fireMessage(JSON.stringify(makeMsg({ kind: "reply" })));
		assert.equal(cb.messages.length, 1);
		assert.equal(cb.messages[0]?.kind, "reply");
	});

	test("malformed JSON is silently dropped", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		assert.doesNotThrow(() => MockEventSource.instances[0]?.fireMessage("not json"));
		assert.equal(cb.messages.length, 0);
	});

	test("messages with v !== 1 are dropped", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		MockEventSource.instances[0]?.fireMessage(JSON.stringify({ v: 2, kind: "pulse" }));
		assert.equal(cb.messages.length, 0);
	});

	test("non-terminal error (readyState != CLOSED) does NOT mark closed", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		MockEventSource.instances[0]?.fireError(false);
		assert.deepEqual(cb.status, ["connecting", "open"]);
	});

	test("terminal error (readyState == CLOSED) marks status='closed'", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		MockEventSource.instances[0]?.fireError(true);
		assert.equal(cb.status[cb.status.length - 1], "closed");
	});

	test("dispose closes the EventSource and stops delivering messages", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		const handle = createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		MockEventSource.instances[0]?.fireOpen();
		handle.dispose();
		assert.equal(MockEventSource.instances[0]?.closed, true);
		// Further events should be ignored.
		MockEventSource.instances[0]?.fireMessage(JSON.stringify(makeMsg()));
		assert.equal(cb.messages.length, 0);
	});

	test("dispose is idempotent", () => {
		const Mock = MockEventSource as unknown as EventSourceCtor;
		const cb = makeCallbacks();
		const handle = createPulseSubscriber({
			url: "/x",
			bufferSize: 10,
			EventSource: Mock,
			onStatus: (s) => cb.status.push(s),
			onReconnect: () => cb.reconnects++,
			onMessage: (m) => cb.messages.push(m),
		});
		assert.doesNotThrow(() => {
			handle.dispose();
			handle.dispose();
		});
	});

	test("missing EventSource in globalThis → status='closed', no throw", () => {
		const cb = makeCallbacks();
		const savedES = (globalThis as { EventSource?: unknown }).EventSource;
		delete (globalThis as { EventSource?: unknown }).EventSource;
		try {
			createPulseSubscriber({
				url: "/x",
				bufferSize: 10,
				onStatus: (s) => cb.status.push(s),
				onReconnect: () => cb.reconnects++,
				onMessage: (m) => cb.messages.push(m),
			});
			assert.deepEqual(cb.status, ["closed"]);
		} finally {
			(globalThis as { EventSource?: unknown }).EventSource = savedES;
		}
	});
});
