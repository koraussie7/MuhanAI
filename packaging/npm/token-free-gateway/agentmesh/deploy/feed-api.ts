// In-Worker feed and mesh endpoints backed by KV (with in-memory fallback).
// Handles live API requests directly on Cloudflare edge when origin is down.
import { createFeedStore, type FeedStore } from "./feed-store";

const DEMO_PEER_COUNT = 12_482;

export type VerifyVote = "correct" | "wrong" | "unsure";
export type VersusVote = "ai" | "human";

interface HelpNeededItem {
	id: string;
	question: string;
	aiConfidence: number;
	humanAnswers: number;
	reward: number;
	participants: number;
	category: string;
	createdAt: string;
}

interface VerifyItem {
	id: string;
	claim: string;
	sources: number;
	votes: { correct: number; wrong: number; unsure: number };
	createdAt: string;
}

const now = () => new Date().toISOString();
const BOOT = "2026-09-04T00:00:00.000Z";

const helpNeeded: HelpNeededItem[] = [
	{
		id: "hn-1",
		question: "베트남에서 한국인이 사업자 등록을 할 때 실제로 가장 많이 발생하는 문제는 무엇인가?",
		aiConfidence: 0.64,
		humanAnswers: 3,
		reward: 120,
		participants: 8,
		category: "experience_gap",
		createdAt: BOOT,
	},
	{
		id: "hn-2",
		question: "미얀마 현지에서 실제 USDT P2P 거래 시 가장 안전한 거래 방식은?",
		aiConfidence: 0.61,
		humanAnswers: 1,
		reward: 250,
		participants: 5,
		category: "info_conflict",
		createdAt: BOOT,
	},
	{
		id: "hn-3",
		question: "다낭 장기 거주 시 비자 런 규정의 2025년 최신 변경 사항은?",
		aiConfidence: 0.48,
		humanAnswers: 2,
		reward: 300,
		participants: 11,
		category: "outdated",
		createdAt: BOOT,
	},
];

const verifyItems: VerifyItem[] = [
	{
		id: "vf-1",
		claim: "다낭의 FPT 인터넷은 500Mbps 서비스를 제공한다.",
		sources: 3,
		votes: { correct: 12, wrong: 2, unsure: 4 },
		createdAt: BOOT,
	},
	{
		id: "vf-2",
		claim: "호치민 1군 카페에서는 대부분 카드 결제가 가능하다.",
		sources: 5,
		votes: { correct: 7, wrong: 9, unsure: 3 },
		createdAt: BOOT,
	},
	{
		id: "vf-3",
		claim: "베트남 모토바이 전동화 보조금은 2026년부터 시행된다.",
		sources: 2,
		votes: { correct: 3, wrong: 5, unsure: 14 },
		createdAt: BOOT,
	},
];

const SEED = { helpNeeded, verify: verifyItems } as const;

function trendingScore(item: HelpNeededItem) {
	return (
		item.participants +
		(item.category === "info_conflict" ? 25 : 0) +
		item.humanAnswers * 3 +
		Math.round((1 - item.aiConfidence) * 40)
	);
}

interface WantedItem {
	id: string;
	question: string;
	category: string;
	aiConfidence: number;
	humanAnswers: number;
	reward: number;
	tags: string[];
	shares: number;
}
const SEED_WANTED: WantedItem[] = [
	{ id: "hw-1", question: "베트남 사업자 등록을 실제로 해본 사람?", category: "experience_gap", aiConfidence: 0.64, humanAnswers: 3, reward: 120, tags: ["사업자등록", "베트남", "초보창업"], shares: 12 },
	{ id: "hw-2", question: "다낭에서 6개월 이상 살아본 사람?", category: "experience_gap", aiConfidence: 0.45, humanAnswers: 21, reward: 250, tags: ["다낭", "장기거주", "비자"], shares: 21 },
	{ id: "hw-3", question: "USDT P2P 거래를 실제로 사용해본 사람?", category: "info_conflict", aiConfidence: 0.58, humanAnswers: 7, reward: 300, tags: ["USDT", "P2P", "암호화폐"], shares: 7 },
];

