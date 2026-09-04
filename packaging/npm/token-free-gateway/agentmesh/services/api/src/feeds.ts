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
// =====================================================================
// Priority #5-#10: Part 5 screens (spec: CLAUDE.md Part 5) — read-only
// catalog data so the web app can render the full network screens.
// =====================================================================

const BOOT_TIME = "2026-09-04T00:00:00.000Z";

// ---- Priority #5: Knowledge (tabs: Verified/Community/Human/AI/Web/Local) ----
export type KnowledgeKind = "verified" | "community" | "human" | "ai" | "web" | "local";

export interface KnowledgeItem {
  id: string;
  title: string;
  kind: KnowledgeKind;
  summary: string;
  confidence: number; // 0..1
  sources: number;
  contributors: number;
  tags: string[];
  verified: boolean;
  updatedAt: string;
}

const knowledgeItems: KnowledgeItem[] = [
  { id: "k-1", title: "베트남 법인 설립 절차 (2026)", kind: "verified", summary: "베트남에서 외국인 사업자 등록 시 필요한 요건과 소요 기간을 공식 자료와 대조해 검증한 지식입니다.", confidence: 0.94, sources: 12, contributors: 21, tags: ["베트남", "법인", "2026"], verified: true, updatedAt: BOOT_TIME },
  { id: "k-2", title: "다낭 장기 거주 비자(TRC) 갱신 후기", kind: "human", summary: "현지에서 3년간 거주한 경험자가 공유한 실제 TRC 갱신 절차와 함정.", confidence: 0.82, sources: 3, contributors: 7, tags: ["다낭", "비자", "거주"], verified: false, updatedAt: BOOT_TIME },
  { id: "k-3", title: "USDT P2P 미얀마 시장 심층 분석", kind: "ai", summary: "AI 에이전트 11개가 취합한 미얀마 P2P 시장의 유동성·환율·규제 요약.", confidence: 0.71, sources: 8, contributors: 11, tags: ["미얀마", "USDT", "P2P"], verified: false, updatedAt: BOOT_TIME },
  { id: "k-4", title: "2026 베트남 전동차 보조금 정책", kind: "web", summary: "정부 보도자료와 뉴스 기사를 교차 검증한 최신 전동화 보조금 현황.", confidence: 0.66, sources: 5, contributors: 3, tags: ["베트남", "전동화"], verified: false, updatedAt: BOOT_TIME },
  { id: "k-5", title: "호치민 1군 스타트업 커뮤니티 지도", kind: "community", summary: "커뮤니티에서 공유된 코워킹·투자자·개발자 모임 정보.", confidence: 0.78, sources: 6, contributors: 34, tags: ["호치민", "스타트업"], verified: true, updatedAt: BOOT_TIME },
  { id: "k-6", title: "나의 로컬 실험 노트: WebLLM 추론 속도", kind: "local", summary: "개인 노드에서 측정한 WebGPU LLM 추론 벤치마크. 지역 캐시로 보관.", confidence: 0.88, sources: 2, contributors: 1, tags: ["WebLLM", "벤치마크"], verified: true, updatedAt: BOOT_TIME },
];

export function listKnowledge(kind?: string): KnowledgeItem[] {
  if (kind && kind !== "all") return knowledgeItems.filter((k) => k.kind === kind);
  return knowledgeItems;
}
export function knowledgeKinds(): { id: KnowledgeKind | "all"; label: string }[] {
  return [
    { id: "all", label: "All" },
    { id: "verified", label: "Verified" },
    { id: "community", label: "Community" },
    { id: "human", label: "Human" },
    { id: "ai", label: "AI" },
    { id: "web", label: "Web" },
    { id: "local", label: "Local" },
  ];
}

// ---- Priority #5: Knowledge Graph (nodes + edges) ----
export interface GraphNode {
  id: string;
  label: string;
  type: "AI" | "Agent" | "Human" | "Expert" | "Knowledge" | "Source" | "Model" | "MCP";
}
export interface GraphEdge { source: string; target: string; relation: string }

