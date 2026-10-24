/**
 * 테스트용 render 래퍼 (폴백 구현).
 *
 * @testing-library/react 미설치 환경에서 vitest + jsdom으로
 * React 컴포넌트를 렌더링하기 위한 최소 유틸리티.
 */
import React from "react";
import ReactDOM from "react-dom/client";

export interface RenderResult {
  container: HTMLElement;
  unmount: () => void;
  getByText: (text: string | RegExp) => HTMLElement;
  queryByRole: (role: string) => HTMLElement | null;
  getByRole: (role: string) => HTMLElement;
}

export function render(ui: React.ReactElement): RenderResult {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = ReactDOM.createRoot(container);
  root.render(ui);

  function getByText(text: string | RegExp): HTMLElement {
    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node) => {
          // 루트 컨테이너 자체는 스킵하고 자식 요소에서만 검색
          if (node === container) return NodeFilter.FILTER_SKIP;
          const textContent = node.textContent ?? "";
          if (text instanceof RegExp) {
            return text.test(textContent)
              ? NodeFilter.FILTER_ACCEPT
              : NodeFilter.FILTER_SKIP;
          }
          return textContent.includes(text)
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        },
      },
    );
    let node: Node | null;
    while ((node = walker.nextNode())) {
      return node as HTMLElement;
    }
    throw new Error(`텍스트를 찾을 수 없음: ${String(text)}`);
  }

  function queryByRole(role: string): HTMLElement | null {
    return container.querySelector(`[role="${role}"]`) as HTMLElement | null;
  }

  function getByRole(role: string): HTMLElement {
    const el = queryByRole(role);
    if (!el) throw new Error(`role="${role}" 요소를 찾을 수 없음`);
    return el;
  }

  return {
    container,
    unmount: () => root.unmount(),
    getByText,
    queryByRole,
    getByRole,
  };
}