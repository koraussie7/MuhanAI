/**
 * Generate the shop1.kbizhub.com static bundle and write it to dist-shop1/.
 *
 * Usage:
 *   bun run scripts/generate-shop1.ts
 *
 * The bundle contains 7 files (MUSS spec):
 *   index.html, assets/style.css, .well-known/mcp.json, data/store.json,
 *   data/menu.json, a2ui/surface.json, a2ui/surface.jsonl
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { hugoMcpFactory } from "../packages/mcp/src/hugo-factory.js";
import type { StoreFactoryInput } from "../packages/mcp/src/hugo-factory.js";

const SHOP1: StoreFactoryInput = {
  name: "초원식당",
  category: "한식당 / Korean Restaurant",
  description:
    "다낭 안하이(An Hải)의 정통 한식당. 삼겹살·된장찌개·김치찌개·제육볶음 등 한국인의 입맛을 살리는 집밥을 다낭에서 그대로. 1인 ₫100,000–200,000.",
  subdomain: "shop1",
  phone: "0936 225 640",
  address: "16 Huy Du, An Hải, Đà Nẵng 550000",
  hours: "매일 영업 · 22:00 마감 (Closes 10 PM)",
  services: ["All you can eat", "Dogs allowed inside", "Wi-Fi"],
  pricePerPerson: "₫100,000–200,000",
  lat: 16.0544,
  lng: 108.2444,
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

const outDir = join(process.cwd(), "dist-shop1");
const bundle = hugoMcpFactory.generateStaticBundle(SHOP1);

console.log(`Generating ${SHOP1.subdomain}.kbizhub.com bundle → ${outDir}`);
for (const [relPath, contents] of Object.entries(bundle)) {
  const full = join(outDir, relPath);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, contents, "utf8");
  console.log(`  ✓ ${relPath} (${contents.length} bytes)`);
}
console.log(`\n${Object.keys(bundle).length} files written.`);
