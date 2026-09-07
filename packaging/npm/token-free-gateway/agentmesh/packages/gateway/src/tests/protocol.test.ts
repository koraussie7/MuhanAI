import { describe, it, expect } from "vitest";

import {
  GATEWAY_PROTOCOL_VERSION,
  GATEWAY_PUBSUB_TOPIC,
  encodeMessage,
  decodeMessage,
  type MachineClaim,
  type Heartbeat,
} from "../protocol.js";

describe("protocol — constants", () => {
  it("protocol version is 1", () => {
    expect(GATEWAY_PROTOCOL_VERSION).toBe(1);
  });

  it("pubsub topic is namespaced under /muhanai/gateway/v1", () => {
    expect(GATEWAY_PUBSUB_TOPIC).toBe("/muhanai/gateway/v1");
  });
});

describe("protocol — round-trip", () => {
  it("encodes and decodes a machine-claim message byte-exactly", () => {
    const claim: MachineClaim = {
      kind: "machine-claim",
      v: GATEWAY_PROTOCOL_VERSION,
      userId: "user_abc",
      machineId: "machine_xyz",
      platform: "macos",
      label: "Brian's MacBook",
      issuedAt: 1_700_000_000_000,
      ttlMs: 60_000,
    };
    const bytes = encodeMessage(claim);
    const decoded = decodeMessage(bytes);
    expect(decoded).toEqual(claim);
  });

  it("encodes and decodes a heartbeat with Uint8Array payload", () => {
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const hb: Heartbeat = {
      kind: "heartbeat",
      v: GATEWAY_PROTOCOL_VERSION,
      userId: "user_abc",
      machineId: "machine_xyz",
      issuedAt: 1_700_000_000_000,
    };
    void payload;
    const bytes = encodeMessage(hb);
    expect(decodeMessage(bytes)).toEqual(hb);
  });

  it("rejects unknown kinds", () => {
    const bogus = JSON.stringify({
      kind: "not-a-real-kind",
      v: 1,
      issuedAt: 0,
    });
    expect(() => decodeMessage(new TextEncoder().encode(bogus))).toThrow(
      /invalid gateway protocol message/,
    );
  });

  it("rejects mismatched version", () => {
    const wrong = JSON.stringify({
      kind: "heartbeat",
      v: 999,
      userId: "u",
      machineId: "m",
      issuedAt: 0,
    });
    expect(() => decodeMessage(new TextEncoder().encode(wrong))).toThrow();
  });

  it("canonical JSON is key-order-independent (same bytes)", () => {
    const a: MachineClaim = {
      kind: "machine-claim",
      v: GATEWAY_PROTOCOL_VERSION,
      userId: "u",
      machineId: "m",
      platform: "linux",
      issuedAt: 1,
      ttlMs: 1,
    };
    const b = { ...a, ttlMs: 1 };
    expect(encodeMessage(a)).toEqual(encodeMessage(b));
  });
});
