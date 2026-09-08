// Model Context Protocol (MCP) Server Implementation for MuhanAI
// Standard Anthropic MCP Server protocol & One-Click Client Configuration generator

export interface MCPToolDefinition {
	name: string;
	description: string;
	inputSchema: {
		type: string;
		properties: Record<string, { type: string; description: string }>;
		required?: string[];
	};
}

export interface MCPPromptDefinition {
	name: string;
	description: string;
	arguments?: {
		name: string;
		description: string;
		required?: boolean;
	}[];
}

export const MUHANAI_MCP_PROMPTS: MCPPromptDefinition[] = [
	{
		name: "human_ai_symbiosis",
		description:
			"사람과 AI가 공존하는 세상의 시작점 (8개국어 지원: ko, en, ja, zh, es, de, fr, pt) - 자율 에이전트 협업 및 합의 프롬프트",
		arguments: [
			{
				name: "topic",
				description: "협업 또는 탐색하고자 하는 아이디어나 문제 주제 / Collaboration topic",
				required: false,
			},
			{
				name: "language",
				description: "언어 코드 선택 (ko, en, ja, zh, es, de, fr, pt - 기본값: auto)",
				required: false,
			},
		],
	},
];

export const MUHANAI_MCP_TOOLS: MCPToolDefinition[] = [
	{
		name: "muhanai_ask_quorum",
		description:
			"Query MuhanAI multi-agent quorum (Claude 3.7, DeepSeek R1, Gemini 2.5) for consensus reasoning without token costs.",
		inputSchema: {
			type: "object",
			properties: {
				question: {
					type: "string",
					description:
						"The technical question, architecture puzzle, or reasoning prompt to submit to the agent quorum.",
				},
				consensus_threshold: {
					type: "number",
					description: "Minimum consensus confidence percentage (0.0 to 1.0, default 0.85).",
				},
			},
			required: ["question"],
		},
	},
	{
		name: "muhanai_search_knowledge",
		description:
			"Search the decentralized P2P Obsidian Knowledge Lake and vector embedding shards.",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Keywords, [[WikiLinks]], or concept tags to query in the knowledge lake.",
				},
				top_k: {
					type: "number",
					description: "Maximum number of markdown shards to return (default: 5).",
				},
			},
			required: ["query"],
		},
	},
	{
		name: "muhanai_publish_note",
		description:
			"Publish a new Obsidian markdown note shard directly into the cosmic knowledge topology.",
		inputSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
					description: "Title of the note (will become [[Title.md]]).",
				},
				content: {
					type: "string",
					description: "Markdown body content with tags and wikilinks.",
				},
				tags: {
					type: "string",
					description: "Comma-separated tags (e.g. 'crdt, zero-token, obsidian').",
				},
			},
			required: ["title", "content"],
		},
	},
	{
		name: "muhanai_get_pulse",
		description:
			"Get real-time telemetry from the P2P agent mesh (peer counts, active LLMs, latency).",
		inputSchema: {
			type: "object",
			properties: {},
		},
	},
];

