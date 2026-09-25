import { beforeEach, describe, expect, it } from "vitest";
import {
	formatPeerCountBare,
	ingestApiPayload,
	isDemo,
	PLACEHOLDER,
	setApiDemoFlag,
} from "./mesh-stats.js";

beforeEach(() => setApiDemoFlag(false));

describe("mesh-stats", () => {
	it("shows placeholder when no count and not demo", () => {
		expect(formatPeerCountBare(undefined)).toBe(PLACEHOLDER);
	});

	it("uses API _demo flag", () => {
		ingestApiPayload({ _demo: true });
		expect(isDemo()).toBe(true);
		expect(formatPeerCountBare(undefined)).toMatch(/12,482.*demo/);
	});

	it("formats live count without demo suffix", () => {
		setApiDemoFlag(false);
		expect(formatPeerCountBare(4)).toBe("4");
	});
});
