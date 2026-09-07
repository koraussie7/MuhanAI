/**
 * Unit tests for the CosmicCanvas physics module.
 *
 * Run with: `node --import tsx --test src/components/find/physics.test.ts`
 *
 * Uses Node 20+'s built-in `node:test` runner and `node:assert/strict` —
 * no test-framework dependency is added to the package. The physics
 * module is intentionally pure (no DOM, no React, no canvas) so it
 * exercises directly under Node.
 */

import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
	applyRepulsion,
	applySprings,
	computeZoom,
	findNodeAt,
	INTEGRATION_DAMPING,
	integrate,
	isNodeVisible,
	REPULSION_GAIN,
	REPULSION_SOFTENING,
	SPRING_STIFFNESS,
	screenToWorld,
	step,
} from "./physics";
import type { CosmicEdge, CosmicNode } from "./types";

// ------------------- Test fixtures -------------------

function makeNode(overrides: Partial<CosmicNode> = {}): CosmicNode {
	return {
		id: "n",
		label: "Node",
		type: "note",
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		radius: 10,
		frontmatter: {
			title: "Untitled",
			author: "anon",
			created: "2026-01-01",
			tags: [],
			links: [],
			summary: "",
			markdown: "",
		},
		...overrides,
	};
}

function makeEdge(id: string, source: string, target: string, weight = 1.0): CosmicEdge {
	return { id, source, target, weight };
}

// ------------------- Repulsion -------------------

describe("applyRepulsion", () => {
	test("two distant nodes push each other apart", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const b = makeNode({ id: "b", x: 100, y: 0 });
		applyRepulsion([a, b], 1.0, null);
		// b is to the right of a, so a is pushed left (vx < 0), b pushed right (vx > 0)
		assert.ok(a.vx < 0, `a.vx should be negative (got ${a.vx})`);
		assert.ok(b.vx > 0, `b.vx should be positive (got ${b.vx})`);
		assert.equal(a.vy, 0);
		assert.equal(b.vy, 0);
	});

	test("force scales with repelStrength", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const b = makeNode({ id: "b", x: 100, y: 0 });
		applyRepulsion([a, b], 1.0, null);
		const vxLow = a.vx;
		a.vx = 0;
		b.vx = 0;
		applyRepulsion([a, b], 2.0, null);
		const vxHigh = a.vx;
		assert.ok(Math.abs(vxHigh) > Math.abs(vxLow), `2x repel should produce stronger force than 1x`);
	});

	test("force falls off with distance (1/r²-like)", () => {
		const close = makeNode({ id: "c1", x: 0, y: 0 });
		const closeB = makeNode({ id: "c2", x: 50, y: 0 });
		applyRepulsion([close, closeB], 1.0, null);
		const closeVx = close.vx;

		const far = makeNode({ id: "f1", x: 0, y: 0 });
		const farB = makeNode({ id: "f2", x: 200, y: 0 });
		applyRepulsion([far, farB], 1.0, null);
		const farVx = far.vx;

		assert.ok(Math.abs(closeVx) > Math.abs(farVx), `closer pair should repel more strongly`);
	});

	test("pinned node does not move", () => {
		const a = makeNode({ id: "a", x: 0, y: 0, pinned: true });
		const b = makeNode({ id: "b", x: 100, y: 0 });
		applyRepulsion([a, b], 1.0, null);
		assert.equal(a.vx, 0);
		assert.equal(a.vy, 0);
		assert.ok(b.vx > 0);
	});

	test("dragged node is excluded from force integration", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const b = makeNode({ id: "b", x: 100, y: 0 });
		applyRepulsion([a, b], 1.0, a);
		assert.equal(a.vx, 0);
		assert.equal(a.vy, 0);
		assert.ok(b.vx > 0, "non-dragged node still moves");
	});

	test("co-located nodes don't produce NaN (softening)", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const b = makeNode({ id: "b", x: 0, y: 0 });
		applyRepulsion([a, b], 1.0, null);
		assert.ok(Number.isFinite(a.vx), `a.vx should be finite (got ${a.vx})`);
		assert.ok(Number.isFinite(a.vy), `a.vy should be finite (got ${a.vy})`);
	});
});

