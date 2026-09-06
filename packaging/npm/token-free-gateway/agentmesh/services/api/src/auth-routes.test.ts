import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { pino } from "pino";
import { buildApp } from "./server.js";

describe("auth routes", () => {
  const originalEnv = { ...process.env };
  let app: Awaited<ReturnType<typeof buildApp>> | undefined;

  beforeEach(async () => {
    process.env.DISABLE_AUTH = "true";
    process.env.NODE_ENV = "development";
    app = await buildApp({ logger: pino({ level: "silent" }) });
  });

  afterEach(async () => {
    if (app) {
      await app.close();
      app = undefined;
    }
    process.env = { ...originalEnv };
  });

  it("registers a user and returns a token", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "test@example.com", name: "Tester", password: "password-123" },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe("test@example.com");
  });

  it("rejects duplicate registration", async () => {
    await app!.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "dup@example.com", password: "password-123" },
    });
    const second = await app!.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "dup@example.com", password: "password-456" },
    });
    expect(second.statusCode).toBe(409);
  });

  it("rejects invalid register payloads", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "not-an-email", password: "short" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("email");
  });

  it("logs in and validates /me", async () => {
    await app!.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { email: "login@example.com", password: "password-123" },
    });

    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "login@example.com", password: "password-123" },
    });
    expect(loginRes.statusCode).toBe(200);
    const { token } = loginRes.json();

    const meRes = await app!.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(meRes.statusCode).toBe(200);
    expect(meRes.json().user.email).toBe("login@example.com");
  });

  it("rejects /me without a token", async () => {
    const res = await app!.inject({ method: "GET", url: "/api/auth/me" });
    expect(res.statusCode).toBe(401);
  });

  it("rejects /me with a tampered token", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: "Bearer abcdef.ghijkl" },
    });
    expect(res.statusCode).toBe(401);
  });
});