const graphNodes: GraphNode[] = [
  { id: "g-ai-1", label: "Gemini", type: "AI" },
  { id: "g-ai-2", label: "Claude", type: "AI" },
  { id: "g-ag-1", label: "Research Agent", type: "Agent" },
  { id: "g-hu-1", label: "김민준 (베트남 사업가)", type: "Human" },
  { id: "g-ex-1", label: "박지원 (세무사)", type: "Expert" },
  { id: "g-kn-1", label: "베트남 법인 설립 절차", type: "Knowledge" },
  { id: "g-kn-2", label: "다낭 TRC 갱신 후기", type: "Knowledge" },
  { id: "g-src-1", label: "대한상공회의소 가이드", type: "Source" },
  { id: "g-md-1", label: "gemini-2.0-flash", type: "Model" },
  { id: "g-mcp-1", label: "Web Search MCP", type: "MCP" },
];
const graphEdges: GraphEdge[] = [
  { source: "g-ai-1", target: "g-ag-1", relation: "powers" },
  { source: "g-ag-1", target: "g-kn-1", relation: "authored" },
  { source: "g-hu-1", target: "g-kn-2", relation: "contributed" },
  { source: "g-ex-1", target: "g-kn-1", relation: "verified" },
  { source: "g-src-1", target: "g-kn-1", relation: "cites" },
  { source: "g-md-1", target: "g-ai-1", relation: "deploys" },
  { source: "g-mcp-1", target: "g-ag-1", relation: "connects" },
  { source: "g-ai-2", target: "g-kn-1", relation: "reviewed" },
];
export function knowledgeGraph() {
  return { nodes: graphNodes, edges: graphEdges };
}
// ---- Priority #6: Agent Mesh (rich registry) ----
export interface AgentInfo {
  id: string;
  name: string;
  type: string;
  status: "online" | "offline" | "busy";
  capabilities: string[];
  latencyMs: number;
  reputation: number;
  successRate: number;
  provider: string;
  model: string;
}
const meshAgents: AgentInfo[] = [
  { id: "ag-1", name: "Gemini Research Agent", type: "AI", status: "online", capabilities: ["Research", "Web Search", "Summarization"], latencyMs: 1200, reputation: 98.4, successRate: 99.1, provider: "Gemini", model: "gemini-2.0-flash" },
  { id: "ag-2", name: "Claude Analysis Agent", type: "AI", status: "online", capabilities: ["Analysis", "Coding", "Review"], latencyMs: 900, reputation: 97.8, successRate: 98.6, provider: "Claude", model: "claude-sonnet-4" },
  { id: "ag-3", name: "Local LLM Agent", type: "AI", status: "online", capabilities: ["Local Inference", "Privacy"], latencyMs: 2100, reputation: 95.2, successRate: 96.4, provider: "Ollama", model: "qwen2.5-7b" },
  { id: "ag-4", name: "Web Search Agent (InfoMesh)", type: "Agent", status: "online", capabilities: ["Search", "Crawl", "Dedupe"], latencyMs: 700, reputation: 95.8, successRate: 96.2, provider: "InfoMesh", model: "kademlia-dht" },
  { id: "ag-5", name: "MCP Tool Agent", type: "MCP", status: "busy", capabilities: ["Database", "GitHub", "Maps"], latencyMs: 1500, reputation: 96.1, successRate: 97.0, provider: "MCP", model: "tool-fanout" },
  { id: "ag-6", name: "Human Expert Pool", type: "Human", status: "online", capabilities: ["Experience", "Verification", "Local Knowledge"], latencyMs: 0, reputation: 99.1, successRate: 97.9, provider: "Human Network", model: "civic-consensus" },
];
export function listMeshAgents(): AgentInfo[] { return meshAgents; }

