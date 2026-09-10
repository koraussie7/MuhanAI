import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { describe, test } from "node:test";
import type { PulseMessage } from "@agentmesh/peer-mesh";
import { attachSsePulseSink } from "./pulse-stream.js";

class CollectingWritable extends Writable {
	written: string[] = [];
	ended = false;
	override _write(chunk: Buffer, _enc: string, cb: () => void): void {
		this.written.push(chunk.toString("utf8"));
		cb();
	}
	override end(cb?: () => void): this {
		this.ended = true;
		super.end(cb);
		return this;
	}
}

function makeMsg(overrides: Partial<PulseMessage> = {}): PulseMessage {
	return {
		v: 1,
		kind: "pulse",
		fromPeerId: "peer-A",
		payload: { value: 42 },
		ts: 1000,
		...overrides,
	};
}

describe("pulse-stream SSE writer", () => {
	test("write emits 'event: pulse\\ndata: <json>\\n\\n'", async () => {
		const w = new CollectingWritable();
		const { sink } = attachSsePulseSink({ stream: w });
		await sink.write(makeMsg());
		const out = w.written.join("");
		assert.match(out, /^retry: 3000\n\n/);
		assert.match(out, /event: pulse\n/);
		assert.match(out, /data: \{"v":1,"kind":"pulse","fromPeerId":"peer-A"/);
		assert.ok(out.endsWith("\n\n"));
	});

	test("heartbeat emits 'event: heartbeat\\ndata: {ts}\\n\\n'", async () => {
		const w = new CollectingWritable();
		const { sink } = attachSsePulseSink({ stream: w });
		await sink.heartbeat?.(1234567890);
		const out = w.written.join("");
		assert.match(out, /event: heartbeat\n/);
		assert.match(out, /data: \{"ts":1234567890\}\n\n/);
	});

	test("close ends the stream", () => {
		const w = new CollectingWritable();
		const { sink } = attachSsePulseSink({ stream: w });
		sink.close?.();
		assert.equal(w.ended, true);
	});

	test("subsequent writes after close are no-ops", async () => {
		const w = new CollectingWritable();
		const { sink } = attachSsePulseSink({ stream: w });
		sink.close?.();
		const before = w.written.length;
		await sink.write(makeMsg());
		assert.equal(w.written.length, before, "no new frames after close");
	});

	test("JSON payload uses single-line compact form (no embedded newlines)", async () => {
		const w = new CollectingWritable();
		const { sink } = attachSsePulseSink({ stream: w });
		await sink.write(makeMsg({ payload: { multiline: "line1\nline2" } }));
		const out = w.written.join("");
		// SSE spec: each `data:` line is one logical line. JSON.stringify escapes
		// \n as \\n so we get exactly one data line per frame.
		const dataLines = out.split("\n").filter((l) => l.startsWith("data: "));
		assert.equal(dataLines.length, 1);
	});
});
