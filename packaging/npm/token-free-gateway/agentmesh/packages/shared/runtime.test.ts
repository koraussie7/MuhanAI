/**
 * Tests for 2-1 Bun/Node runtime abstraction.
 *
 * The Node backend is exercised here (we are running under tsx/Node). The
 * Bun path is verified by reading the resolved runtime export — under a
 * Bun-only process it would be "bun", under Node it is "node".
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, runtime } from "./runtime.js";

test("runtime: reports node under tsx", () => {
  assert.equal(runtime, "node");
});

test("spawn: executes 'echo hello' and captures stdout", async () => {
  const proc = await spawn(["echo", "hello"], { stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
  assert.equal(code, 0);
  assert.equal(out, "hello\n");
  assert.equal(err, "");
});

test("spawn: captures stderr separately", async () => {
  // `node -e` writes to stderr intentionally.
  const proc = await spawn(
    [process.execPath, "-e", "process.stderr.write('oops\\n')"],
    { stdout: "pipe", stderr: "pipe" }
  );
  const [out, err, code] = await Promise.all([proc.stdout, proc.stderr, proc.exitCode]);
  assert.equal(code, 0);
  assert.equal(out, "");
  assert.equal(err, "oops\n");
});

test("spawn: returns non-zero exit code on failure", async () => {
  // `false` is a unix builtin that always exits 1. Avoids relying on
  // process.exit() semantics which differ across shells and Node versions.
  const proc = await spawn(["false"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exitCode;
  assert.notEqual(code, 0);
});

test("spawn: 'ignore' stdout option yields empty string", async () => {
  const proc = await spawn(["echo", "ignored"], { stdout: "ignore", stderr: "ignore" });
  const [out, code] = await Promise.all([proc.stdout, proc.exitCode]);
  assert.equal(code, 0);
  assert.equal(out, "");
});
