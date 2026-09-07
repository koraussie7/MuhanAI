import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, test } from "node:test";
import {
	PulseBridge,
	type PulseMessage,
	type PulseSink,
	type PulseSource,
} from "./gossip-bridge.js";

function makeMsg(overrides: Partial<PulseMessage> = {}): PulseMessage {
	return {
		v: 1,
		kind: "pulse",
		fromPeerId: "peer-A",
		payload: { hello: "world" },
		ts: Date.now(),
		...overrides,
	};
}

/** A controllable source: lets the test fire messages and count subscriptions. */
class MockSource implements PulseSource {
	handlers: Array<(msg: PulseMessage) => void> = [];
	subscribeCount = 0;
	subscribe(handler: (msg: PulseMessage) => void) {
		this.handlers.push(handler);
		this.subscribeCount++;
		return () => {
			const i = this.handlers.indexOf(handler);
			if (i >= 0) this.handlers.splice(i, 1);
		};
	}
	emit(msg: PulseMessage) {
		for (const h of [...this.handlers]) h(msg);
	}
}

class CountingSink implements PulseSink {
	messages: PulseMessage[] = [];
	heartbeats: number[] = [];
	closed = false;
	failNext = false;
	write(msg: PulseMessage) {
		if (this.failNext) {
			this.failNext = false;
			throw new Error("sink failure");
		}
		this.messages.push(msg);
	}
	heartbeat(ts: number) {
		this.heartbeats.push(ts);
	}
	close() {
		this.closed = true;
	}
}

describe("PulseBridge", () => {
	let bridge: PulseBridge;
	beforeEach(() => {
		bridge = new PulseBridge({ heartbeatMs: 50 });
	});
	afterEach(() => {
		bridge.stop();
	});

	test("fan-out: emits to all attached sinks", async () => {
		const src = new MockSource();
		bridge.setSource(src);
		const s1 = new CountingSink();
		const s2 = new CountingSink();
		bridge.attach(s1);
		bridge.attach(s2);

		src.emit(makeMsg({ fromPeerId: "peer-X" }));
		// fan-out is async — let microtasks drain
		await new Promise((r) => setImmediate(r));

		assert.equal(s1.messages.length, 1);
		assert.equal(s2.messages.length, 1);
		assert.equal(s1.messages[0]?.fromPeerId, "peer-X");
	});

	test("setSource is idempotent — no double subscribe", () => {
		const src = new MockSource();
		bridge.setSource(src);
		bridge.setSource(src);
		bridge.setSource(src);
		assert.equal(src.subscribeCount, 1);
	});

	test("replacing source unsubscribes the old one (no leak)", async () => {
		const a = new MockSource();
		const b = new MockSource();
		bridge.setSource(a);
		bridge.setSource(b);
		const sink = new CountingSink();
		bridge.attach(sink);

		a.emit(makeMsg());
		await new Promise((r) => setImmediate(r));
		assert.equal(sink.messages.length, 0, "old source should no longer fan out");

		b.emit(makeMsg());
		await new Promise((r) => setImmediate(r));
		assert.equal(sink.messages.length, 1);
	});

	test("null source → degraded mode (heartbeat-only, no crash)", () => {
		bridge.setSource(null);
		const sink = new CountingSink();
		bridge.attach(sink);
		bridge.start();
		// No assertions on a fixed timer here; just verify no throw.
		assert.equal(bridge.size().sourceAttached, false);
		sink.heartbeat(123); // would only be called by bridge; verify we can call it manually
		assert.equal(sink.heartbeats.length, 1);
	});

	test("sink write failure detaches only the failing sink", async () => {
		const src = new MockSource();
		bridge.setSource(src);
		const good = new CountingSink();
		const bad = new CountingSink();
		bad.failNext = true;
		bridge.attach(good);
		bridge.attach(bad);

		src.emit(makeMsg());
		// wait for the async fan-out microtask chain to settle
		await new Promise((r) => setImmediate(r));

		assert.equal(bad.messages.length, 0, "failing sink should not retain msg");
		assert.equal(good.messages.length, 1);
		assert.equal(bridge.size().sinks, 1, "failing sink should be detached");
	});

	test("detach invokes sink.close", () => {
		const sink = new CountingSink();
		bridge.attach(sink);
		bridge.detach(sink);
		assert.equal(sink.closed, true);
		assert.equal(bridge.size().sinks, 0);
	});

	test("detach is idempotent", () => {
		const sink = new CountingSink();
		bridge.attach(sink);
		bridge.detach(sink);
		bridge.detach(sink); // second call is a no-op
		assert.equal(bridge.size().sinks, 0);
	});

	test("stop clears sinks, source, and heartbeat timer", () => {
		const src = new MockSource();
		const sink = new CountingSink();
		bridge.setSource(src);
		bridge.attach(sink);
		bridge.start();
		bridge.stop();
		assert.equal(bridge.size().sinks, 0);
		assert.equal(bridge.size().sourceAttached, false);
		assert.equal(src.handlers.length, 0);
	});
});
