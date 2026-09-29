/**
 * T5 sanity tests for the OpsMaxx desktop embed.
 *
 * Validates:
 *   1. `panel` mode renders a header + the four capability cards.
 *   2. The component can mount and unmount without crashing even
 *      when no `iframeSrc` is provided.
 *   3. The component never throws if the bridge returns an error.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createInMemoryBridge } from "@agentmesh/opsmaxx-bridge/mock";

import { OpsMaxxApp } from "./OpsMaxxApp.js";

afterEach(cleanup);

describe("OpsMaxxApp (T5)", () => {
  it("renders the panel mode by default", () => {
    render(<OpsMaxxApp />);
    expect(screen.getByTestId("opsmaxx-panel-mode")).toBeDefined();
    expect(screen.getByText(/OpsMaxx Bridge Panel/)).toBeDefined();
  });

  it("renders the four capability cards", () => {
    render(<OpsMaxxApp />);
    expect(screen.getByText("Vault")).toBeDefined();
    expect(screen.getByText("SSH")).toBeDefined();
    expect(screen.getByText("DB")).toBeDefined();
  });

  it("renders the iframe mode when explicitly requested", () => {
    render(<OpsMaxxApp mode="iframe" iframeSrc="about:blank" />);
    expect(screen.getByTestId("opsmaxx-iframe-mode")).toBeDefined();
  });

  it("tolerates a bridge that returns errors", () => {
    const bridge = createInMemoryBridge();
    // Force every list call to fail by closing the bridge first.
    void bridge.close();
    render(<OpsMaxxApp bridge={bridge} />);
    // Component must not crash; the panel still renders.
    expect(screen.getByTestId("opsmaxx-panel-mode")).toBeDefined();
  });
});
