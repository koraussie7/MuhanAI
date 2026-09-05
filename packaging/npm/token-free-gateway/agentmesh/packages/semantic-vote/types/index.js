import Gun from "gun";
const TAG_RULES = [
    { tag: "medical", patterns: [/의학|의료|피부암|암|질병|약|병원|건강|medical|disease|cancer|skin/i], weight: 1.0 },
    { tag: "skin_cancer", patterns: [/피부암|melanoma|skin cancer|피부.*암|선크림|자외선/i], weight: 1.0 },
    { tag: "finance", patterns: [/투자|금융|주식|펀드|세금|finance|stock|tax/i], weight: 0.9 },
    { tag: "legal", patterns: [/법률|계약|소송|변호사|legal|contract|lawsuit/i], weight: 0.9 },
    { tag: "research", patterns: [/리서치|연구|조사|논문|research|paper|study/i], weight: 0.8 },
    { tag: "code", patterns: [/코드|프로그래밍|개발|버그|디버그|code|programming|debug/i], weight: 0.8 },
    { tag: "verify", patterns: [/검증|팩트체크|사실확인|verify|fact.?check/i], weight: 0.7 },
    { tag: "analyze", patterns: [/분석|데이터|통계|분석|analyze|data|stats/i], weight: 0.6 },
];
export class SemanticVotingClient {
    gun;
    topicVotes = new Map();
    constructor(relayUrl = "https://hive.p2pclaw.com/gun") {
        this.gun = Gun({ peers: [relayUrl] });
    }
    classify(text) {
        const weights = {
            research: 0,
            analyze: 0,
            verify: 0,
            code: 0,
            skin_cancer: 0,
            medical: 0,
            finance: 0,
            legal: 0,
            general: 0.1,
        };
        for (const rule of TAG_RULES) {
            for (const pattern of rule.patterns) {
                if (pattern.test(text)) {
                    weights[rule.tag] = Math.max(weights[rule.tag], rule.weight);
                }
            }
        }
        const primary = Object.entries(weights).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "general";
        return { primary: primary, weights };
    }
    async vote(topicId, text) {
        const { primary, weights } = this.classify(text);
        this.topicVotes.set(topicId, weights);
        this.gun.get("semantic-votes").get(topicId).put({
            text: text.slice(0, 200),
            primary,
            weights,
            timestamp: Date.now(),
        });
        return primary;
    }
    getTopTopics(limit = 10) {
        return [...this.topicVotes.entries()]
            .map(([topicId, weights]) => {
            const entries = Object.entries(weights);
            const sorted = entries.sort((a, b) => b[1] - a[1]);
            return {
                topicId,
                score: entries.reduce((sum, [, v]) => sum + v, 0),
                tag: sorted[0]?.[0] ?? "general",
            };
        })
            .sort((a, b) => b.score - a.score)
            .slice(0, limit);
    }
}
export const VOTE_TO_ROUTE = {
    research: "knowledge",
    analyze: "ai",
    verify: "mixed",
    code: "ai",
    skin_cancer: "human",
    medical: "human",
    finance: "knowledge",
    legal: "human",
    general: "ai",
};
//# sourceMappingURL=index.js.map