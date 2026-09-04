// Network Pulse / Help Needed / Verify Me — Phase 1 in-memory feed store.
// Spec: CLAUDE.md Part 1 (Implementation Priority #1-#3).
export type FeedCategory = "ai_unsolved" | "info_conflict" | "experience_gap" | "source_gap" | "outdated";

export interface HelpNeededItem {
  id: string;
  question: string;
  aiConfidence: number;      // 0..1
  humanAnswers: number;
  reward: number;            // credits
  participants: number;
  category: FeedCategory;
  createdAt: string;
}

export type VerifyVote = "correct" | "wrong" | "unsure";

export interface VerifyItem {
  id: string;
  claim: string;
  sources: number;
  votes: { correct: number; wrong: number; unsure: number };
  createdAt: string;
}

export interface Pulse {
  newQuestions: number;
  verifyRequests: number;
  humansNeeded: number;
  aiConflicts: number;
  knowledgeGaps: number;
  mcpTasksWaiting: number;
  agentsOnline: number;
}

const now = () => new Date().toISOString();

const helpNeeded: HelpNeededItem[] = [
  { id: "hn-1", question: "베트남에서 한국인이 사업자 등록을 할 때 실제로 가장 많이 발생하는 문제는 무엇인가?", aiConfidence: 0.64, humanAnswers: 3, reward: 120, participants: 8, category: "experience_gap", createdAt: now() },
  { id: "hn-2", question: "미얀마 현지에서 실제 USDT P2P 거래 시 가장 안전한 거래 방식은?", aiConfidence: 0.61, humanAnswers: 1, reward: 250, participants: 5, category: "info_conflict", createdAt: now() },
  { id: "hn-3", question: "다낭 장기 거주 시 비자 런 규정의 2025년 최신 변경 사항은?", aiConfidence: 0.48, humanAnswers: 2, reward: 300, participants: 11, category: "outdated", createdAt: now() },
];

const verifyItems: VerifyItem[] = [
  { id: "vf-1", claim: "다낭의 FPT 인터넷은 500Mbps 서비스를 제공한다.", sources: 3, votes: { correct: 12, wrong: 2, unsure: 4 }, createdAt: now() },
  { id: "vf-2", claim: "호치민 1군 카페에서는 대부분 카드 결제가 가능하다.", sources: 5, votes: { correct: 7, wrong: 9, unsure: 3 }, createdAt: now() },
  { id: "vf-3", claim: "베트남 모토바이 전동화 보조금은 2026년부터 시행된다.", sources: 2, votes: { correct: 3, wrong: 5, unsure: 14 }, createdAt: now() },
];

export function pulse(): Pulse {
  return {
    newQuestions: helpNeeded.length,
    verifyRequests: verifyItems.length,
    humansNeeded: helpNeeded.filter((i) => i.aiConfidence < 0.65).length,
    aiConflicts: helpNeeded.filter((i) => i.category === "info_conflict").length,
    knowledgeGaps: helpNeeded.filter((i) => i.category === "source_gap" || i.category === "experience_gap").length,
    mcpTasksWaiting: 0,
    agentsOnline: 12_482, // TODO: wire to agent registry discovery (spec: packages/agent/discovery)
  };
}

export function listHelpNeeded(): HelpNeededItem[] {
  return [...helpNeeded].sort((a, b) => a.aiConfidence - b.aiConfidence);
}

export function createHelpNeeded(input: { question: string; aiConfidence?: number; reward?: number }): HelpNeededItem {
  const item: HelpNeededItem = {
    id: `hn-${crypto.randomUUID().slice(0, 8)}`,
    question: input.question,
    aiConfidence: input.aiConfidence ?? 0.6,
    humanAnswers: 0,
    reward: input.reward ?? 100,
    participants: 1,
    category: "ai_unsolved",
    createdAt: now(),
  };
  helpNeeded.unshift(item);
  return item;
}

export function answerHelpNeeded(id: string): HelpNeededItem | undefined {
  const item = helpNeeded.find((i) => i.id === id);
  if (!item) return undefined;
  item.humanAnswers += 1;
  item.participants += 1;
  return item;
}

export function listVerify(): VerifyItem[] {
  return verifyItems;
}