interface VersusItem {
	id: string;
	question: string;
	aiConsensus: number;
	humanConsensus: number;
	winner: "AI" | "HUMAN" | "undecided";
	participants: { ai: number; human: number };
	tags: string[];
}
const SEED_VERSUS: VersusItem[] = [
	{
		id: "vs-1",
		question: "다낭에서 가장 좋은 장기 거주 지역은?",
		aiConsensus: 68,
		humanConsensus: 91,
		winner: "HUMAN",
		participants: { ai: 142, human: 87 },
		tags: ["다낭", "거주", "장기체류"],
	},
	{
		id: "vs-2",
		question: "2026년 국제 화물 운송 최적 경로는?",
		aiConsensus: 94,
		humanConsensus: 72,
		winner: "AI",
		participants: { ai: 203, human: 31 },
		tags: ["화물운송", "물류", "AI"],
	},
	{
		id: "vs-3",
		question: "베트남 중소기업 세무 실무의 함정은?",
		aiConsensus: 55,
		humanConsensus: 88,
		winner: "HUMAN",
		participants: { ai: 89, human: 156 },
		tags: ["세무", "중소기업", "베트남"],
	},
];

interface TeachSubmission {
	id: string;
	actorId: string;
	content: string;
	status: "verification_needed";
	reward: number;
	createdAt: string;
}
interface RewardEntry {
	reason: string;
	credits: number;
	at: string;
}

const json = (data: unknown, status = 200) =>
	new Response(JSON.stringify(data), {
		status,
		headers: { "content-type": "application/json" },
	});

const rewardTable = [
	{ reason: "Answer", credits: 120 },
	{ reason: "Verify", credits: 80 },
	{ reason: "Teach", credits: 250 },
	{ reason: "Compute", credits: 40 },
	{ reason: "Knowledge", credits: 200 },
];

type RouteHandler = (
	request: Request,
	match: RegExpExecArray | null,
	store: FeedStore,
) => Promise<Response>;
interface Route {
	method: string;
	pattern: RegExp;
	handler: RouteHandler;
}

async function getPulse(
	_request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const [help, verify] = await Promise.all([
		store.read("feed:help-needed", SEED.helpNeeded),
		store.read("feed:verify", SEED.verify),
	]);
	return json({
		newQuestions: help.length,
		verifyRequests: verify.length,
		humansNeeded: help.filter((i) => i.aiConfidence < 0.65).length,
		aiConflicts: help.filter((i) => i.category === "info_conflict").length,
		knowledgeGaps: help.filter(
			(i) => i.category === "source_gap" || i.category === "experience_gap",
		).length,
		mcpTasksWaiting: 4,
		agentsOnline: undefined,
		humansOnline: undefined,
		_demo: true,
	});
}

async function getNetwork(_request: Request): Promise<Response> {
	return json({
		compute: { cpu: 1284, gpu: 456, webgpu: 892, totalTFLOPS: 18400 },
		llm: { providers: 13, models: 25, free: 18 },
		mcp: { servers: 34, tools: 142, categories: 8 },
		human: { online: undefined, available: 1420, specialties: 42 },
		_demo: true,
	});
}

async function getAgents(_request: Request): Promise<Response> {
	return json([
		{
			id: "agent-gemini",
			name: "Gemini Research Node",
			type: "research",
			online: true,
			capabilities: ["Search", "Summarize", "Reasoning"],
			reputation: 99.2,
			success: 99.8,
		},
		{
			id: "agent-claude",
			name: "Claude Sonnet Coder",
			type: "coding",
			online: true,
			capabilities: ["TypeScript", "Rust", "Architecture"],
			reputation: 99.8,
			success: 99.9,
		},
		{
			id: "agent-deepseek",
			name: "DeepSeek R1 Logic",
			type: "reasoning",
			online: true,
			capabilities: ["Math", "Logic Chain", "Verification"],
			reputation: 98.4,
			success: 98.7,
		},
		{
			id: "agent-local",
			name: "Llama 3.3 Edge Peer",
			type: "edge",
			online: true,
			capabilities: ["Offline", "Privacy", "Token-Free"],
			reputation: 95.1,
			success: 96.3,
		},
	]);
}

