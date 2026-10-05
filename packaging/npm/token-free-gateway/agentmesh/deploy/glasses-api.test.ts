import assert from "node:assert/strict";
import { test } from "node:test";
import { handleGlassesApi } from "./glasses-api";

const ENV = {
	DEEPSEEK_API_KEY: "sk-test",
	GLM_API_KEY: "glm-test",
	GLASSES_DEVICE_SECRET: "test-secret",
};

test("glasses-api: /manifest returns complete endpoint catalog", async () => {
	const resp = await handleGlassesApi(
		new Request("https://test.com/api/glasses/v1/manifest"),
		"/api/glasses/v1/manifest",
		ENV,
	);
	assert.ok(resp, "manifest should return a response");
	assert.equal(resp.status, 200);
	const data = (await resp.json()) as any;
	assert.equal(data.apiVersion, "v1");
	assert.equal(data.endpoints.chat, "/api/glasses/v1/llm/chat");
	assert.equal(data.endpoints.vision, "/api/glasses/v1/llm/vision");
	assert.equal(data.endpoints.quorum, "/api/glasses/v1/quorum/ask");
	assert.equal(data.endpoints.knowledgeSearch, "/api/glasses/v1/knowledge/search");
	assert.equal(data.endpoints.knowledgePublish, "/api/glasses/v1/knowledge/publish");
	assert.equal(data.endpoints.telemetry, "/api/glasses/v1/telemetry");
	assert.equal(data.safety.onDeviceOnly, true);
	assert.deepEqual(data.safety.tasks, ["traffic-light", "crosswalk", "blind-path", "obstacle"]);
	assert.equal(data.rateLimits.chat.limit, 30);
	assert.equal(data.rateLimits.vision.limit, 6);
	assert.equal(data.rateLimits.quorum.limit, 6);
	assert.equal(data.rateLimits.knowledge.limit, 60);
});

test("glasses-api: OPTIONS returns 204 CORS preflight", async () => {
	const resp = await handleGlassesApi(
		new Request("https://test.com/api/glasses/v1/manifest", { method: "OPTIONS" }),
		"/api/glasses/v1/manifest",
		ENV,
	);
	assert.ok(resp);
	assert.equal(resp.status, 204);
});

test("glasses-api: POST /devices/register issues Bearer token", async () => {
	const resp = await handleGlassesApi(
		new Request("https://test.com/api/glasses/v1/devices/register", {
			method: "POST",
			body: JSON.stringify({ deviceId: "rokid-001", model: "Rokid Glass 2" }),
			headers: { "Content-Type": "application/json" },
		}),
		"/api/glasses/v1/devices/register",
		ENV,
	);
	assert.ok(resp);
	assert.equal(resp.status, 200);
	const data = (await resp.json()) as any;
	assert.equal(data.tokenType, "Bearer");
	assert.ok(data.access_token, "register should return access_token");
	assert.equal(data.expiresIn, 2592000);
});

test("glasses-api: auth-gated endpoint returns 401 without token", async () => {
	const resp = await handleGlassesApi(
		new Request("https://test.com/api/glasses/v1/llm/chat", {
			method: "POST",
			body: JSON.stringify({ mode: "chat", messages: [] }),
			headers: { "Content-Type": "application/json" },
		}),
		"/api/glasses/v1/llm/chat",
		ENV,
	);
	assert.ok(resp);
	assert.equal(resp.status, 401);
	const data = (await resp.json()) as any;
	assert.equal(data.error, "Unauthorized");
});

test("glasses-api: non-glasses routes return null", async () => {
	const resp = await handleGlassesApi(
		new Request("https://test.com/api/travel/search"),
		"/api/travel/search",
		ENV,
	);
	assert.equal(resp, null);
});

test("glasses-api: unknown glasses sub-path returns null", async () => {
	const resp = await handleGlassesApi(
		new Request("https://test.com/api/glasses/v1/unknown"),
		"/api/glasses/v1/unknown",
		ENV,
	);
	assert.equal(resp, null);
});

test("glasses-api: /manifest rejects invalid method (POST)", async () => {
	const resp = await handleGlassesApi(
		new Request("https://test.com/api/glasses/v1/manifest", {
			method: "POST",
			body: "{}",
			headers: { "Content-Type": "application/json" },
		}),
		"/api/glasses/v1/manifest",
		ENV,
	);
	assert.equal(resp, null);
});
