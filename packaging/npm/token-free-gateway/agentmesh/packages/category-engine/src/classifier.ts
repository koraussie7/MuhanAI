import type { CategoryContext, RiskLevel } from "@agentmesh/shared-types";
import { DOMAIN_CATEGORIES, type DomainCategory } from "./category";
import { detectJurisdictionFromText, normalizeJurisdiction } from "./jurisdiction";
import { globalTaxonomy } from "./taxonomy";

export interface ClassificationResult extends CategoryContext {
	confidence: number;
	rawScores?: Record<string, number>;
}

/**
 * Lightweight rule-based + keyword classifier.
 * In production this should be backed by an LLM or fine-tuned model.
 */
export class CategoryClassifier {
	private keywordMap: Record<DomainCategory, string[]> = {
		medical: [
			"증상",
			"병원",
			"의사",
			"약",
			"진단",
			"질병",
			"symptom",
			"doctor",
			"medicine",
			"diagnosis",
		],
		legal: [
			"계약",
			"소송",
			"변호사",
			"법률",
			"조항",
			"contract",
			"lawsuit",
			"lawyer",
			"legal",
			"clause",
		],
		tax: ["세금", "부가세", "법인세", "소득세", "tax", "vat", "corporate tax", "income tax"],
		finance: [
			"투자",
			"주식",
			"펀드",
			"대출",
			"금리",
			"investment",
			"stock",
			"fund",
			"loan",
			"interest",
		],
		"real-estate": [
			"부동산",
			"임대",
			"보증금",
			"매매",
			"아파트",
			"real estate",
			"rental",
			"deposit",
			"lease",
			"apartment",
		],
		business: [
			"사업",
			"회사",
			"창업",
			"경영",
			"전략",
			"business",
			"startup",
			"company",
			"strategy",
		],
		education: [
			"교육",
			"학교",
			"대학",
			"강의",
			"학습",
			"education",
			"school",
			"university",
			"course",
		],
		technology: [
			"코딩",
			"소프트웨어",
			"ai",
			"프로그래밍",
			"서버",
			"software",
			"programming",
			"server",
			"api",
		],
		travel: ["여행", "비자", "항공", "호텔", "관광", "travel", "visa", "flight", "hotel", "tour"],
		automotive: ["자동차", "차량", "운전", "정비", "car", "vehicle", "driving", "maintenance"],
		science: ["연구", "실험", "논문", "과학", "research", "experiment", "paper", "science"],
		agriculture: ["농업", "농사", "작물", "농장", "agriculture", "farming", "crop", "farm"],
		shopping: ["쇼핑", "구매", "상품", "배송", "shopping", "buy", "product", "delivery"],
	};

	classify(text: string, hint?: Partial<CategoryContext>): ClassificationResult {
		const lower = text.toLowerCase();
		const scores: Record<string, number> = {};

		for (const domain of DOMAIN_CATEGORIES) {
			const keywords = this.keywordMap[domain] ?? [];
			let score = 0;
			for (const kw of keywords) {
				if (lower.includes(kw.toLowerCase())) {
					score += 1;
				}
			}
			scores[domain] = score;
		}

		// Apply hint boost
		if (hint?.domain && scores[hint.domain] !== undefined) {
			const current = scores[hint.domain]!;
			scores[hint.domain] = current + 3;
		}

		const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
		const topDomain = (sorted[0]?.[0] as DomainCategory) || "business";
		const topScore = sorted[0]?.[1] ?? 0;
		const total = sorted.reduce((s, [, v]) => s + v, 0) || 1;
		const confidence = Math.min(0.95, topScore / (total + 1) + 0.3);

		const jurisdictions = hint?.jurisdiction ?? detectJurisdictionFromText(text);

		// Simple subdomain heuristics
		let subdomain = hint?.subdomain;
		if (!subdomain) {
			if (topDomain === "real-estate" && /보증금|deposit|rental|임대/i.test(text)) {
				subdomain = "rental";
			} else if (topDomain === "tax" && /국제|international|해외/i.test(text)) {
				subdomain = "international-tax";
			} else if (topDomain === "tax" && /사업|business|법인/i.test(text)) {
				subdomain = "business-tax";
			}
		}

		const riskLevel: RiskLevel =
			hint?.riskLevel ?? globalTaxonomy.get(topDomain)?.defaultRiskLevel ?? "medium";

		return {
			domain: topDomain,
			subdomain,
			jurisdiction: jurisdictions.length > 0 ? normalizeJurisdiction(jurisdictions) : undefined,
			task: hint?.task,
			riskLevel,
			confidence,
			rawScores: scores,
		};
	}
}

export const categoryClassifier = new CategoryClassifier();