export function voteVerify(id: string, vote: VerifyVote): VerifyItem | undefined {
  const item = verifyItems.find((i) => i.id === id);
  if (!item) return undefined;
  item.votes[vote] += 1;
  return item;
}

// ---- Priority #4: Trending (participants + conflicts + human answers + verify need) ----
export function trending() {
  return [...helpNeeded]
    .map((item) => ({
      id: item.id,
      question: item.question,
      score:
        item.participants +
        (item.category === "info_conflict" ? 25 : 0) +
        item.humanAnswers * 3 +
        Math.round((1 - item.aiConfidence) * 40),
    }))
    .sort((a, b) => b.score - a.score);
}

// ---- Priority #5: Human Knowledge Wanted ----
export interface WantedItem { id: string; prompt: string; shares: number }
const wantedItems: WantedItem[] = [
  { id: "hw-1", prompt: "베트남 사업자 등록을 실제로 해본 사람?", shares: 12 },
  { id: "hw-2", prompt: "다낭에서 6개월 이상 살아본 사람?", shares: 21 },
  { id: "hw-3", prompt: "USDT P2P 거래를 실제로 사용해본 사람?", shares: 7 },
];
export function listWanted(): WantedItem[] { return wantedItems; }
export function shareWanted(id: string): WantedItem | undefined {
  const item = wantedItems.find((i) => i.id === id);
  if (!item) return undefined;
  item.shares += 1;
  return item;
}

// ---- Priority #6: AI vs Human ----
export interface VersusItem { id: string; question: string; aiConsensus: number; humanConsensus: number; winner: "ai" | "human" }
const versusItems: VersusItem[] = [
  { id: "vs-1", question: "다낭에서 가장 좋은 장기 거주 지역은?", aiConsensus: 0.68, humanConsensus: 0.91, winner: "human" },
  { id: "vs-2", question: "2026년 국제 화물 운송 최적 경로는?", aiConsensus: 0.94, humanConsensus: 0.72, winner: "ai" },
  { id: "vs-3", question: "베트남 중소기업 세무 실무의 함정은?", aiConsensus: 0.55, humanConsensus: 0.88, winner: "human" },
];
export function listVersus(): VersusItem[] { return versusItems; }

// ---- Priority #7: Teach AI + #8: Rewards ----
export interface TeachSubmission { id: string; actorId: string; content: string; status: "verification_needed"; reward: number; createdAt: string }
const teachLog: TeachSubmission[] = [];
export function submitTeach(actorId: string, content: string): TeachSubmission {
  const submission: TeachSubmission = {
    id: `tc-${crypto.randomUUID().slice(0, 8)}`,
    actorId, content, status: "verification_needed", reward: 250, createdAt: now(),
  };
  teachLog.unshift(submission);
  return submission;
}

interface RewardEntry { reason: string; credits: number; at: string }
const rewards = new Map<string, RewardEntry[]>();
export function addReward(actorId: string, reason: string, credits: number): RewardEntry {
  const entry: RewardEntry = { reason, credits, at: now() };
  const list = rewards.get(actorId) ?? [];
  list.push(entry);
  rewards.set(actorId, list);
  return entry;
}
export function rewardTable() {
  return [
    { reason: "Answer", credits: 120 },
    { reason: "Verify", credits: 80 },
    { reason: "Teach", credits: 250 },
    { reason: "Compute", credits: 40 },
    { reason: "Knowledge", credits: 200 },
  ];
}
export function rewardsFor(actorId: string) {
  const list = rewards.get(actorId) ?? [];
  return { actorId, balance: list.reduce((sum, e) => sum + e.credits, 0), entries: list };
}

// ---- Priority #9: Unsolved Problems ----
export function unsolved() {
  const categories = ["ai_unsolved", "info_conflict", "experience_gap", "source_gap", "outdated"] as const;
  const labels: Record<(typeof categories)[number], string> = {
    ai_unsolved: "AI가 해결하지 못함",
    info_conflict: "정보가 서로 충돌함",
    experience_gap: "실제 경험 부족",
    source_gap: "검증된 자료 부족",
    outdated: "최신 정보 부족",
  };
  return categories.map((c) => ({
    category: c, label: labels[c],
    count: helpNeeded.filter((i) => i.category === c).length,
  }));
}
