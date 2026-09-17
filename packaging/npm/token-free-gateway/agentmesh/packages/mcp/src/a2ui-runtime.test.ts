import { describe, expect, it } from "vitest";
import { applyA2UI, parseA2UIJsonl, validateA2UITree } from "./a2ui-runtime.js";

const JSONL = [
	JSON.stringify({ version: "v1.0", createSurface: { surfaceId: "s", catalogId: "basic" } }),
	JSON.stringify({
	version: "v1.0",
	updateDataModel: { surfaceId: "s", value: { title: "Hello" } },
	}),
	JSON.stringify({
	version: "v1.0",
	updateComponents: {
		surfaceId: "s",
	components: [
	{ id: "root", component: "Column", catalogId: "basic", children: ["title"] },
	{ id: "title", component: "Text", catalogId: "basic", text: { path: "/title" } },
	],
	},
	}),
	JSON.stringify({ version: "v1.0", beginRendering: { surfaceId: "s", root: "root" } }),
].join("\n");

describe("A2UI runtime", () => {
	it("parses, folds, and validates a streamed surface", () => {
		const state = applyA2UI(parseA2UIJsonl(JSONL));
		expect(state.status).toBe("ready");
		expect(state.data).toEqual({ title: "Hello" });
		expect(validateA2UITree(state)).toEqual({ valid: true, errors: [] });
	});

	it("rejects malformed JSONL and missing component fields", () => {
		expect(() => parseA2UIJsonl("not-json")).toThrow("invalid JSON");
		expect(() =>
			parseA2UIJsonl(
				JSON.stringify({
					version: "v1.0",
					updateComponents: { surfaceId: "s", components: [{ id: "root" }] },
				}),
			),
		).toThrow("component 0 needs a component name");
	});

	it("detects cycles and missing children", () => {
		const state = applyA2UI(
			parseA2UIJsonl(
				[
					JSON.stringify({ version: "v1.0", createSurface: { surfaceId: "s", catalogId: "basic" } }),
					JSON.stringify({
						version: "v1.0",
						updateComponents: {
							surfaceId: "s",
							components: [
								{ id: "root", component: "Column", catalogId: "basic", children: ["root", "missing"] },
							],
						},
					}),
					JSON.stringify({ version: "v1.0", beginRendering: { surfaceId: "s", root: "root" } }),
				].join("\n"),
			),
		);
		const result = validateA2UITree(state);
		expect(result.valid).toBe(false);
		expect(result.errors).toContain("component cycle detected at: root");
		expect(result.errors).toContain("component root: missing child missing");
	});
});