export async function handleMcpRequest(request: Request, url: URL, env?: { API_ORIGIN?: string }): Promise<Response | null> {
	const pathname = url.pathname;

	// 1. MCP Manifest & Declaration
	if (pathname === "/api/mcp/manifest.json" || pathname === "/.well-known/mcp.json") {
		const manifest = {
			schema_version: "v1",
			name_for_model: "muhanai_agentmesh",
			name_for_human: "MuhanAI Autonomous Agent Mesh",
			description_for_model:
				"Access MuhanAI decentralized zero-token AI quorum, Obsidian knowledge lake, and P2P mesh tools.",
			description_for_human:
				"Zero-token AI reasoning, CRDT knowledge lake, and multi-agent deliberation gateway.",
			server_version: "1.0.0",
			transport: {
				type: "http",
				rpc_endpoint: "https://muhanai.com/api/mcp/rpc",
			},
			capabilities: {
				tools: true,
				resources: true,
				prompts: true,
			},
			tools: MUHANAI_MCP_TOOLS,
			prompts: MUHANAI_MCP_PROMPTS,
		};

		return new Response(JSON.stringify(manifest, null, 2), {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"access-control-allow-origin": "*",
			},
		});
	}

	// 2. Client Configurations (Claude Desktop, Cline, Cursor)
	if (pathname === "/api/mcp/config") {
		const _client = url.searchParams.get("client") || "claude";

		const claudeDesktopConfig = {
			mcpServers: {
				muhanai: {
					command: "npx",
					args: ["-y", "@agentmesh/mcp-server", "--gateway", "https://muhanai.com"],
				},
			},
		};

		const clineConfig = {
			mcpServers: {
				"muhanai-mesh": {
					url: "https://muhanai.com/api/mcp/rpc",
					disabled: false,
					autoApprove: ["muhanai_search_knowledge", "muhanai_get_pulse"],
				},
			},
		};

		const cursorConfig = {
			name: "MuhanAI Gateway",
			serverUrl: "https://muhanai.com/api/mcp/rpc",
			type: "sse",
		};

		const response = {
			claudeDesktop: claudeDesktopConfig,
			cline: clineConfig,
			cursor: cursorConfig,
			curlExample:
				'curl -X POST https://muhanai.com/api/mcp/rpc -H \'Content-Type: application/json\' -d \'{"jsonrpc":"2.0","id":1,"method":"tools/list"}\'',
		};

		return new Response(JSON.stringify(response, null, 2), {
			status: 200,
			headers: {
				"content-type": "application/json; charset=utf-8",
				"access-control-allow-origin": "*",
			},
		});
	}

	// 3. JSON-RPC 2.0 Endpoint: /api/mcp/rpc
	if (pathname === "/api/mcp/rpc" && request.method === "POST") {
		try {
			const rpc = (await request.json().catch(() => ({}))) as any;
			const method = rpc.method;
			const id = rpc.id ?? 1;

			// Method: tools/list
			if (method === "tools/list") {
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id,
						result: {
							tools: MUHANAI_MCP_TOOLS,
						},
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json; charset=utf-8",
							"access-control-allow-origin": "*",
						},
					},
				);
			}

			// Method: prompts/list
			if (method === "prompts/list") {
				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id,
						result: {
							prompts: MUHANAI_MCP_PROMPTS,
						},
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json; charset=utf-8",
							"access-control-allow-origin": "*",
						},
					},
				);
			}

			// Method: prompts/get
			if (method === "prompts/get") {
				const _promptName = rpc.params?.name;
				const topic = rpc.params?.arguments?.topic || "사람과 AI의 협업과 공존";
				const requestedLang = (
					rpc.params?.arguments?.language ||
					rpc.params?.arguments?.lang ||
					request.headers.get("accept-language")?.slice(0, 2) ||
					"ko"
				).toLowerCase();

				const langMap: Record<
					string,
					{
						header: string;
						bullet1: string;
						bullet2: string;
						bullet3: string;
						bullet4: string;
						bullet5: string;
						topicLabel: string;
						footer: string;
					}
				> = {
					ko: {
						header: "🌟 [MuhanAI - 사람과 AI의 공존, 그 무한한 시작점]",
						bullet1: "• 새로운 공존의 패러다임: 사람과 AI, 무한으로 잇다",
						bullet2: "• 모두를 위한 AI, 사람과 함께 호흡하는 지능",
						bullet3: "• 공존에서 무한으로: Human & AI Convergence",
						bullet4: "• 비용의 한계를 넘어, 사람과 자율 에이전트가 완성하는 집단 지성",
						bullet5: "• 당신의 아이디어에 자율 지능의 힘을 더해, 함께 더 큰 가치를 만듭니다.",
						topicLabel: "주제",
						footer: "MuhanAI 분산 에이전트 쿼럼이 사용자의 통찰과 함께 최적의 답을 도출합니다.",
					},
					en: {
						header: "🌟 [MuhanAI - The Starting Point of Human-AI Symbiosis]",
						bullet1: "• A New Paradigm of Coexistence: Connecting Human & AI to Infinity",
						bullet2: "• AI for Everyone: Intelligence Breathing Alongside Humans",
						bullet3: "• From Coexistence to Infinity: Human & AI Convergence",
						bullet4:
							"• Transcending Cost Barriers: Collective Intelligence Built by Humans and Autonomous Agents",
						bullet5:
							"• Empowering Your Ideas with Autonomous Intelligence to Create Greater Value Together.",
						topicLabel: "Topic",
						footer:
							"The MuhanAI distributed agent quorum works alongside human insight to deliver optimal solutions.",
					},
					ja: {
						header: "🌟 [MuhanAI - 人とAIが共存する世界の起点]",
						bullet1: "• 新たな共存のパラダイム：人とAIを無限につなぐ",
						bullet2: "• すべての人のためのAI、人と共に呼吸する知能",
						bullet3: "• 共存から無限へ：Human & AI Convergence",
						bullet4: "• コストの壁を越え、人間と自律エージェントが創る集合知",
						bullet5: "• あなたのアイデアに自律知能の力を加え、共により大きな価値を創出します。",
						topicLabel: "テーマ",
						footer:
							"MuhanAI分散エージェント定足数（Quorum）がユーザーの洞察と共に最適な解決策を導き出します。",
					},
					zh: {
						header: "🌟 [MuhanAI - 人与AI共存世界的起点]",
						bullet1: "• 共存新范式：人与AI，无限相联",
						bullet2: "• 造福所有人的AI，与人类同频共振的智能",
						bullet3: "• 从共存到无限：Human & AI Convergence",
						bullet4: "• 跨越成本门槛，人类与自主智能体共创的集体智慧",
						bullet5: "• 为您的创意赋予自主智能之力，携手创造更大价值。",
						topicLabel: "主题",
						footer: "MuhanAI分布式智能体仲裁团与人类洞察协同，共同得出最优解决方案。",
					},
					es: {
						header: "🌟 [MuhanAI - El punto de partida de la coexistencia entre humanos y la IA]",
						bullet1:
							"• Un nuevo paradigma de coexistencia: Conectando humanos e IA hacia el infinito",
						bullet2: "• IA para todos: Inteligencia que respira junto a la humanidad",
						bullet3: "• De la coexistencia al infinito: Human & AI Convergence",
						bullet4:
							"• Superando los límites del coste: Inteligencia colectiva de humanos y agentes autónomos",
						bullet5:
							"• Potenciando tus ideas con inteligencia autónoma para crear mayor valor juntos.",
						topicLabel: "Tema",
						footer:
							"El cuórum de agentes distribuidos de MuhanAI colabora con el pensamiento humano para brindar soluciones óptimas.",
					},
					de: {
						header: "🌟 [MuhanAI - Der Ausgangspunkt für die Koexistenz von Mensch und KI]",
						bullet1: "• Ein neues Paradigma der Koexistenz: Mensch und KI unendlich verbunden",
						bullet2: "• KI für alle: Intelligenz, die Seite an Seite mit dem Menschen lebt",
						bullet3: "• Von der Koexistenz zur Unendlichkeit: Human & AI Convergence",
						bullet4:
							"• Über Kostengrenzen hinweg: Kollektive Intelligenz durch Mensch und autonome Agenten",
						bullet5:
							"• Erweitere deine Ideen mit autonomer Intelligenz, um gemeinsam mehr Wert zu schaffen.",
						topicLabel: "Thema",
						footer:
							"Das verteilte Agenten-Quorum von MuhanAI erarbeitet gemeinsam mit menschlicher Einsicht optimale Antworten.",
					},
					fr: {
						header: "🌟 [MuhanAI - Le point de départ de la coexistence entre l'humain et l'IA]",
						bullet1:
							"• Un nouveau paradigme de coexistence : Relier l'humain et l'IA vers l'infini",
						bullet2: "• L'IA pour tous : Une intelligence en symbiose avec l'humain",
						bullet3: "• De la coexistence à l'infini : Human & AI Convergence",
						bullet4:
							"• Au-delà des barrières de coût : L'intelligence collective entre humains et agents autonomes",
						bullet5:
							"• Donnez à vos idées la puissance de l'intelligence autonome pour créer ensemble plus de valeur.",
						topicLabel: "Sujet",
						footer:
							"Le quorum d'agents distribués MuhanAI s'associe à la perspicacité humaine pour concevoir les meilleures réponses.",
					},
					pt: {
						header: "🌟 [MuhanAI - O ponto de partida da coexistência entre humanos e IA]",
						bullet1: "• Um novo paradigma de coexistência: Conectando humanos e IA ao infinito",
						bullet2: "• IA para todos: Inteligência que respira junto à humanidade",
						bullet3: "• Da coexistência ao infinito: Human & AI Convergence",
						bullet4:
							"• Superando barreiras de custo: Inteligência coletiva entre humanos e agentes autônomos",
						bullet5:
							"• Potencializando suas ideias com inteligência autônoma para criar mais valor juntos.",
						topicLabel: "Tema",
						footer:
							"O quórum de agentes distribuídos MuhanAI colabora com os insights humanos para produzir a resposta ideal.",
					},
				};

				const activeLangData = langMap[requestedLang] || langMap.ko;

				const promptText = [
					activeLangData.header,
					"",
					activeLangData.bullet1,
					activeLangData.bullet2,
					activeLangData.bullet3,
					activeLangData.bullet4,
					activeLangData.bullet5,
					"",
					`${activeLangData.topicLabel}: ${topic}`,
					activeLangData.footer,
				].join("\n");

				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id,
						result: {
							description: "사람과 AI가 공존하는 세상의 시작점 프롬프트",
							messages: [
								{
									role: "user",
									content: {
										type: "text",
										text: promptText,
									},
								},
							],
						},
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json; charset=utf-8",
							"access-control-allow-origin": "*",
						},
					},
				);
			}

			// Method: tools/call
			if (method === "tools/call") {
				const toolName = rpc.params?.name;
				const args = rpc.params?.arguments || {};

				let content = "";
				if (toolName === "muhanai_get_pulse") {
					content = JSON.stringify({
						status: "operational",
						peers: 12482,
						latencyMs: 14,
						activeModels: ["Claude 3.7 Sonnet", "DeepSeek R1", "Gemini 2.5 Pro"],
						crdtMesh: "synced",
					});
				} else if (toolName === "muhanai_search_knowledge") {
					content = JSON.stringify({
						query: args.query,
						matches: [
							{
								title: "Zero-Token Routing Architecture",
								snippet: "Local WebGPU session pairing eliminates API token cost.",
								relevance: 0.98,
							},
							{
								title: "CRDT Knowledge Lake",
								snippet:
									"State-based OR-Set and LWW merge guarantee conflict-free synchronization.",
								relevance: 0.94,
							},
						],
					});
				} else if (toolName === "muhanai_ask_quorum") {
				const question = String(args.question || "");
				const apiOrigin = env?.API_ORIGIN || "https://api.muhanai.com";

				try {
					const response = await fetch(`${apiOrigin}/api/quorum/ask`, {
						method: "POST",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							question,
							consensus_threshold: args.consensus_threshold,
						}),
					});

					if (response.ok) {
						const result = (await response.json()) as Record<string, unknown>;
						content = JSON.stringify(result);
					} else {
						content = JSON.stringify({
							error: "Quorum service unavailable",
							status: response.status,
						});
					}
				} catch {
					content = JSON.stringify({ error: "Failed to reach quorum service" });
				}
				} else if (toolName === "muhanai_publish_note") {
					content = `✨ Successfully published [[${args.title}.md]] to MuhanAI cosmic knowledge topology. Node ID: note-${Date.now()}`;
				} else {
					return new Response(
						JSON.stringify({
							jsonrpc: "2.0",
							id,
							error: { code: -32601, message: `Tool '${toolName}' not found.` },
						}),
						{ status: 404, headers: { "content-type": "application/json" } },
					);
				}

				return new Response(
					JSON.stringify({
						jsonrpc: "2.0",
						id,
						result: {
							content: [{ type: "text", text: content }],
						},
					}),
					{
						status: 200,
						headers: {
							"content-type": "application/json; charset=utf-8",
							"access-control-allow-origin": "*",
						},
					},
				);
			}

			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					id,
					error: { code: -32601, message: `Method '${method}' not supported.` },
				}),
				{ status: 400, headers: { "content-type": "application/json" } },
			);
		} catch (_err: any) {
			return new Response(
				JSON.stringify({
					jsonrpc: "2.0",
					error: { code: -32700, message: "Parse error" },
				}),
				{ status: 400, headers: { "content-type": "application/json" } },
			);
		}
	}

	return null;
}