// ---- Priority #6: Human Agents (search by category) ----
export interface HumanAgent {
  id: string;
  name: string;
  specialty: string;
  category: string;
  location: string;
  rating: number;
  answerCount: number;
  verificationRate: number;
  available: boolean;
}
const humanAgentsList: HumanAgent[] = [
  { id: "h-1", name: "김민준", specialty: "베트남 법인 설립·세무", category: "Vietnam", location: "호치민", rating: 4.9, answerCount: 312, verificationRate: 98, available: true },
  { id: "h-2", name: "신나라", specialty: "디지털 자산·USDT P2P", category: "Crypto", location: "서울", rating: 4.8, answerCount: 204, verificationRate: 95, available: true },
  { id: "h-3", name: "Le Tran Anh", specialty: "현지 부동산·장기 거주", category: "Vietnam", location: "다낭", rating: 4.7, answerCount: 158, verificationRate: 96, available: false },
  { id: "h-4", name: "박태윤", specialty: "AI 에이전트 개발", category: "AI", location: "하노이", rating: 4.9, answerCount: 428, verificationRate: 99, available: true },
  { id: "h-5", name: "최유진", specialty: "무역·물류 (Korea ↔ SEA)", category: "Business", location: "부산", rating: 4.6, answerCount: 121, verificationRate: 93, available: true },
  { id: "h-6", name: "조하은", specialty: "여행·거주지 추천", category: "Travel", location: "나트랑", rating: 4.5, answerCount: 97, verificationRate: 90, available: true },
];
export function listHumanAgents(category?: string): HumanAgent[] {
  return category && category !== "All"
    ? humanAgentsList.filter((a) => a.category === category)
    : humanAgentsList;
}
export function humanAgentCategories(): string[] {
  return ["All", "Vietnam", "Crypto", "AI", "Korea", "Business", "Travel"];
}
// ---- Priority #7: MCP Marketplace ----
export interface McpServer {
  id: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  users: number;
  tools: number;
  latencyMs: number;
  reliability: number; // 0..100
  tags: string[];
}
const mcpServersList: McpServer[] = [
  { id: "mcp-1", name: "Web Search", description: "여러 검색엔진을 통합한 웹 검색 MCP 서버", category: "Search", rating: 4.8, users: 12400, tools: 6, latencyMs: 320, reliability: 99.2, tags: ["search", "web"] },
  { id: "mcp-2", name: "GitHub", description: "리포지토리·이슈·PR 관리 MCP", category: "Dev Tools", rating: 4.9, users: 9630, tools: 14, latencyMs: 210, reliability: 99.8, tags: ["github", "dev"] },
  { id: "mcp-3", name: "Google Drive", description: "문서·스프레드시트 접근 MCP", category: "Productivity", rating: 4.6, users: 8210, tools: 9, latencyMs: 480, reliability: 98.4, tags: ["drive", "docs"] },
  { id: "mcp-4", name: "Postgres", description: "SQL 데이터베이스 쿼리 MCP", category: "Database", rating: 4.7, users: 7050, tools: 11, latencyMs: 140, reliability: 99.5, tags: ["database", "sql"] },
  { id: "mcp-5", name: "Finance Data", description: "글로벌 주가·환율·암호화폐 시세 MCP", category: "Finance", rating: 4.4, users: 5320, tools: 8, latencyMs: 390, reliability: 97.1, tags: ["finance", "data"] },
  { id: "mcp-6", name: "Maps & Local", description: "지도·위치·지역 정보 MCP", category: "Location", rating: 4.3, users: 4980, tools: 7, latencyMs: 420, reliability: 96.8, tags: ["maps", "local"] },
  { id: "mcp-7", name: "Email (IMAP)", description: "메일 읽기·전송 MCP", category: "Productivity", rating: 4.2, users: 3890, tools: 5, latencyMs: 360, reliability: 95.9, tags: ["email"] },
  { id: "mcp-8", name: "Shopping", description: "상품 비교·가격 추적 MCP", category: "Commerce", rating: 4.0, users: 3120, tools: 4, latencyMs: 510, reliability: 94.2, tags: ["shopping"] },
];
export function listMcpServers(): McpServer[] { return mcpServersList; }