// ------------------- Springs -------------------

describe("applySprings", () => {
	test("stretched edge pulls endpoints together", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const b = makeNode({ id: "b", x: 500, y: 0 });
		const edge = makeEdge("e1", "a", "b");
		applySprings([a, b], [edge], 100, null);
		// a (at 0,0) is pulled toward b (at 500,0), so a.vx > 0
		// b (at 500,0) is pulled toward a (at 0,0), so b.vx < 0
		assert.ok(a.vx > 0, `a should be pulled right (got ${a.vx})`);
		assert.ok(b.vx < 0, `b should be pulled left (got ${b.vx})`);
	});

	test("compressed edge pushes endpoints apart", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const b = makeNode({ id: "b", x: 50, y: 0 });
		const edge = makeEdge("e1", "a", "b");
		applySprings([a, b], [edge], 200, null);
		assert.ok(a.vx < 0, `a should be pushed left (got ${a.vx})`);
		assert.ok(b.vx > 0, `b should be pushed right (got ${b.vx})`);
	});

	test("edges with missing endpoints are skipped", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const edge = makeEdge("orphan", "a", "ghost");
		applySprings([a], [edge], 100, null);
		assert.equal(a.vx, 0);
		assert.equal(a.vy, 0);
	});

	test("edge weight scales rest length", () => {
		const a = makeNode({ id: "a", x: 0, y: 0 });
		const b = makeNode({ id: "b", x: 100, y: 0 });
		const edge = makeEdge("e1", "a", "b", 2.0);
		applySprings([a, b], [edge], 100, null);
		// rest length is 100*2 = 200; current dist 100 is "compressed" → repel
		assert.ok(a.vx < 0, `a should be pushed away when rest length > dist (got ${a.vx})`);
	});

	test("pinned endpoints are not accelerated", () => {
		const a = makeNode({ id: "a", x: 0, y: 0, pinned: true });
		const b = makeNode({ id: "b", x: 500, y: 0 });
		const edge = makeEdge("e1", "a", "b");
		applySprings([a, b], [edge], 100, null);
		assert.equal(a.vx, 0);
		assert.ok(b.vx < 0);
	});
});

// ------------------- Integration -------------------

describe("integrate", () => {
	test("applies damping each step", () => {
		const n = makeNode({ id: "n", x: 0, y: 0, vx: 100, vy: 0 });
		integrate([n], 0.0, null);
		assert.ok(Math.abs(n.vx) < 100, `vx should be damped (got ${n.vx})`);
		assert.ok(Math.abs(n.vx) > 0, `vx should still be nonzero mid-step (got ${n.vx})`);
	});

	test("zero gravity → vx decays but x changes by vx", () => {
		const n = makeNode({ id: "n", x: 0, y: 0, vx: 100, vy: 0 });
		integrate([n], 0.0, null);
		assert.ok(n.x > 0, `x should advance by vx (got ${n.x})`);
	});

	test("nonzero gravity pulls node toward origin", () => {
		const n = makeNode({ id: "n", x: 1000, y: 0, vx: 0, vy: 0 });
		integrate([n], 1.0, null);
		assert.ok(n.vx < 0, `vx should become negative (toward origin, got ${n.vx})`);
	});

	test("pinned node velocity is zeroed, position frozen", () => {
		const n = makeNode({
			id: "n",
			x: 500,
			y: 500,
			vx: 50,
			vy: 50,
			pinned: true,
		});
		integrate([n], 1.0, null);
		assert.equal(n.vx, 0);
		assert.equal(n.vy, 0);
		assert.equal(n.x, 500);
		assert.equal(n.y, 500);
	});

	test("dragged node velocity is zeroed, position frozen", () => {
		const n = makeNode({ id: "n", x: 100, y: 100, vx: 25, vy: 25 });
		integrate([n], 1.0, n);
		assert.equal(n.vx, 0);
		assert.equal(n.vy, 0);
		assert.equal(n.x, 100);
		assert.equal(n.y, 100);
	});

	test("constants match expected values (regression guard)", () => {
		assert.equal(REPULSION_SOFTENING, 400);
		assert.equal(REPULSION_GAIN, 2500);
		assert.equal(SPRING_STIFFNESS, 0.025);
		assert.equal(INTEGRATION_DAMPING, 0.88);
	});
});

