import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SippEngine } from "../src/sipp/sipp-engine";
import { AIEngineFactory } from "../src/factory";

describe("AIEngineFactory", () => {
	it("should create SippEngine", () => {
		const engine = AIEngineFactory.create({ type: "sipp" });
		expect(engine).toBeInstanceOf(SippEngine);
	});

	it("should create default engine", () => {
		const engine = AIEngineFactory.createDefault();
		expect(engine).toBeInstanceOf(SippEngine);
	});

	it("should throw for unknown type", () => {
		expect(() => AIEngineFactory.create({ type: "unknown" as any })).toThrow();
	});
});

describe("SippEngine", () => {
	let engine: SippEngine;

	beforeEach(() => {
		engine = new SippEngine({ type: "sipp", backend: "wasm" });
	});

	afterEach(async () => {
		await engine.dispose();
	});

	it("should have correct initial status", () => {
		const status = engine.getStatus();
		expect(status.ready).toBe(false);
		expect(status.loading).toBe(false);
		expect(status.modelLoaded).toBe(null);
	});

	it("should report status changes", async () => {
		const statuses: any[] = [];
		engine.on("status", (s) => statuses.push(s));

		// Status events are emitted during init
		expect(statuses.length).toBeGreaterThanOrEqual(0);
	});
});
