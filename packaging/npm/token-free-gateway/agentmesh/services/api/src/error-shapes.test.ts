/**
 * Tests for 1-7 error message minimization helpers.
 *
 * Verifies:
 *   - formatZodError strips the path array (no schema-shape leak)
 *   - formatZodError still surfaces the first issue's message
 *   - formatZodError handles empty issues array
 *   - clientError sends a body with `error` and optional `requestId`
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { formatZodError, clientError } from "./error-shapes";

test("formatZodError: keeps first issue message, drops path array", () => {
  const out = formatZodError({
    issues: [{ path: ["knowledge", 0, "tags"], message: "Expected string, received number" }],
  });
  assert.equal(out, "knowledge.0.tags: Expected string, received number");
});

test("formatZodError: strips leading 'body' segment injected by Fastify parser", () => {
  const out = formatZodError({
    issues: [{ path: ["body", "knowledge", 0, "tags"], message: "Expected string, received number" }],
  });
  assert.equal(out, "knowledge.0.tags: Expected string, received number");
});

test("formatZodError: strips leading 'params' segment", () => {
  const out = formatZodError({
    issues: [{ path: ["params", "id"], message: "Invalid uuid" }],
  });
  assert.equal(out, "id: Invalid uuid");
});

test("formatZodError: strips leading 'querystring' segment", () => {
  const out = formatZodError({
    issues: [{ path: ["querystring", "limit"], message: "Expected number, received string" }],
  });
  assert.equal(out, "limit: Expected number, received string");
});

test("formatZodError: numeric path segments are stringified", () => {
  const out = formatZodError({
    issues: [{ path: ["items", 2, "name"], message: "Required" }],
  });
  assert.equal(out, "items.2.name: Required");
});

test("formatZodError: empty issues → 'Invalid request'", () => {
  assert.equal(formatZodError({ issues: [] }), "Invalid request");
});

test("formatZodError: top-level issue with empty path → message only", () => {
  const out = formatZodError({
    issues: [{ path: [], message: "Bad input" }],
  });
  assert.equal(out, "Bad input");
});

test("clientError: returns a body with error field", () => {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    code(n: number) {
      sent.status = n;
      return this;
    },
    send(b: unknown) {
      sent.body = b;
      return this;
    },
  } as never;
  clientError(reply, 400, "bad input");
  assert.equal(sent.status, 400);
  assert.deepEqual(sent.body, { error: "bad input" });
});

test("clientError: includes requestId when provided", () => {
  const sent: { status?: number; body?: unknown } = {};
  const reply = {
    code(n: number) {
      sent.status = n;
      return this;
    },
    send(b: unknown) {
      sent.body = b;
      return this;
    },
  } as never;
  clientError(reply, 500, "boom", "req-abc-123");
  assert.equal(sent.status, 500);
  assert.deepEqual(sent.body, { error: "boom", requestId: "req-abc-123" });
});