// ------------------- step (composed) -------------------

describe("step", () => {
	test("composed: repulsion, springs, and integration in one call", () => {
		const a = makeNode({ id: "a", x: 0, y: 0, vx: 10, vy: 0 });
		const b = makeNode({ id: "b", x: 100, y: 0 });
		const edge = makeEdge("e1", "a", "b");
		const before = { ax: a.x, ay: a.y };
		step([a, b], [edge], {
			repelStrength: 1.0,
			linkDistance: 100,
			centerGravity: 0.0,
			draggedNode: null,
		});
		assert.ok(a.x !== before.ax || a.y !== before.ay, `a should move after one step`);
	});

	test("multiple nodes: O(n²) repulsion still terminates without NaN", () => {
		const nodes: CosmicNode[] = [];
		for (let i = 0; i < 20; i++) {
			nodes.push(makeNode({ id: `n${i}`, x: i * 10, y: i * 5 }));
		}
		step(nodes, [], {
			repelStrength: 1.0,
			linkDistance: 100,
			centerGravity: 0.5,
			draggedNode: null,
		});
		for (const n of nodes) {
			assert.ok(Number.isFinite(n.vx));
			assert.ok(Number.isFinite(n.vy));
			assert.ok(Number.isFinite(n.x));
			assert.ok(Number.isFinite(n.y));
		}
	});
});

// ------------------- Visibility filter -------------------

describe("isNodeVisible", () => {
	const filters = {
		core: true,
		agent: true,
		peer: true,
		note: true,
		tag: true,
	};

	test("no query, filter on → visible", () => {
		const n = makeNode({ id: "n", type: "note" });
		assert.equal(isNodeVisible(n, filters, ""), true);
	});

	test("no query, filter off → hidden", () => {
		const n = makeNode({ id: "n", type: "note" });
		const f = { ...filters, note: false };
		assert.equal(isNodeVisible(n, f, ""), false);
	});

	test("query matches label", () => {
		const n = makeNode({ id: "n", label: "Hello World" });
		assert.equal(isNodeVisible(n, filters, "hello"), true);
	});

	test("query matches title", () => {
		const n = makeNode({
			id: "n",
			frontmatter: { ...makeNode().frontmatter, title: "Cosmic Mesh" },
		});
		assert.equal(isNodeVisible(n, filters, "cosmic"), true);
	});

	test("query matches tag", () => {
		const n = makeNode({
			id: "n",
			frontmatter: { ...makeNode().frontmatter, tags: ["alpha", "beta"] },
		});
		assert.equal(isNodeVisible(n, filters, "beta"), true);
	});

	test("query is case-insensitive", () => {
		const n = makeNode({ id: "n", label: "MixedCase" });
		assert.equal(isNodeVisible(n, filters, "mixedcase"), true);
		assert.equal(isNodeVisible(n, filters, "MIXEDCASE"), true);
	});

	test("query with surrounding whitespace still matches", () => {
		const n = makeNode({ id: "n", label: "Hello" });
		assert.equal(isNodeVisible(n, filters, "  hello  "), true);
	});

	test("query with no match → hidden", () => {
		const n = makeNode({
			id: "n",
			label: "Hello",
			frontmatter: { ...makeNode().frontmatter, title: "World", tags: [] },
		});
		assert.equal(isNodeVisible(n, filters, "xyzzy"), false);
	});

	test("filter off beats query match", () => {
		const n = makeNode({ id: "n", type: "note", label: "matchable" });
		const f = { ...filters, note: false };
		assert.equal(isNodeVisible(n, f, "matchable"), false);
	});
});

// ------------------- Hit testing -------------------

