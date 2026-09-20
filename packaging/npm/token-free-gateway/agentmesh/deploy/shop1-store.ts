/**
 * shop1.kbizhub.com store input — the single source of truth for the deployed
 * 초원식당 site.
 *
 * Both the sample test (`packages/mcp/src/shop1-sample.test.ts`) and the deploy
 * script (`deploy/deploy-shop1.mts`) import this, so the live site and the
 * asserted contract can never drift. Change the menu here, re-run the deploy,
 * and the HTML / data JSON / MCP manifest / A2UI surface all follow.
 */
import type { StoreFactoryInput } from "../packages/mcp/src/hugo-factory.js";

export const SHOP1: StoreFactoryInput = {
	name: "초원식당",
	category: "한식당 / Korean Restaurant",
	description:
		"다낭 안하이(An Hải)의 정통 한식당. 삼겹살·된장찌개·김치찌개·제육볶음 등 한국인의 입맛을 살리는 집밥을 다낭에서 그대로. 1인 ₫100,000–200,000.",
	subdomain: "shop1",
	// Verified from the Google Business listing for 초원식당 (Da Nang).
	phone: "0936 225 640",
	address: "16 Huy Du, An Hải, Đà Nẵng 550000",
	hours: "매일 영업 · 22:00 마감 (Closes 10 PM)",
	services: ["All you can eat", "Dogs allowed inside", "Wi-Fi"],
	pricePerPerson: "₫100,000–200,000",
	lat: 16.0544,
	lng: 108.2444,
	items: [
		{ name: "삼겹살 (1인분 200g)", price: 150000, description: "숯불 직화, 쌈채소·쌈장·마늘 포함" },
		{ name: "된장찌개 + 공깃밥", price: 90000, description: "직접 담근 된장, 두부·호박·감자 듬뿍" },
		{ name: "김치찌개 (돼지고기)", price: 90000, description: "숙성 김치, 돼지 앞다리살" },
		{ name: "제육볶음 정식", price: 120000, description: "매콤 달콤 돼지불고기 + 6찬 + 밥" },
		{ name: "해물파전", price: 130000, description: "오징어·새우 듬뿍, 막걸리 안주 인기" },
		{ name: "치킨 (후라이드/양념)", price: 180000, description: "국내산 양념 레시피, 반마리 가능" },
		{ name: "공기밥", price: 10000, description: "리필 가능" },
	],
};
