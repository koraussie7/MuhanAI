import assert from "node:assert/strict";
import { test } from "node:test";
import {
	answerWithBitterbot,
	clearBitterbotHistory,
	loadBitterbotHistory,
	saveBitterbotHistory,
	type BitterbotMessage,
} from "./bitterbot-engine.js";

const userMessage: BitterbotMessage = {
	id: "user-1",
	role: "user",
	content: "안녕하세요",
	createdAt: 1,
};

test("Bitterbot returns an honest offline response when providers fail", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () => {
	throw new Error("provider unavailable");
	}) as unknown as typeof fetch;
	try {
	const response = await answerWithBitterbot([userMessage]);
	assert.ok(response);
	assert.equal(response.provider, "bitterbot-offline");
	assert.match(response.text, /안녕하세요/);
	} finally {
	globalThis.fetch = originalFetch;
	}
});

test("Bitterbot can disable the offline fallback", async () => {
	const originalFetch = globalThis.fetch;
	globalThis.fetch = (async () => {
	throw new Error("provider unavailable");
	}) as unknown as typeof fetch;
	try {
	const response = await answerWithBitterbot([userMessage], { allowOffline: false });
	assert.equal(response, null);
	} finally {
	globalThis.fetch = originalFetch;
	}
});

test("Bitterbot history storage is bounded and clearable", () => {
	const store = new Map<string, string>();
	const originalStorage = globalThis.localStorage;
	Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: {
	getItem: (key: string) => store.get(key) ?? null,
	setItem: (key: string, value: string) => store.set(key, value),
	removeItem: (key: string) => store.delete(key),
	},
	});
	try {
		saveBitterbotHistory(Array.from({ length: 50 }, (_, index) => ({ ...userMessage, id: `user-${index}` })));
	assert.equal(loadBitterbotHistory().length, 40);
	clearBitterbotHistory();
	assert.deepEqual(loadBitterbotHistory(), []);
	} finally {
	Object.defineProperty(globalThis, "localStorage", {
	configurable: true,
	value: originalStorage,
	});
	}
});