describe("findNodeAt", () => {
	test("hit within radius", () => {
		const n = makeNode({ id: "n", x: 100, y: 100, radius: 10 });
		assert.equal(findNodeAt([n], 105, 105, 16), n);
	});

	test("miss outside tolerance", () => {
		const n = makeNode({ id: "n", x: 100, y: 100, radius: 10 });
		assert.equal(findNodeAt([n], 500, 500, 16), null);
	});

	test("tolerance widens hit area", () => {
		const n = makeNode({ id: "n", x: 0, y: 0, radius: 5 });
		// hitRadius = 5 + 16 = 21, so 15 is inside, 30 is outside
		assert.equal(findNodeAt([n], 15, 0, 16), n);
		assert.equal(findNodeAt([n], 30, 0, 16), null);
	});

	test("returns topmost node when overlapping (last in array wins)", () => {
		const bottom = makeNode({ id: "bottom", x: 0, y: 0, radius: 10 });
		const top = makeNode({ id: "top", x: 1, y: 1, radius: 10 });
		assert.equal(findNodeAt([bottom, top], 0, 0, 16), top);
	});

	test("empty list returns null", () => {
		assert.equal(findNodeAt([], 0, 0, 16), null);
	});
});

// ------------------- Coordinate conversion -------------------

describe("screenToWorld", () => {
	test("identity at center, no camera offset, zoom=1", () => {
		assert.deepEqual(screenToWorld(500, 500, { cx: 500, cy: 500 }, { x: 0, y: 0, zoom: 1 }), {
			x: 0,
			y: 0,
		});
	});

	test("zoom=2 shrinks the world units", () => {
		assert.deepEqual(screenToWorld(600, 500, { cx: 500, cy: 500 }, { x: 0, y: 0, zoom: 2 }), {
			x: 50,
			y: 0,
		});
	});

	test("camera offset translates the world", () => {
		assert.deepEqual(screenToWorld(500, 500, { cx: 500, cy: 500 }, { x: 100, y: 50, zoom: 1 }), {
			x: -100,
			y: -50,
		});
	});
});

// ------------------- Zoom anchor -------------------

describe("computeZoom", () => {
	test("scroll up (deltaY<0) zooms in", () => {
		const cam = { x: 0, y: 0, zoom: 1 };
		const next = computeZoom(cam, 500, 500, -100, { cx: 500, cy: 500 });
		assert.ok(next.zoom > cam.zoom);
	});

	test("scroll down (deltaY>0) zooms out", () => {
		const cam = { x: 0, y: 0, zoom: 1 };
		const next = computeZoom(cam, 500, 500, 100, { cx: 500, cy: 500 });
		assert.ok(next.zoom < cam.zoom);
	});

	test("zoom is clamped to bounds", () => {
		const cam = { x: 0, y: 0, zoom: 0.3 };
		assert.equal(computeZoom(cam, 0, 0, 100, { cx: 0, cy: 0 }).zoom, 0.3);
		const cam2 = { x: 0, y: 0, zoom: 3.5 };
		assert.equal(computeZoom(cam2, 0, 0, -100, { cx: 0, cy: 0 }).zoom, 3.5);
	});

	test("anchor zoom keeps the world point under the cursor stable", () => {
		// Given a cursor at screen (700, 500), the world point under it must
		// not change between the old and new camera states.
		const cam = { x: 0, y: 0, zoom: 1 };
		const sx = 700,
			sy = 500;
		const cx = 500,
			cy = 500;
		const worldBefore = screenToWorld(sx, sy, { cx, cy }, cam);
		const next = computeZoom(cam, sx, sy, -100, { cx, cy });
		const worldAfter = screenToWorld(sx, sy, { cx, cy }, next);
		assert.ok(
			Math.abs(worldBefore.x - worldAfter.x) < 1e-9,
			`world.x drift: ${worldBefore.x} → ${worldAfter.x}`,
		);
		assert.ok(
			Math.abs(worldBefore.y - worldAfter.y) < 1e-9,
			`world.y drift: ${worldBefore.y} → ${worldAfter.y}`,
		);
	});
});
