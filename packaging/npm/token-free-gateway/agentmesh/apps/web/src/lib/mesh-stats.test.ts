import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import {
	formatPeerCountBare,
	ingestApiPayload,
	isDemo,
	PLACEHOLDER,
	setApiDemoFlag,
} from "./mesh-stats.js";

beforeEach(() => setApiDemoFlag(false));

describe("mesh-stats", () => {
	test("shows placeholder when no count and not demo", () => {
		assert.equal(formatPeerCountBare(undefined), PLACEHOLDER);
	});

	test("uses API _demo flag", () => {
		ingestApiPayload({ _demo: true });
		assert.equal(isDemo(), true);
		assert.match(formatPeerCountBare(undefined), /12,482.*demo/);
	});

	test("formats live count without demo suffix", () => {
		setApiDemoFlag(false);
		assert.equal(formatPeerCountBare(4), "4");
	});
});
