/**
 * Dev harness — render the shop1 A2UI surface in isolation.
 *
 * Run with: `pnpm --filter @agentmesh/web exec vite --config vite.a2ui.config.ts`
 * or import this module from a dev-only route. The point is to be able to see
 * the A2UI ops tree actually render without the full app shell in the way,
 * which is how visual regressions in the renderer get caught.
 *
 * The sample data here is the same shape `scripts/generate-shop1.ts` writes
 * to `dist-shop1/a2ui/surface.jsonl`, so the harness doubles as a "preview
 * what the factory just emitted" page for design review.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { A2UISurface } from "./src/components/a2ui/A2UISurface.js";
import { a2uiSurfaceBuilder } from "../../packages/mcp/src/a2ui-surface.js";
import "./src/components/a2ui/a2ui.css";

const SHOP1 = {
	surfaceId: "shop1-menu",
	storeName: "초원식당",
	hours: "매일 영업 · 22:00 마감 (Closes 10 PM)",
	pricePerPerson: "₫100,000–200,000",
	services: ["All you can eat", "Dogs allowed inside", "Wi-Fi"],
	soldOut: ["김치찌개 (돼지고기)"],
	items: [
		{ name: "삼겹살 (1인분 200g)", price: 150000, description: "숯불 직화, 쌈채소·쌈장·마늘 포함" },
		{ name: "된장찌개 + 공깃밥", price: 90000, description: "직접 담근 된장, 두부·호박·감자 듬뿌리" },
		{ name: "김치찌개 (돼지고기)", price: 90000, description: "숙성 김치, 돼지 앞다리살" },
		{ name: "제육볶음 정식", price: 120000, description: "매콤 달콤 돼지불고기 + 6찬 + 밥" },
		{ name: "해물파전", price: 130000, description: "오징어·새우 듬뿍, 막걸리 안주 인기" },
		{ name: "치킨 (후라이드/양념)", price: 180000, description: "국내산 양념 레시피, 반마리 가능" },
		{ name: "공기밥", price: 10000, description: "리필 가능" },
	],
};

const ops = a2uiSurfaceBuilder.buildStoreMenuSurface(SHOP1);

const onAction = (name: string) => {
	// eslint-disable-next-line no-console
	console.log("[a2ui-harness] action:", name);
};

function Harness() {
	return (
		<main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px" }}>
			<header style={{ marginBottom: 24 }}>
				<h1 style={{ margin: 0, fontSize: "1.2rem" }}>A2UI Harness · shop1-menu</h1>
				<p style={{ color: "#8b949e", margin: "4px 0 0", fontSize: ".85rem" }}>
					dev-only preview of the A2UI ops emitted by hugo-factory for the shop1 sample bundle.
				</p>
			</header>
			<A2UISurface ops={ops} onAction={onAction} />
		</main>
	);
}

const mount = document.getElementById("root");
if (!mount) {
	throw new Error("a2ui-harness: #root element not found in document");
}

createRoot(mount).render(
	<StrictMode>
		<Harness />
	</StrictMode>,
);
