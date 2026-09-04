// Mock data for feed components (spec: CLAUDE.md Part 1, priority #9).
export interface UnsolvedProblem {
  id: string;
  title: string;
  description: string;
  category: string;
  aiAgents: number;
  humanExperts: number;
  sources: number;
  consensus: number;
  tags: string[];
}

export const UNSOLVED_PROBLEMS: UnsolvedProblem[] = [
  {
    id: "12831",
    title: "베트남 사업자 등록 시 실제 발생하는 세무 함정은?",
    description: "AI 요약 자료가 서로 충돌하며, 실제 경험자의 검증이 필요합니다.",
    category: "conflict",
    aiAgents: 8,
    humanExperts: 3,
    sources: 5,
    consensus: 61,
    tags: ["베트남", "사업자등록", "세무"],
  },
  {
    id: "12829",
    title: "미얀마 USDT P2P 거래의 실제 안전 수칙",
    description: "최신 규제 정보가 부족하여 AI 신뢰도가 낮습니다.",
    category: "outdated",
    aiAgents: 6,
    humanExperts: 2,
    sources: 2,
    consensus: 48,
    tags: ["미얀마", "USDT", "P2P"],
  },
  {
    id: "12817",
    title: "다낭 장기 거주 지역별 실거주 후기 비교",
    description: "AI는 통계 기반으로만 답변 가능. 실거주 경험이 필요합니다.",
    category: "experience",
    aiAgents: 11,
    humanExperts: 5,
    sources: 7,
    consensus: 72,
    tags: ["다낭", "장기거주"],
  },
  {
    id: "12801",
    title: "2026년 베트남 전동화 보조금 시행 여부",
    description: "검증된 공식 자료가 부족합니다.",
    category: "verification",
    aiAgents: 4,
    humanExperts: 1,
    sources: 1,
    consensus: 39,
    tags: ["베트남", "전동화"],
  },
];

export interface TrendingQuestion {
  id: string;
  question: string;
  topic: string;
  participants: number;
  score: number;
  trend?: 'up' | 'down' | 'stable';
  category: string;
}

export const TRENDING_QUESTIONS: TrendingQuestion[] = [
  { id: "t-1", question: "AI Agent Mesh", topic: "AI Agent Mesh", score: 482, participants: 128, category: "AI", trend: "up" },
  { id: "t-2", question: "P2P AI", topic: "P2P AI", score: 341, participants: 96, category: "P2P", trend: "up" },
  { id: "t-3", question: "Vietnam Business", topic: "Vietnam Business", score: 284, participants: 88, category: "Business", trend: "stable" },
];

export const AI_VS_HUMAN = [
  {
    id: "vs-1",
    question: "다낭에서 가장 좋은 장기 거주 지역은?",
    aiConsensus: 68,
    humanConsensus: 91,
    winner: "HUMAN" as const,
    participants: { ai: 8, human: 42 },
    tags: ["다낭", "장기거주"],
  },
  {
    id: "vs-2",
    question: "2026년 국제 화물 운송 최적 경로는?",
    aiConsensus: 94,
    humanConsensus: 72,
    winner: "AI" as const,
    participants: { ai: 12, human: 15 },
    tags: ["물류", "운송"],
  },
  {
    id: "vs-3",
    question: "베트남 중소기업 세무 실무의 함정은?",
    aiConsensus: 55,
    humanConsensus: 88,
    winner: "HUMAN" as const,
    participants: { ai: 6, human: 31 },
    tags: ["베트남", "세무"],
  },
];

export const HUMAN_KNOWLEDGE_WANTED = [
  {
    id: "hk-1",
    question: "이 식당 실제로 가본 사람?",
    category: "restaurant",
    aiConfidence: 45,
    humanAnswers: 6,
    reward: 120,
    tags: ["experience"],
  },
  {
    id: "hk-2",
    question: "베트남 사업자 등록 실제 경험담",
    category: "business",
    aiConfidence: 58,
    humanAnswers: 9,
    reward: 250,
    tags: ["experience", "expert"],
  },
  {
    id: "hk-3",
    question: "다낭 현지 시세 아는 사람?",
    category: "local",
    aiConfidence: 62,
    humanAnswers: 4,
    reward: 150,
    tags: ["local", "experience"],
  },
];
