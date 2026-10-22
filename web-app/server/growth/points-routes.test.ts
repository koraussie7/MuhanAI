blocl// points-routes.test.ts — End-to-end HTTP integration tests for growth endpoints.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../server.ts";

let baseUrl = "";
let serverHandle: import("node:http").Server | null = null;

before(async () => {
  const h = await startServer(0, "127.0.0.1");
  serverHandle = h.server;
  baseUrl = h.url;
});

after(() => {
  serverHandle?.close();
});

async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json };
}

describe("points endpoints", () => {
  test("GET balance on fresh user returns zeros", async () => {
    const r = await call("GET", "/api/points/balance/u-fresh");
    assert.equal(r.status, 200);
    assert.equal(r.body.balance.available, 0);
  });

  test("POST issue + balance + history", async () => {
    const issue = await call("POST", "/api/points/issue", {
      userId: "u-1", amount: 100, reason: "signup-bonus",
    });
    assert.equal(issue.status, 201);
    assert.equal(issue.body.entry.amount, 100);

    const bal = await call("GET", "/api/points/balance/u-1");
    assert.equal(bal.body.balance.available, 100);

    const hist = await call("GET", "/api/points/history/u-1");
    assert.equal(hist.body.entries.length, 1);
  });

  test("POST spend deducts; insufficient returns 402", async () => {
    await call("POST", "/api/points/issue", {
      userId: "u-2", amount: 50, reason: "admin-grant",
    });
    const ok = await call("POST", "/api/points/spend", {
      userId: "u-2", amount: 30, reason: "ai-chat",
    });
    assert.equal(ok.status, 200);
    const deny = await call("POST", "/api/points/spend", {
      userId: "u-2", amount: 999, reason: "ai-code",
    });
    assert.equal(deny.status, 402);
    assert.equal(deny.body.error.code, "insufficient_points");
  });

  test("POST transfer moves atomically", async () => {
    await call("POST", "/api/points/issue", {
      userId: "u-3", amount: 200, reason: "admin-grant",
    });
    const r = await call("POST", "/api/points/transfer", {
      fromUserId: "u-3", toUserId: "u-4", amount: 75, reason: "system-adjust",
    });
    assert.equal(r.status, 200);
    assert.equal(r.body.in.amount, 75);
    assert.equal(r.body.out.amount, -75);
    const bal3 = await call("GET", "/api/points/balance/u-3");
    const bal4 = await call("GET", "/api/points/balance/u-4");
    assert.equal(bal3.body.balance.available, 125);
    assert.equal(bal4.body.balance.available, 75);
  });

  test("idempotency key prevents double-issue", async () => {
    const key = "u-5-once";
    const a = await call("POST", "/api/points/issue", {
      userId: "u-5", amount: 100, reason: "signup-bonus", idempotencyKey: key,
    });
    assert.equal(a.status, 201);
    const b = await call("POST", "/api/points/issue", {
      userId: "u-5", amount: 100, reason: "signup-bonus", idempotencyKey: key,
    });
    assert.equal(b.status, 409);
    assert.equal(b.body.error.code, "duplicate_idempotency_key");
  });

  test("invalid input returns 400", async () => {
    const r = await call("POST", "/api/points/issue", { userId: "", amount: -1 });
    assert.equal(r.status, 400);
  });
});

