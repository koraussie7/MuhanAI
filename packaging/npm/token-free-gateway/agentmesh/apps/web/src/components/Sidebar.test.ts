/**
 * Unit tests for the sidebar's active-route matching logic.
 *
 * These tests cover `isNavItemActive` only — DOM-level tests would need
 * jsdom + @testing-library/react, which this web app hasn't installed
 * yet. Pure logic tests give us a fast, low-cost regression net for
 * the most fragile part of the menu (the prefix-match rule).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isNavItemActive, NAV_GROUPS } from "./sidebar-config.js";

test("isNavItemActive: exact match wins for every defined path", () => {
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      assert.equal(
        isNavItemActive(item.path, item.path),
        true,
        `expected ${item.path} to match itself`,
      );
    }
  }
});

test("isNavItemActive: dashboard ('/') only matches exactly '/'", () => {
  assert.equal(isNavItemActive("/", "/"), true);
  assert.equal(isNavItemActive("/", "/agent-cast"), false);
  assert.equal(isNavItemActive("/", "/agent-mesh"), false);
  assert.equal(isNavItemActive("/", "/anything"), false);
});

test("isNavItemActive: deep path activates its ancestor segment", () => {
  // If we ever push a nested route under /marketplace/agents, both
  // /marketplace/agents and /marketplace/agents/anything should hit
  // the 'Agent Hub' nav button.
  assert.equal(isNavItemActive("/marketplace/agents", "/marketplace/agents"), true);
  assert.equal(isNavItemActive("/marketplace/agents", "/marketplace/agents/sub"), true);
});

test("isNavItemActive: /marketplace/agents does NOT match /marketplace/agents-foo", () => {
  // The old `startsWith` rule had this false-positive bug because
  // '/marketplace/agents-foo'.startsWith('/marketplace/agents') === true.
  assert.equal(isNavItemActive("/marketplace/agents", "/marketplace/agents-foo"), false);
});

test("isNavItemActive: query string on activePath is stripped before matching", () => {
  // App.tsx pushes /search?q=... — search input → SearchPage. Without
  // stripping the query, none of the buttons would highlight.
  assert.equal(isNavItemActive("/search", "/search?q=hello"), true);
  assert.equal(isNavItemActive("/agent-cast?route=foo", "/"), false);
  // Pure function doesn't know about the literal 'agent-cast?route' lookup,
  // but it should still treat it as not matching `/`.
  assert.equal(isNavItemActive("/", "/agent-cast?route=foo"), false);
});

test("isNavItemActive: cosmetic — every NAV_GROUPS path has unique id (no collisions)", () => {
  const seen = new Map<string, string>();
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      const prior = seen.get(item.path);
      assert.equal(
        prior,
        undefined,
        `path ${item.path} duplicated by '${prior ?? item.id}' and '${item.id}'`,
      );
      seen.set(item.path, item.id);
    }
  }
});

test("cosmetic — every NAV_GROUPS item has a valid iconKey", () => {
  const validIconKeys = new Set([
    "layout-dashboard", "radio", "bot", "network", "activity",
    "sparkles", "cpu", "layers", "database", "check-circle",
    "search", "users", "coins", "settings",
  ]);
  for (const group of NAV_GROUPS) {
    for (const item of group.items) {
      assert.ok(
        validIconKeys.has(item.iconKey),
        `expected ${item.id}.iconKey to map to a known icon, got '${item.iconKey}'`,
      );
    }
  }
});

test("isNavItemActive: edge case — empty activePath falls back to root matching", () => {
  // The router never actually pushes "" but defensive code shouldn't blow up.
  assert.equal(isNavItemActive("/", ""), false);
  assert.equal(isNavItemActive("/anything", ""), false);
});