async function handleCast(request: Request): Promise<Response> {
	let question = "문의 사항";
	let targetAgents = ["Gateway LLM"];
	try {
		const body = (await request.json()) as {
			question?: string;
			agents?: string[];
		};
		if (body.question) question = body.question;
		if (body.agents?.length) targetAgents = body.agents;
	} catch {
		/* fallback to defaults */
	}
	return json({
		id: `cast-${crypto.randomUUID().slice(0, 8)}`,
		status: "completed",
		question,
		synthesizedResponse: `[MuhanAI Multi-Agent Consensus]\n질문 "${question}"에 대해 ${targetAgents.join(", ")} 에이전트들이 네트워크 합의를 완료했습니다.\n검증된 지식 레이크 및 분산 에이전트 노드 분석 결과, 해당 요청은 신뢰도 98.5%로 처리되었습니다.`,
		agentResponses: targetAgents.map((ag) => ({
			agentId: ag,
			agentName: ag,
			response: `${ag}: 질의 "${question}"에 대한 분산 분석을 성공적으로 수행하였습니다.`,
			confidence: 0.96,
			tokensUsed: 0,
			cost: "0 MHT (Token-Free)",
		})),
		consensusScore: 0.985,
		timestamp: now(),
		_demo: true,
	});
}

async function listHelpNeeded(
	_request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const help = await store.read("feed:help-needed", SEED.helpNeeded);
	return json([...help].sort((a, b) => a.aiConfidence - b.aiConfidence));
}

async function answerHelpNeeded(
	_request: Request,
	match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const id = match?.[1];
	const updated = await store.update("feed:help-needed", SEED.helpNeeded, (list) => {
		const item = list.find((i) => i.id === id);
		if (item) {
			item.humanAnswers += 1;
			item.participants += 1;
		}
		return list;
	});
	const item = updated.find((i) => i.id === id);
	return item ? json(item) : json({ error: "not found" }, 404);
}

async function listVerify(
	_request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	return json(await store.read("feed:verify", SEED.verify));
}

async function voteVerify(
	request: Request,
	match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const id = match?.[1];
	const raw = (await request.json()) as { vote?: VerifyVote };
	const vote = raw.vote;
	if (vote !== "correct" && vote !== "wrong" && vote !== "unsure") {
		return json({ error: "vote must be correct | wrong | unsure" }, 400);
	}
	const updated = await store.update("feed:verify", SEED.verify, (list) => {
		const item = list.find((i) => i.id === id);
		if (item) item.votes[vote] += 1;
		return list;
	});
	const item = updated.find((i) => i.id === id);
	if (!item) return json({ error: "not found" }, 404);
	const reward = await addReward(store, "anonymous", "Verification", 80);
	return json({ item, reward });
}

async function listTrending(
	_request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const help = await store.read("feed:help-needed", SEED.helpNeeded);
	return json(
		[...help]
			.map((item) => ({
				id: item.id,
				topic: item.question,
				participants: item.participants,
				score: trendingScore(item),
				trend: item.aiConfidence < 0.5 ? "up" : "stable",
				category: item.category,
			}))
			.sort((a, b) => b.score - a.score),
	);
}

async function listWanted(
	_request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	return json(await store.read("feed:wanted", SEED_WANTED));
}

async function shareWanted(
	_request: Request,
	match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const id = match?.[1];
	const [updated, reward] = await Promise.all([
		store.update("feed:wanted", SEED_WANTED, (list) => {
			const item = list.find((i) => i.id === id);
			if (item) item.shares += 1;
			return list;
		}),
		addReward(store, "anonymous", "Experience shared", 60),
	]);
	const item = updated.find((i) => i.id === id);
	return item ? json({ item, reward }) : json({ error: "not found" }, 404);
}

async function listVersus(
	_request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	return json(await store.read("feed:versus", SEED_VERSUS));
}