describe("referral endpoints", () => {
  test("inviter gets a stable code", async () => {
    const c1 = await call("POST", "/api/referrals/code", { inviterId: "alice" });
    const c2 = await call("POST", "/api/referrals/code", { inviterId: "alice" });
    assert.equal(c1.body.code, c2.body.code);
    assert.match(c1.body.code, /^[A-HJ-NP-Z2-9]{8}$/);
  });

  test("signup creates edge + fires signup bonus", async () => {
    const c = await call("POST", "/api/referrals/code", { inviterId: "alice2" });
    const su = await call("POST", "/api/referrals/signup", {
      inviteeId: "bob", inviteCode: c.body.code,
    });
    assert.equal(su.status, 201);
    assert.equal(su.body.edge.inviterId, "alice2");
    assert.equal(su.body.edge.inviteeId, "bob");
    // signup bonus
    assert.equal(su.body.signupBonus.amount, 100);
  });

  test("activate fires inviter reward + first-AI bonus", async () => {
    const c = await call("POST", "/api/referrals/code", { inviterId: "alice3" });
    await call("POST", "/api/referrals/signup", {
      inviteeId: "carol", inviteCode: c.body.code,
    });
    const act = await call("POST", "/api/referrals/activate", { inviteeId: "carol" });
    assert.equal(act.status, 200);
    assert.equal(act.body.firstAiBonus.amount, 50);
    // inviter reward
    assert.ok(act.body.inviterReward);
    // check inviter's balance
    const bal = await call("GET", "/api/points/balance/alice3");
    assert.ok(bal.body.balance.available >= 300, "inviter got referral-activated reward");
  });

  test("stats report correct counts", async () => {
    const c = await call("POST", "/api/referrals/code", { inviterId: "alice4" });
    await call("POST", "/api/referrals/signup", { inviteeId: "u-x1", inviteCode: c.body.code });
    await call("POST", "/api/referrals/signup", { inviteeId: "u-x2", inviteCode: c.body.code });
    await call("POST", "/api/referrals/activate", { inviteeId: "u-x1" });
    const s = await call("GET", "/api/referrals/stats/alice4");
    assert.equal(s.body.stats.totalInvites, 2);
    assert.equal(s.body.stats.activated, 1);
    assert.equal(s.body.stats.activationRate, 0.5);
  });
});

describe("contribution endpoints", () => {
  test("submit + verify pays reward to contributor", async () => {
    const sub = await call("POST", "/api/contributions", {
      kind: "model-adapter",
      contributorId: "alice-c",
      title: "groq-llama3-adapter",
      artifact: "https://github.com/x/y",
    });
    assert.equal(sub.status, 201);
    assert.equal(sub.body.contribution.status, "pending");

    const ver = await call("POST", `/api/contributions/${sub.body.contribution.id}/verify`, {
      accept: true, notes: "lgtm", contributorReputation: 100,
    });
    assert.equal(ver.status, 200);
    assert.equal(ver.body.contribution.status, "verified");
    // base 500 × repMul(1.1) = 550
    assert.equal(ver.body.contribution.rewardIssued, 550);

    const bal = await call("GET", "/api/points/balance/alice-c");
    assert.equal(bal.body.balance.available, 550);
  });

  test("verify(reject) sets status=rejected with 0 reward", async () => {
    const sub = await call("POST", "/api/contributions", {
      kind: "tool-mcp-server",
      contributorId: "bob-c",
      title: "x",
      artifact: "y",
    });
    const ver = await call("POST", `/api/contributions/${sub.body.contribution.id}/verify`, {
      accept: false, notes: "duplicate",
    });
    assert.equal(ver.status, 200);
    assert.equal(ver.body.contribution.status, "rejected");
    assert.equal(ver.body.contribution.rewardIssued, 0);
  });

  test("use increments usageCount and triggers milestone bonus", async () => {
    const sub = await call("POST", "/api/contributions", {
      kind: "tool-mcp-server",
      contributorId: "carol-c",
      title: "x",
      artifact: "y",
    });
    await call("POST", `/api/contributions/${sub.body.contribution.id}/verify`, {
      accept: true, notes: "ok", contributorReputation: 0,
    });
    for (let i = 0; i < 100; i++) {
      await call("POST", `/api/contributions/${sub.body.contribution.id}/use`, {});
    }
    const bal = await call("GET", "/api/points/balance/carol-c");
    // base 200 + milestone 10 = 210
    assert.equal(bal.body.balance.available, 210);
  });

  test("list filters by contributor", async () => {
    await call("POST", "/api/contributions", {
      kind: "bug-report", contributorId: "dave-c", title: "x", artifact: "y",
    });
    const r = await call("GET", "/api/contributions?contributorId=dave-c");
    assert.equal(r.status, 200);
    assert.equal(r.body.contributions.length, 1);
  });
});

describe("growth tracking", () => {
  test("stats include retention + activity", async () => {
    await call("POST", "/api/growth/signup", { userId: "g-u1" });
    await call("POST", "/api/growth/signup", { userId: "g-u2" });
    await call("POST", "/api/growth/activity", { userId: "g-u1" });
    const r = await call("GET", "/api/growth/stats");
    assert.equal(r.status, 200);
    assert.ok(r.body.retention);
    assert.ok(r.body.retention.totalUsers >= 2);
    assert.ok(r.body.retention.aiUsageRate >= 0);
  });
});
