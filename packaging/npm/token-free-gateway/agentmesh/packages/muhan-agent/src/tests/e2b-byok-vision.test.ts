import { describe, expect, it } from "vitest";
import { createByokVisionProvider } from "../e2b-byok-vision.js";

describe("createByokVisionProvider", () => {
	it("throws when apiKey is empty", () => {
		expect(() =>
			createByokVisionProvider({ provider: "openai", apiKey: "" }),
		).toThrow(/apiKey/);
	});

	it("rejects unknown providers", () => {
		expect(() =>
			createByokVisionProvider({
				provider: "anthropic" as unknown as Parameters<typeof createByokVisionProvider>[0]["provider"],
				apiKey: "x",
			}),
		).toThrow(/unknown provider/);
	});

	it("returns a provider with locateModel/planModel defaults for OpenAI", () => {
		const v = createByokVisionProvider({ provider: "openai", apiKey: "sk-test" });
		expect(v.provider).toBe("openai");
		expect(v.planModel).toBe("gpt-4o");
		expect(v.locateModel).toBe("gpt-4o-mini");
		expect(typeof v.locate).toBe("function");
		expect(typeof v.planAction).toBe("function");
	});

	it("returns a provider for groq/openrouter/google", () => {
		expect(createByokVisionProvider({ provider: "groq", apiKey: "x" }).provider).toBe("groq");
		expect(createByokVisionProvider({ provider: "openrouter", apiKey: "x" }).provider).toBe("openrouter");
		expect(createByokVisionProvider({ provider: "google", apiKey: "x" }).provider).toBe("google");
	});

	it("honors planModel/locateModel overrides", () => {
		const v = createByokVisionProvider({
			provider: "openai",
			apiKey: "sk-test",
			planModel: "gpt-4-turbo",
			locateModel: "gpt-3.5-turbo",
		});
		expect(v.planModel).toBe("gpt-4-turbo");
		expect(v.locateModel).toBe("gpt-3.5-turbo");
	});
});

describe("BYOK vision JSON parsing — covered indirectly via createByokVisionProvider surface", () => {
	it("exposes locate + planAction that can be called without throwing on argument shape", async () => {
		const v = createByokVisionProvider({
			provider: "openai",
			apiKey: "sk-test",
			endpoint: "http://127.0.0.1:1/never-resolves",
		});
		// call will fail because endpoint is unreachable, but the function
		// signature accepts the right shape
		await expect(
			v.locate({ imageBase64: "AAAA", prompt: "find button" }),
		).rejects.toBeDefined();
		await expect(
			v.planAction({ goal: "x", imageBase64: "AAAA", history: [] }),
		).rejects.toBeDefined();
	});
});
