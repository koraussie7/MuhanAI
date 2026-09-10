import { describe, expect, it } from "vitest";
import { decodePulse, encodePulse, type PulseMessage } from "../pubsub.js";

describe("pubsub encoding", () => {
	it("round-trips a pulse message", () => {
		const msg: PulseMessage = {
			v: 1,
			kind: "pulse",
			fromPeerId: "12D3KooA",
			payload: { hello: "world" },
			ts: 1700000000000,
		};
		const encoded = encodePulse(msg);
		const decoded = decodePulse(encoded);
		expect(decoded).toEqual(msg);
	});

	it("rejects malformed payloads", () => {
		expect(decodePulse(new Uint8Array([1, 2, 3]))).toBeNull();
		expect(decodePulse(new TextEncoder().encode("not json"))).toBeNull();
		expect(decodePulse(new TextEncoder().encode(JSON.stringify({ v: 2 })))).toBeNull();
		expect(
			decodePulse(new TextEncoder().encode(JSON.stringify({ v: 1, kind: "bogus" }))),
		).toBeNull();
	});
});