async function voteVersus(
	request: Request,
	match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const id = match?.[1];
	const raw = (await request.json()) as { vote?: VersusVote };
	const vote = raw.vote;
	if (vote !== "ai" && vote !== "human") {
		return json({ error: "vote must be ai | human" }, 400);
	}
	const [updated, reward] = await Promise.all([
		store.update("feed:versus", SEED_VERSUS, (list) => {
			const item = list.find((i) => i.id === id);
			if (item) {
				if (vote === "ai") item.aiConsensus = Math.min(100, item.aiConsensus + 1);
				else item.humanConsensus = Math.min(100, item.humanConsensus + 1);
				item.winner = item.aiConsensus >= item.humanConsensus ? "AI" : "HUMAN";
			}
			return list;
		}),
		addReward(store, "anonymous", "Versus vote", 20),
	]);
	const item = updated.find((i) => i.id === id);
	return item ? json({ item, reward }) : json({ error: "not found" }, 404);
}

async function teachAi(
	request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const raw = await request.json();
	const body = raw as { actorId?: unknown; content?: unknown };
	if (typeof body.content !== "string" || !body.content.trim()) {
		return json({ error: "content is required" }, 400);
	}
	const actorId = typeof body.actorId === "string" && body.actorId ? body.actorId : "anonymous";
	const submission: TeachSubmission = {
		id: `tc-${crypto.randomUUID().slice(0, 8)}`,
		actorId,
		content: body.content,
		status: "verification_needed",
		reward: 250,
		createdAt: now(),
	};
	await store.update("feed:teach", [] as TeachSubmission[], (list) => [submission, ...list]);
	const reward = await addReward(store, actorId, "Teach AI", 250);
	return json({ submission, reward }, 201);
}

async function rewardsTable(
	_request: Request,
	_match: RegExpExecArray | null,
	_store: FeedStore,
): Promise<Response> {
	return json(rewardTable);
}

async function getRewards(
	_request: Request,
	match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const actorId = match?.[1] ?? "anonymous";
	const all = await store.read("feed:rewards", {} as Record<string, RewardEntry[]>);
	const list: RewardEntry[] = all[actorId] ?? [];
	return json({
		actorId,
		balance: list.reduce((sum: number, e: RewardEntry) => sum + e.credits, 0),
		entries: list,
	});
}

async function listUnsolved(
	_request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	const help = await store.read("feed:help-needed", SEED.helpNeeded);
	return json(
		help
			.filter((i) => i.aiConfidence < 0.7)
			.slice(0, 5)
			.map((item) => ({
				id: item.id,
				title: item.question,
				description: item.question,
				category: item.category,
				aiAgents: Math.round((1 - item.aiConfidence) * 10),
				humanExperts: item.humanAnswers,
				sources: item.participants,
				consensus: Math.round(item.aiConfidence * 100),
				tags: item.category ? [item.category] : [],
			})),
	);
}

const ID = "([^/]+)";

/* ------------------------------ Knowledge Nodes ------------------------------ */
/* Obsidian-style knowledge graph nodes published from the Cosmic Prompt.        */
/* Stored in FEED_KV so every visitor of muhanai.com sees the shared graph.      */

export interface KnowledgeNodeRecord {
	id: string;
	title: string;
	author: string;
	summary: string;
	tags: string[];
	links: string[]; // wikilink targets (node ids or [[Title]])
	markdown: string;
	createdAt: string;
}

const KNOWLEDGE_KEY = "knowledge:nodes";
const KNOWLEDGE_MAX = 200;

async function listKnowledgeNodes(store: FeedStore): Promise<Response> {
	const nodes = await store.read(KNOWLEDGE_KEY, [] as KnowledgeNodeRecord[]);
	return json({ nodes, count: nodes.length });
}

