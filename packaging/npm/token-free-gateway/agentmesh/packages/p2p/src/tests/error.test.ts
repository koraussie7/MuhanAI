import { describe, it, expect } from "vitest";
import { makeErr, TransportErrorKind } from "../error.js";

describe("transport errors", () => {
  it("captures kind, message, and cause", () => {
    const cause = new Error("boom");
    const e = makeErr(TransportErrorKind.InitFailed, "node failed", cause);
    expect(e.kind).toBe(TransportErrorKind.InitFailed);
    expect(e.message).toBe("node failed");
    expect(e.cause).toBe(cause);
  });
});