// ---- Priority #6: Models catalog ----
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context: string;
  inputCost: number;  // USD per 1M tokens
  outputCost: number; // USD per 1M tokens
  free: boolean;
  local: boolean;
}
const modelsList: ModelInfo[] = [
  { id: "md-1", name: "gemini-2.0-flash", provider: "Gemini", context: "1M", inputCost: 0.1, outputCost: 0.4, free: true, local: false },
  { id: "md-2", name: "claude-sonnet-4", provider: "Claude", context: "200K", inputCost: 3, outputCost: 15, free: false, local: false },
  { id: "md-3", name: "gpt-4o-mini", provider: "GPT", context: "128K", inputCost: 0.15, outputCost: 0.6, free: false, local: false },
  { id: "md-4", name: "qwen2.5-7b", provider: "Ollama", context: "32K", inputCost: 0, outputCost: 0, free: true, local: true },
  { id: "md-5", name: "llama-3.1-8b", provider: "WebLLM", context: "128K", inputCost: 0, outputCost: 0, free: true, local: true },
  { id: "md-6", name: "mistral-medium", provider: "Mistral", context: "32K", inputCost: 2.7, outputCost: 8.1, free: false, local: false },
  { id: "md-7", name: "groq-llama-3.3-70b", provider: "Groq", context: "128K", inputCost: 0.59, outputCost: 0.79, free: true, local: false },
  { id: "md-8", name: "cerebras-llama-3.3-70b", provider: "Cerebras", context: "128K", inputCost: 0.6, outputCost: 0.8, free: true, local: false },
];
export function listModels(): ModelInfo[] { return modelsList; }
// ---- Priority #8: Contributions ----
export function contributions() {
  return {
    total: 98_421,
    items: [
      { type: "Answers", count: 1842, credits: 120 },
      { type: "Verified", count: 492, credits: 80 },
      { type: "Knowledge", count: 128, credits: 200 },
      { type: "Compute Hours", count: 83, credits: 40 },
      { type: "MCP", count: 12, credits: 500 },
    ],
  };
}

// ---- Priority #8: Reputation ----
export function reputation() {
  return {
    overall: 98.4,
    scores: [
      { area: "Answer", score: 97 },
      { area: "Verification", score: 99 },
      { area: "Knowledge", score: 96 },
      { area: "Compute", score: 98 },
      { area: "Trust", score: 99 },
    ],
    history: [
      { event: "답변 3건 채택됨", delta: "+0.4", at: BOOT_TIME },
      { event: "검증 정확도 상승", delta: "+0.2", at: BOOT_TIME },
      { event: "지식 기여 1건 통과", delta: "+0.6", at: BOOT_TIME },
    ],
  };
}

// ---- Priority #9: Projects ----
export interface Project {
  id: string;
  name: string;
  description: string;
  status: "active" | "archived";
  agents: number;
  knowledge: number;
  tasks: number;
  files: number;
  workflows: number;
  conversations: number;
  contributions: number;
  updatedAt: string;
}
const projectsList: Project[] = [
  { id: "p-1", name: "베트남 진출 리서치", description: "베트남 법인 설립·세무·시장 조사 프로젝트", status: "active", agents: 6, knowledge: 24, tasks: 12, files: 18, workflows: 2, conversations: 87, contributions: 1240, updatedAt: BOOT_TIME },
  { id: "p-2", name: "미얀마 P2P 시장 보고서", description: "USDT P2P 거래 방식과 리스크 분석", status: "active", agents: 4, knowledge: 11, tasks: 6, files: 9, workflows: 1, conversations: 42, contributions: 860, updatedAt: BOOT_TIME },
  { id: "p-3", name: "WebLLM 벤치마크", description: "브라우저 로컬 추론 성능 측정", status: "archived", agents: 2, knowledge: 5, tasks: 3, files: 6, workflows: 1, conversations: 21, contributions: 310, updatedAt: BOOT_TIME },
];
export function listProjects(): Project[] { return projectsList; }

