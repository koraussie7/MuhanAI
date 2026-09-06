/**
 * Pure graph-physics primitives for CosmicCanvas.
 *
 * These functions are deliberately decoupled from React, the DOM, and the
 * canvas context — they only mutate node/edge coordinates and velocity
 * vectors — so they can be exercised in plain Node test runners without
 * a DOM. The render loop in CosmicCanvas calls into this module once
 * per animation frame.
 *
 * Invariants:
 *   - pinned nodes are excluded from force integration
 *   - the active dragged node is excluded from force integration
 *   - repulsion uses an O(n²) loop; fine for ≤ a few hundred nodes
 *   - all positions/velocities are mutated in place for zero allocation
 */

import type { CosmicNode, CosmicEdge } from "./types";

/** Softening constant to prevent division by zero when two nodes coincide. */
export const REPULSION_SOFTENING = 400;

/** Repulsion coefficient — multiplied by `repelStrength` and divided by distSq. */
export const REPULSION_GAIN = 2500;

/** Spring stiffness along edges. */
export const SPRING_STIFFNESS = 0.025;

/** Velocity damping per integration step (friction). */
export const INTEGRATION_DAMPING = 0.88;

/** Gravity coefficient pulling nodes back toward (0, 0). */
export const GRAVITY_GAIN = 0.0006;

/**
 * Compute repulsion forces between every pair of nodes and accumulate
 * them into each node's velocity vector. Pinned/dragged nodes are skipped.
 */
export function applyRepulsion(
  nodes: CosmicNode[],
  repelStrength: number,
  draggedNode: CosmicNode | null,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    if (!a) continue;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      if (!b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy + REPULSION_SOFTENING;
      const dist = Math.sqrt(distSq);
      const force = (repelStrength * REPULSION_GAIN) / distSq;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!a.pinned && a !== draggedNode) {
        a.vx -= fx;
        a.vy -= fy;
      }
      if (!b.pinned && b !== draggedNode) {
        b.vx += fx;
        b.vy += fy;
      }
    }
  }
}

/**
 * Apply Hooke-style spring attraction along each edge. Edge weight
 * scales the rest length (default 1.0). Edges whose endpoints are missing
 * are silently skipped — the node map filters them out.
 */
export function applySprings(
  nodes: CosmicNode[],
  edges: CosmicEdge[],
  linkDistance: number,
  draggedNode: CosmicNode | null,
): void {
  const nodeMap = new Map<string, CosmicNode>();
  for (const n of nodes) nodeMap.set(n.id, n);
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target) continue;
    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDist = linkDistance * (edge.weight ?? 1.0);
    const displacement = dist - targetDist;
    const springForce = displacement * SPRING_STIFFNESS;
    const fx = (dx / dist) * springForce;
    const fy = (dy / dist) * springForce;
    if (!source.pinned && source !== draggedNode) {
      source.vx += fx;
      source.vy += fy;
    }
    if (!target.pinned && target !== draggedNode) {
      target.vx -= fx;
      target.vy -= fy;
    }
  }
}

/**
 * Apply center gravity (pull every unpinned node toward origin) and
 * integrate position by velocity, with damping. Pinned and dragged nodes
 * have their velocity zeroed and position frozen.
 */
export function integrate(
  nodes: CosmicNode[],
  centerGravity: number,
  draggedNode: CosmicNode | null,
): void {
  const gravity = centerGravity * GRAVITY_GAIN;
  for (const node of nodes) {
    if (node.pinned || node === draggedNode) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx += -node.x * gravity;
    node.vy += -node.y * gravity;
    node.vx *= INTEGRATION_DAMPING;
    node.vy *= INTEGRATION_DAMPING;
    node.x += node.vx;
    node.y += node.vy;
  }
}

/** Run a single physics tick: repulsion + springs + integration. */
export function step(
  nodes: CosmicNode[],
  edges: CosmicEdge[],
  opts: {
    repelStrength: number;
    linkDistance: number;
    centerGravity: number;
    draggedNode: CosmicNode | null;
  },
): void {
  applyRepulsion(nodes, opts.repelStrength, opts.draggedNode);
  applySprings(nodes, edges, opts.linkDistance, opts.draggedNode);
  integrate(nodes, opts.centerGravity, opts.draggedNode);
}

/**
 * Determine whether a node is currently visible under the active filter
 * set. A node is hidden when its type is filtered off, or when a search
 * query is active and matches nothing in the node's label, title, or tags.
 */
export function isNodeVisible(
  node: CosmicNode,
  activeTypeFilters: Record<string, boolean>,
  query: string,
): boolean {
  if (!activeTypeFilters[node.type]) return false;
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (node.label.toLowerCase().includes(q)) return true;
  if (node.frontmatter.title.toLowerCase().includes(q)) return true;
  return node.frontmatter.tags.some((t) => t.toLowerCase().includes(q));
}

/**
 * Find the topmost node whose circle contains the given world-space
 * point. `tolerance` is added to the node's radius to widen the hit area
 * for cursor precision. Returns `null` if no node is hit.
 */
export function findNodeAt(
  nodes: CosmicNode[],
  worldX: number,
  worldY: number,
  tolerance = 16,
): CosmicNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (!node) continue;
    const dx = worldX - node.x;
    const dy = worldY - node.y;
    const hitRadius = node.radius + tolerance;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return node;
    }
  }
  return null;
}

/**
 * Convert screen-space (canvas-local) coordinates into world coordinates,
 * given the current viewport center and camera offset/zoom.
 */
export function screenToWorld(
  screenX: number,
  screenY: number,
  viewport: { cx: number; cy: number },
  camera: { x: number; y: number; zoom: number },
): { x: number; y: number } {
  return {
    x: (screenX - viewport.cx) / camera.zoom - camera.x,
    y: (screenY - viewport.cy) / camera.zoom - camera.y,
  };
}

/**
 * Compute the new camera state after a wheel zoom event. The world point
 * currently under the cursor must remain stable across the zoom — this is
 * the "anchor zoom" guarantee.
 */
export function computeZoom(
  camera: { x: number; y: number; zoom: number },
  screenX: number,
  screenY: number,
  deltaY: number,
  viewport: { cx: number; cy: number },
  bounds: { minZoom: number; maxZoom: number } = { minZoom: 0.3, maxZoom: 3.5 },
): { x: number; y: number; zoom: number } {
  const zoomFactor = deltaY < 0 ? 1.12 : 0.89;
  const oldZoom = camera.zoom;
  const newZoom = Math.min(bounds.maxZoom, Math.max(bounds.minZoom, oldZoom * zoomFactor));
  const worldX = (screenX - viewport.cx) / oldZoom - camera.x;
  const worldY = (screenY - viewport.cy) / oldZoom - camera.y;
  return {
    x: (screenX - viewport.cx) / newZoom - worldX,
    y: (screenY - viewport.cy) / newZoom - worldY,
    zoom: newZoom,
  };
}
