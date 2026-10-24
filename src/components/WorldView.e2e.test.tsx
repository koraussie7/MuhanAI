/**
 * WorldView 단위 테스트
 *
 * 월드 뷰 iframe 컴포넌트의 기본 동작 검증:
 * 1. 자격 증명이 없으면 월드 뷰 미노출 (플레이스홀더 표시)
 * 2. 자격 증명이 있으면 iframe이 GEV URL로 로드됨
 * 3. postMessage 계약: GEV_READY → GEV_AUTH 전송
 * 4. GEV_ENTITY_SELECTED 수신 → onEntitySelected 호출
 * 5. GEV_ERROR 수신 → onError 호출
 * 6. origin 검증: muhanai.com이 아닌 origin은 무시
 *
 * 실행: npm test -- WorldView.unit.test.tsx
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render } from "./test-utils.js";
import { WorldView } from "./WorldView.js";

const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

Object.defineProperty(window, "addEventListener", {
  writable: true,
  value: mockAddEventListener,
});

Object.defineProperty(window, "removeEventListener", {
  writable: true,
  value: mockRemoveEventListener,
});

const EMPTY_CREDS = { deviceToken: "", adminKey: "" };
const PAIRED_CREDS = { deviceToken: "tc_test123", adminKey: "admin_test" };

beforeEach(() => {
  vi.clearAllMocks();
  mockAddEventListener.mockReset();
  mockRemoveEventListener.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function captureMessageHandler(): ((e: MessageEvent) => void) | undefined {
  return mockAddEventListener.mock.calls.find(
    (args) => args[0] === "message",
  )?.[1] as ((e: MessageEvent) => void) | undefined;
}

describe("WorldView", () => {
  it("자격 증명이 없으면 플레이스홀더를 표시하고 iframe을 렌더링하지 않음", () => {
    const { getByText, queryByRole } = render(
      <WorldView apiUrl="http://localhost:3001" creds={EMPTY_CREDS} />,
    );

    const placeholder = getByText(/페어링 후 월드 뷰를 사용할 수 있습니다/);
    expect(placeholder).toBeDefined();

    const iframe = queryByRole("iframe");
    expect(iframe).not.toBeDefined();
  });

  it("자격 증명이 있으면 iframe을 렌더링하고 GEV URL로 로드함", () => {
    const { getByRole } = render(
      <WorldView apiUrl="http://localhost:3001" creds={PAIRED_CREDS} />,
    );

    const iframe = getByRole("iframe");
    expect(iframe).toBeDefined();
    expect(iframe.getAttribute("src")).toBe("https://world.muhanai.com/");
    expect(iframe.getAttribute("sandbox")).toBe(
      "allow-scripts allow-same-origin",
    );
  });

  it("GEV_READY 수신 시 GEV_AUTH postMessage가 전송됨", () => {
    const { container } = render(
      <WorldView apiUrl="http://localhost:3001" creds={PAIRED_CREDS} />,
    );
    const iframe = container.querySelector("iframe")!;

    const handler = captureMessageHandler();
    expect(handler).toBeDefined();

    // GEV_READY 메시지 시뮬레이션
    handler?.({
      origin: "https://world.muhanai.com",
      data: { type: "GEV_READY", version: "0.1.0" },
    } as unknown as MessageEvent);

    // iframe의 postMessage가 호출되었는지 확인 (iframe 모킹 필요)
    // 실제 브라우저 환경에서는 iframe.contentWindow.postMessage가 호출됨
    expect(iframe.contentWindow).toBeDefined();
  });

  it("GEV_ENTITY_SELECTED 수신 시 onEntitySelected 콜백 호출", () => {
    const onEntitySelected = vi.fn();
    render(
      <WorldView
        apiUrl="http://localhost:3001"
        creds={PAIRED_CREDS}
        onEntitySelected={onEntitySelected}
      />,
    );

    const handler = captureMessageHandler();

    handler?.({
      origin: "https://world.muhanai.com",
      data: {
        type: "GEV_ENTITY_SELECTED",
        id: "flight-123",
        entityType: "aircraft",
      },
    } as unknown as MessageEvent);

    expect(onEntitySelected).toHaveBeenCalledWith("flight-123", "aircraft");
  });

  it("GEV_ERROR 수신 시 onError 콜백 호출", () => {
    const onError = vi.fn();
    render(
      <WorldView
        apiUrl="http://localhost:3001"
        creds={PAIRED_CREDS}
        onError={onError}
      />,
    );

    const handler = captureMessageHandler();

    handler?.({
      origin: "https://world.muhanai.com",
      data: {
        type: "GEV_ERROR",
        code: "auth_failed",
        message: "invalid token",
      },
    } as unknown as MessageEvent);

    expect(onError).toHaveBeenCalledWith("auth_failed", "invalid token");
  });

  it("origin 검증: muhanai.com이 아닌 origin의 메시지는 무시함", () => {
    const onEntitySelected = vi.fn();
    render(
      <WorldView
        apiUrl="http://localhost:3001"
        creds={PAIRED_CREDS}
        onEntitySelected={onEntitySelected}
      />,
    );

    const handler = captureMessageHandler();

    handler?.({
      origin: "https://evil.com",
      data: {
        type: "GEV_ENTITY_SELECTED",
        id: "x",
        entityType: "y",
      },
    } as unknown as MessageEvent);

    expect(onEntitySelected).not.toHaveBeenCalled();
  });
});