// ---- Priority #9: Tasks ----
export interface TaskItem {
  id: string;
  title: string;
  type: "Research" | "Coding" | "Verification" | "Translation" | "Data Analysis";
  status: "running" | "queued" | "done";
  assignee: string;
  reward: number;
  progress: number; // 0..100
  projectId: string;
}
const tasksList: TaskItem[] = [
  { id: "t-1", title: "베트남 법인 등록 세무 함정 정리", type: "Research", status: "running", assignee: "Gemini Research Agent", reward: 250, progress: 62, projectId: "p-1" },
  { id: "t-2", title: "USDT P2P 최신 규제 수집", type: "Research", status: "running", assignee: "Web Search Agent", reward: 180, progress: 38, projectId: "p-2" },
  { id: "t-3", title: "TRC 갱신 경험 인터뷰", type: "Verification", status: "queued", assignee: "인간 에이전트 풀", reward: 120, progress: 0, projectId: "p-1" },
  { id: "t-4", title: "농산물 수출 문서 번역 (VN→KO)", type: "Translation", status: "done", assignee: "Gemini Research Agent", reward: 90, progress: 100, projectId: "p-1" },
  { id: "t-5", title: "시계열 거래량 데이터 분석", type: "Data Analysis", status: "running", assignee: "Claude Analysis Agent", reward: 300, progress: 81, projectId: "p-2" },
  { id: "t-6", title: "WebLLM 채팅 데모 구현", type: "Coding", status: "done", assignee: "Local LLM Agent", reward: 320, progress: 100, projectId: "p-3" },
];
export function listTasks(): TaskItem[] { return tasksList; }
// ---- Priority #9: Workflows ----
export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: { name: string; icon: string }[];
  status: "active" | "draft";
  runs: number;
  avgDuration: string;
  lastRun: string;
}
const workflowsList: Workflow[] = [
  {
    id: "w-1", name: "심층 시장 리서치", description: "Research → Web Search → LLM Cast → Human Verification → Knowledge Engine → Report",
    steps: [
      { name: "Research", icon: "🔍" },
      { name: "Web Search", icon: "🌐" },
      { name: "LLM Cast", icon: "📡" },
      { name: "Human Verification", icon: "👤" },
      { name: "Knowledge Engine", icon: "📚" },
      { name: "Report", icon: "📄" },
    ],
    status: "active", runs: 128, avgDuration: "6m 12s", lastRun: BOOT_TIME,
  },
  {
    id: "w-2", name: "지식 검증 파이프라인", description: "제출 → AI vs AI → AI vs Web → Source vs Source → 등급 결정",
    steps: [
      { name: "제출", icon: "📥" },
      { name: "AI vs AI", icon: "🤖" },
      { name: "AI vs Web", icon: "🌐" },
      { name: "Source vs Source", icon: "📑" },
      { name: "등급 결정", icon: "🏅" },
    ],
    status: "active", runs: 341, avgDuration: "2m 40s", lastRun: BOOT_TIME,
  },
];
export function listWorkflows(): Workflow[] { return workflowsList; }

// ---- Priority #10: Network Monitor / stats ----
export function networkStats() {
  return {
    agentsOnline: 1_284,
    humanAgents: 7_542,
    llmProviders: 328,
    mcpServers: 4_821,
    computeNodes: 12_438,
    knowledgeRecords: "18.4M",
    requestsPerMin: 820,
    avgLatencyMs: 380,
    successRate: 99.2,
    activeTasks: { Researching: 148, Coding: 96, Verification: 73, Translation: 41, DataAnalysis: 57 },
    peers: { total: 1284, connected: 842, searching: 127 },
  };
}

// ---- Priority #10: Search (InfoMesh-style) ----
export interface SearchResult {
  id: string;
  title: string;
  kind: "knowledge" | "agent" | "human" | "mcp" | "source";
  snippet: string;
  confidence: number;
  verified: boolean;
}
const searchIndex: SearchResult[] = [
  { id: "s-1", title: "베트남 법인 설립 절차 (2026)", kind: "knowledge", snippet: "외국인 사업자 등록 요건, 소요 기간, 세무 등록 절차", confidence: 0.94, verified: true },
  { id: "s-2", title: "Gemini Research Agent", kind: "agent", snippet: "Research · Web Search · Summarization — 응답 지연 1.2s", confidence: 0.9, verified: true },
  { id: "s-3", title: "김민준 (베트남 법인·세무)", kind: "human", snippet: "호치민 소재, 검증률 98%, 답변 312건", confidence: 0.87, verified: true },
  { id: "s-4", title: "Postgres MCP 서버", kind: "mcp", snippet: "SQL 쿼리 · 스키마 확인 · 데이터 분석", confidence: 0.85, verified: false },
  { id: "s-5", title: "대한상공회의소 베트남 가이드", kind: "source", snippet: "공식 투자·세무 가이드, 2026년판", confidence: 0.97, verified: true },
];
export function search(query?: string): SearchResult[] {
  if (!query || !query.trim()) return searchIndex;
  const q = query.trim().toLowerCase();
  return searchIndex.filter((r) =>
    r.title.toLowerCase().includes(q) || r.snippet.toLowerCase().includes(q)
  );
}
