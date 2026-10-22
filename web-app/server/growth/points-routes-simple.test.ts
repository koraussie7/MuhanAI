// points-routes-simple.test.ts — Simple integration test for growth endpoints
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../server.ts";

let baseUrl = "";
let serverHandle = null;

before(async () => {
  const h = await startServer(4320, "127.0.0.1");
  serverHandle = h.server;
  baseUrl = h.url;
  console.log("Server started at:", baseUrl);
});

after(() => {
  serverHandle?.close();
});

async function callHttp(method, path, body) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

test("health check", async () => {
  const r = await callHttp("GET", "/health");
  console.log("Health check:", r.status, r.body);
  assert.equal(r.status, 200);
});

test("points: GET balance on fresh user returns zeros", async () => {
  const r = await callHttp("GET", "/api/points/balance/u-fresh");
  console.log("Balance:", r.status, r.body);
  assert.equal(r.status, 200);
  assert.equal(r.body.balance.available, 0);
});

test("points: POST issue + balance + history", async () => {
  const issue = await callHttp("POST", "/api/points/issue", {
    userId: "u-1", amount: 100, reason: "signup-bonus",
  });
  assert.equal(issue.status, 201);
  assert.equal(issue.body.entry.amount, 100);

  const bal = await callHttp("GET", "/api/points/balance/u-1");
  assert.equal(bal.body.balance.available, 100);

  const hist = await callHttp("GET", "/api/points/history/u-1");
  assert.equal(hist.body.entries.length, 1);
});

test("points: POST spend deducts; insufficient returns 402", async () => {
  await callHttp("POST", "/api/points/issue", {
    userId: "u-2", amount: 50, reason: "admin-grant",
  });
  const ok = await callHttp("POST", "/api/points/spend", {
    userId: "u-2", amount: 30, reason: "ai-chat",
  });
  assert.equal(ok.status, 200);
  const deny = await callHttp("POST", "/api/points/spend", {
    userId: "u-2", amount: 999, reason: "ai-code",
  });
  assert.equal(deny.status, 402);
  assert.equal(deny.body.error.code, "insufficient_points");
});

test("points: POST transfer moves atomically", async () => {
  await callHttp("POST", "/api/points/issue", {
    userId: "u-3", amount: 200, reason: "admin-grant",
  });
  const r = await callHttp("POST", "/api/points/transfer", {
    fromUserId: "u-3", toUserId: "u-4", amount: 75, reason: "system-adjust",
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.in.amount, 75);
  assert.equal(r.body.out.amount, -75);
  const bal3 = await callHttp("GET", "/api/points/balance/u-3");
  const bal4 = await callHttp("GET", "/api/points/balance/u-4");
  assert.equal(bal3.body.balance.available, 125);
  assert.equal(bal4.body.balance.available, 75);
});

test("points: idempotency key prevents double-issue", async () => {
  const key = "u-5-once";
  const a = await callHttp("POST", "/api/points/issue", {
    userId: "u-5", amount: 100, reason: "signup-bonus", idempotencyKey: key,
  });
  assert.equal(a.status, 201);
  const b = await callHttp("POST", "/api/points/issue", {
    userId: "u-5", amount: 100, reason: "signup-bonus", idempotencyKey: key,
  });
  assert.equal(b.status, 409);
  assert.equal(b.body.error.code, "duplicate_idempotency_key");
});

test("points: invalid input returns 400", async () => {
  const r = await callHttp("POST", "/api/points/issue", { userId: "", amount: -1 });
  assert.equal(r.status, 400);
});