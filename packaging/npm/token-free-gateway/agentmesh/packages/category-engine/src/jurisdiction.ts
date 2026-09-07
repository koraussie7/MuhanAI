export const COMMON_JURISDICTIONS = [
	"VN", // Vietnam
	"KR", // South Korea
	"US",
	"JP",
	"CN",
	"SG",
	"TH",
	"ID",
	"MY",
	"PH",
	"EU",
	"UK",
	"AU",
] as const;

export type JurisdictionCode = (typeof COMMON_JURISDICTIONS)[number] | string;

export interface JurisdictionRule {
	code: JurisdictionCode;
	name: string;
	languages: string[];
	parent?: JurisdictionCode; // e.g. EU for member states
}

export const JURISDICTION_MAP: Record<string, JurisdictionRule> = {
	VN: { code: "VN", name: "Vietnam", languages: ["vi", "en"] },
	KR: { code: "KR", name: "South Korea", languages: ["ko", "en"] },
	US: { code: "US", name: "United States", languages: ["en"] },
	JP: { code: "JP", name: "Japan", languages: ["ja", "en"] },
	SG: { code: "SG", name: "Singapore", languages: ["en", "zh", "ms", "ta"] },
	TH: { code: "TH", name: "Thailand", languages: ["th", "en"] },
	EU: { code: "EU", name: "European Union", languages: ["en"] },
};

export function normalizeJurisdiction(input: string | string[]): JurisdictionCode[] {
	const list = Array.isArray(input) ? input : [input];
	return list.map((j) => j.toUpperCase().trim()).filter((j) => j.length > 0);
}

export function detectJurisdictionFromText(text: string): JurisdictionCode[] {
	const lower = text.toLowerCase();
	const detected: JurisdictionCode[] = [];

	const patterns: [RegExp, JurisdictionCode][] = [
		[/\b(vietnam|vietnamese|việt nam|da nang|hanoi|ho chi minh|danang)\b/i, "VN"],
		[/\b(korea|korean|south korea|seoul|busan)\b/i, "KR"],
		[/\b(japan|japanese|tokyo|osaka)\b/i, "JP"],
		[/\b(singapore|sg)\b/i, "SG"],
		[/\b(thailand|thai|bangkok)\b/i, "TH"],
		[/\b(united states|usa|american|new york|california)\b/i, "US"],
	];

	for (const [regex, code] of patterns) {
		if (regex.test(lower) && !detected.includes(code)) {
			detected.push(code);
		}
	}

	return detected;
}
