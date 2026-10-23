/**
 * WorldGlobe 렌더 방어 테스트 (Part B)
 *
 * globe.gl(three.js) 초기화가 실패하더라도 /world 페이지가 죽지 않고
 * 폴백 UI를 보여야 한다.
 *
 * 환경 제약: 이 워크스페이스는 vitest `environment: "node"` 를 사용하며
 * jsdom / @testing-library/react 가 설치되지 않아, DOM 기반
 * `render` + `getByTestId("world-globe-fallback")` 는 실행할 수 없습니다.
 * 따라서 SSR( renderToStaticMarkup )로 globe.gl 이 throw(mock) 되어도
 * 컴포넌트 마운트 자체가 죽지 않는지(페이지 생존) 검증하고, 순수 위치
 * 해석 헬퍼를 검증합니다. DOM 기반 폴백 단언은 브라우저/통합 테스트에서
 * 별도로 다룹니다.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WorldEvent } from "../lib/world-types";

vi.mock("react-globe.gl", () => ({
	default: () => {
		throw new Error("no webgl");
		},
	}));
	import { WorldGlobe } from "./WorldGlobe.js";
import { eventPosition, toGlobePoints } from "./WorldGlobe.js";

describe("WorldGlobe — globe.gl 초기화 실패 방어", () => {
	it("globe.gl이 throw해도 컴포넌트 렌더링이 죽지 않는다 (페이지 생존)", () => {
		expect(() =>
			renderToStaticMarkup(<WorldGlobe events={[]} isOnline={false} />),
		).not.toThrow();
	});

	it("오프라인 데모 상태와 글로브 컨테이너를 렌더한다", () => {
		const html = renderToStaticMarkup(
			<WorldGlobe events={[]} isOnline={false} />,
		);
		expect(html).toContain('data-testid="world-globe"');
		expect(html).toContain("오프라인 데모");
	});
});

describe("WorldGlobe — 순수 위치 해석 헬퍼", () => {
	it("eventPosition — 알려진 도시명을 좌표로 해석한다", () => {
		expect(
			eventPosition({ title: "Seoul event", location: "Seoul" } as WorldEvent),
		).toEqual([37.5665, 126.978]);
	});

	it("eventPosition — 해석 불가하면 null을 반환한다", () => {
		expect(
			eventPosition({ title: "Unknown", location: "Nowhere City" } as WorldEvent),
		).toBeNull();
	});

	it("toGlobePoints — 좌표가 없는 이벤트는 건너뛴다", () => {
		const points = toGlobePoints([
			{ title: "Seoul", location: "Seoul" } as WorldEvent,
			{ title: "Nowhere", location: "Nowhere City" } as WorldEvent,
		]);
		expect(points).toHaveLength(1);
		expect(points[0]!.lat).toBe(37.5665);
	});
});