async function createKnowledgeNode(
	request: Request,
	_match: RegExpExecArray | null,
	store: FeedStore,
): Promise<Response> {
	let body: Partial<KnowledgeNodeRecord>;
	try {
		body = (await request.json()) as Partial<KnowledgeNodeRecord>;
	} catch {
		return json({ error: "Invalid JSON body" }, 400);
	}
	const title = (body.title ?? "").trim().slice(0, 120);
	const markdown = (body.markdown ?? "").trim().slice(0, 20_000);
	if (!title || !markdown) {
		return json({ error: "title and markdown are required" }, 400);
	}
	const node: KnowledgeNodeRecord = {
		id: `kn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		title,
		author: (body.author ?? "anonymous").trim().slice(0, 80),
		summary: (body.summary ?? title).trim().slice(0, 300),
		tags: Array.isArray(body.tags) ? body.tags.slice(0, 8).map((t) => String(t).slice(0, 24)) : [],
		links: Array.isArray(body.links) ? body.links.slice(0, 24).map((l) => String(l).slice(0, 120)) : [],
		markdown,
		createdAt: now(),
	};
	await store.update(KNOWLEDGE_KEY, [] as KnowledgeNodeRecord[], (list) => {
		const next = [node, ...list];
		return next.length > KNOWLEDGE_MAX ? next.slice(0, KNOWLEDGE_MAX) : next;
	});
	return json({ node }, 201);
}

async function getCreditsBalance(request: Request, _match: RegExpExecArray | null): Promise<Response> {
	const url = new URL(request.url);
	const userId = url.searchParams.get("userId") ?? "demo";
	const creditStore = createFeedStore(undefined as Parameters<typeof createFeedStore>[0]);
	const rewards = await creditStore.read("feed:rewards", {} as Record<string, RewardEntry[]>);
	const entries = rewards[userId] ?? [];
	const balance = entries.reduce((sum: number, e: RewardEntry) => sum + e.credits, 0);
	return json({ userId, balance });
}

async function getMeshPulse(_request: Request): Promise<Response> {
	return json({
		peers: DEMO_PEER_COUNT,
		bytesUp: 12_500_000,
		bytesDown: 8_200_000,
		latencyMs: 28,
		agentsOnline: DEMO_PEER_COUNT,
		_demo: true,
	});
}

async function listNodes(_request: Request): Promise<Response> {
	return json([
		{ id: "node-1", name: "MuhanAI Origin Hub", type: "origin", online: true, hostname: "muhanai.com", role: "coordinator", lastSeen: Date.now() },
		{ id: "node-2", name: "Seoul P2P Relay", type: "relay", online: true, hostname: "seoul.agentmesh.com", role: "relay", lastSeen: Date.now() },
		{ id: "node-3", name: "Bangkok Edge Gateway", type: "edge", online: true, hostname: "bangkok.muhanai.com", role: "gateway", lastSeen: Date.now() },
	]);
}

async function getOmnirouteFreeTiers(_request: Request): Promise<Response> {
	return json({
		source: "fallback",
		aggregate: {
			monthlyTokens: 98_000_000,
			monthlyTokensFormatted: "98M",
			providersOnline: 3,
		},
		providers: [
			{ provider: "Pollinations", limit: 50, used: 12, remaining: 38, resetAt: "2026-11-01T00:00:00Z", tier: "free" },
			{ provider: "HuggingFace", limit: 30, used: 7, remaining: 23, resetAt: "2026-11-01T00:00:00Z", tier: "free" },
			{ provider: "Groq", limit: 100, used: 0, remaining: 100, resetAt: "2026-11-01T00:00:00Z", tier: "free" },
		],
		fetchedAt: now(),
	});
}

function handlePulseStream(): Response {
	const headers = new Headers({
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-store, no-cache, must-revalidate",
		Connection: "keep-alive",
		"Access-Control-Allow-Origin": "*",
	});
	const stream = new ReadableStream({
		start(controller) {
			const interval = setInterval(() => {
				const pulse = JSON.stringify({
					v: 1,
					kind: "pulse",
					fromPeerId: "muhanai-worker",
					payload: { newQuestions: 1, _demo: true },
					ts: Date.now(),
				});
				const credit = JSON.stringify({
					v: 1,
					kind: "credit",
					fromPeerId: "muhanai-worker",
					payload: { userId: "demo", balance: 120 },
					ts: Date.now(),
				});
				controller.enqueue(`: heartbeat\n\ndata: ${pulse}\n\ndata: ${credit}\n\n`);
			}, 15_000);
			return () => clearInterval(interval);
		},
	});
	return new Response(stream, { headers });
}

const ROUTES: Route[] = [
	{ method: "GET", pattern: /^\/api\/pulse$/, handler: getPulse },
	{ method: "GET", pattern: /^\/api\/pulse\/stream$/, handler: async () => handlePulseStream() },
	{ method: "GET", pattern: /^\/api\/mesh\/pulse$/, handler: getMeshPulse },
	{ method: "GET", pattern: /^\/api\/network$/, handler: (_r) => getNetwork(_r) },
	{ method: "GET", pattern: /^\/api\/agents$/, handler: (_r) => getAgents(_r) },
	{ method: "GET", pattern: /^\/api\/nodes$/, handler: listNodes },
	{ method: "GET", pattern: /^\/api\/omniroute\/free-tiers$/, handler: getOmnirouteFreeTiers },
	{ method: "GET", pattern: /^\/api\/credits\/balance$/, handler: getCreditsBalance },
	{ method: "POST", pattern: /^\/api\/cast$/, handler: (r) => handleCast(r) },
	{ method: "GET", pattern: /^\/api\/help-needed$/, handler: listHelpNeeded },
	{
		method: "POST",
		pattern: new RegExp(`^/api/help-needed/${ID}/answer$`),
		handler: answerHelpNeeded,
	},
	{ method: "GET", pattern: /^\/api\/verify$/, handler: listVerify },
	{
		method: "POST",
		pattern: new RegExp(`^/api/verify/${ID}/vote$`),
		handler: voteVerify,
	},
	{ method: "GET", pattern: /^\/api\/trending$/, handler: listTrending },
	{ method: "GET", pattern: /^\/api\/human-wanted$/, handler: listWanted },
	{
		method: "POST",
		pattern: new RegExp(`^/api/human-wanted/${ID}/share$`),
		handler: shareWanted,
	},
	{ method: "GET", pattern: /^\/api\/ai-vs-human$/, handler: listVersus },
	{
		method: "POST",
		pattern: new RegExp(`^/api/ai-vs-human/${ID}/vote$`),
		handler: voteVersus,
	},
	{ method: "POST", pattern: /^\/api\/teach$/, handler: teachAi },
	{ method: "GET", pattern: /^\/api\/rewards\/table$/, handler: rewardsTable },
	{
		method: "GET",
		pattern: new RegExp(`^/api/rewards/${ID}$`),
		handler: getRewards,
	},
	{ method: "GET", pattern: /^\/api\/unsolved$/, handler: listUnsolved },
	{ method: "GET", pattern: /^\/api\/knowledge\/nodes$/, handler: (r, m, s) => listKnowledgeNodes(s) },
	{ method: "POST", pattern: /^\/api\/knowledge\/nodes$/, handler: (r, m, s) => createKnowledgeNode(r, m, s) },
];

const FEED_PREFIXES = [
	"/api/help-needed",
	"/api/verify",
	"/api/trending",
	"/api/human-wanted",
	"/api/ai-vs-human",
	"/api/teach",
	"/api/rewards",
	"/api/unsolved",
	"/api/network",
	"/api/agents",
	"/api/nodes",
	"/api/cast",
	"/api/knowledge",
	"/api/credits",
	"/api/mesh/pulse",
	"/api/omniroute",
];

/** Returns a Response for worker-handled /api paths, or null to fall through to proxy. */
export async function handleFeedApi(
	request: Request,
	pathname: string,
	kv?: unknown,
): Promise<Response | null> {
	const store: FeedStore = createFeedStore(kv as Parameters<typeof createFeedStore>[0]);
	for (const route of ROUTES) {
		if (request.method !== route.method) continue;
		const match = route.pattern.exec(pathname);
		if (!match) continue;
		return route.handler(request, match, store);
	}
	if (pathname === "/api/pulse" || FEED_PREFIXES.some((p) => pathname.startsWith(p))) {
		return json({ error: "not found" }, 404);
	}
	return null;
}

async function addReward(
	store: FeedStore,
	actorId: string,
	reason: string,
	credits: number,
): Promise<RewardEntry> {
	const entry: RewardEntry = { reason, credits, at: now() };
	await store.update("feed:rewards", {} as Record<string, RewardEntry[]>, (all) => {
		all[actorId] = [...(all[actorId] ?? []), entry];
		return all;
	});
	return entry;
}
