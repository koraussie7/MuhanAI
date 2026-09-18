import { afterEach, describe, expect, it } from "vitest";
import { maybeCompressPrompt } from "./pythia-routes.js";

const longText = "x".repeat(1200);

describe("maybeCompressPrompt", () => {
	afterEach(() => {
		delete process.env.PYTHIA_COMPRESS;
	});

	it("leaves short prompts untouched", async () => {
		const res = await maybeCompressPrompt("short prompt");
		expect(res.compressed).toBe(false);
		expect(res.text).toBe("short prompt");
	});

	it("uses the injected compressor for long prompts", async () => {
		let called = 0;
		const res = await maybeCompressPrompt(longText, {
			compressPrompt: async ({ text }) => {
				called += 1;
				expect(text).toBe(longText);
				return { compressed: text.slice(0, 100), ratio: 0.1 };
			},
		});
		expect(called).toBe(1);
		expect(res.compressed).toBe(true);
		expect(res.text).toBe(longText.slice(0, 100));
	});

	it("falls back to the original text when compression makes no progress", async () => {
		const res = await maybeCompressPrompt(longText, {
			compressPrompt: async ({ text }) => ({ compressed: text, ratio: 1 }),
		});
		expect(res.compressed).toBe(false);
		expect(res.text).toBe(longText);
	});

	it("degrades silently when the compressor throws", async () => {
		const res = await maybeCompressPrompt(longText, {
			compressPrompt: async () => {
				throw new Error("boom");
			},
		});
		expect(res.compressed).toBe(false);
		expect(res.text).toBe(longText);
	});

	it("honors PYTHIA_COMPRESS=off", async () => {
		process.env.PYTHIA_COMPRESS = "off";
		const res = await maybeCompressPrompt(longText, {
			compressPrompt: async () => ({ compressed: "tiny", ratio: 0.01 }),
		});
		expect(res.compressed).toBe(false);
		expect(res.text).toBe(longText);
	});
});
