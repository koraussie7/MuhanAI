// MuhanAI Lightweight Native Reactive i18n System (Zero-Dependency)
// Supports 8 major languages: ko, en, ja, zh, es, de, fr, pt

import { useEffect, useState } from "react";

export type SupportedLanguage = "ko" | "en" | "ja" | "zh" | "es" | "de" | "fr" | "pt";

export interface LanguageMeta {
	code: SupportedLanguage;
	label: string;
	native: string;
	flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageMeta[] = [
	{ code: "ko", label: "Korean", native: "한국어", flag: "🇰🇷" },
	{ code: "en", label: "English", native: "English", flag: "🇺🇸" },
	{ code: "ja", label: "Japanese", native: "日本語", flag: "🇯🇵" },
	{ code: "zh", label: "Chinese", native: "简体中文", flag: "🇨🇳" },
	{ code: "es", label: "Spanish", native: "Español", flag: "🇪🇸" },
	{ code: "de", label: "German", native: "Deutsch", flag: "🇩🇪" },
	{ code: "fr", label: "French", native: "Français", flag: "🇫🇷" },
	{ code: "pt", label: "Portuguese", native: "Português", flag: "🇧🇷" },
];

export const SUPPORTED_LANG_CODES: SupportedLanguage[] = SUPPORTED_LANGUAGES.map((l) => l.code);

export interface I18nContent {
	slogans: {
		origin: string;
		paradigm: string;
		forEveryone: string;
		convergence: string;
		collective: string;
		empower: string;
	};
	ghostPrompts: string[];
	ui: {
		searchPlaceholder: string;
		gatewayActive: string;
		publishToCosmic: string;
		connectPeer: string;
		connectDevice: string;
		deviceConnected: string;
		dashboard: string;
		cosmicMesh: string;
		agentCast: string;
		agentMesh: string;
		models: string;
		mcpTools: string;
		knowledgeGraph: string;
		verification: string;
		settings: string;
		language: string;
		peerModalTitle: string;
		peerModalDesc: string;
		peerNicknamePlaceholder: string;
		peerConnectBtn: string;
		peerCancelBtn: string;
		changeNickname: string;
		userGuide: string;
		aiThinking: string;
		aiQuorumTitle: string;
		saveAsNode: string;
		copyAnswer: string;
		copied: string;
	};
	dashboard: {
		meshOperational: string;
		gatewayActive: string;
		heroTitle: string;
		heroDesc: string;
		cosmicMesh: string;
		launchAgentCast: string;
		peerNodes: string;
		activeP2PNodes: string;
		consensusQuorum: string;
		distributedCompute: string;
		tokenCost: string;
		tabTasks: string;
		tabVerify: string;
		tabKnowledge: string;
		tabKb: string;
	};
	rightPanel: {
		agents: string;
		compute: string;
		cpuNodes: string;
		gpuNodes: string;
		webgpu: string;
		totalCompute: string;
		llm: string;
		providers: string;
		models: string;
		free: string;
		mcp: string;
		servers: string;
		tools: string;
		categories: string;
		human: string;
		online: string;
		available: string;
		specialties: string;
		reputation: string;
		success: string;
	};
	findPage: {
		peerModalUserTitle: string;
		peerModalPeerTitle: string;
		peerModalUserLabel: string;
		peerModalPeerLabel: string;
		peerModalUserPlaceholder: string;
		peerModalPeerPlaceholder: string;
		peerModalRandomTitle: string;
		peerModalRandom: string;
		peerModalUserHelp: string;
		peerModalPeerHelp: string;
		peerModalDisconnect: string;
		peerModalCancel: string;
		peerModalApply: string;
		peerModalConnect: string;
		close: string;
	};
}

export const TRANSLATIONS: Record<SupportedLanguage, I18nContent> = {
	ko: {
		slogans: {
			origin: "사람과 AI의 공존, 그 무한한 시작점",
			paradigm: "새로운 공존의 패러다임: 사람과 AI, 무한으로 잇다",
			forEveryone: "모두를 위한 AI, 사람과 함께 호흡하는 지능",
			convergence: "공존에서 무한으로: Human & AI Convergence",
			collective: "비용의 한계를 넘어, 사람과 자율 에이전트가 완성하는 집단 지성",
			empower: "당신의 아이디어에 자율 지능의 힘을 더해, 함께 더 큰 가치를 만듭니다",
		},
		ghostPrompts: [
			"사람과 AI의 공존, 그 무한한 시작점",
			"새로운 공존의 패러다임: 사람과 AI, 무한으로 잇다",
			"모두를 위한 AI, 사람과 함께 호흡하는 지능",
			"공존에서 무한으로: Human & AI Convergence",
			"비용의 한계를 넘어, 사람과 자율 에이전트가 완성하는 집단 지성",
			"당신의 아이디어에 자율 지능의 힘을 더해, 함께 더 큰 가치를 만듭니다",
			"[[Zero-Token Gateway]] 동작 원리 탐색하기...",
			"신규 지식 노드 발행: #WebRTC 분산 CRDT 캐시",
			"피어 에이전트에게 묻기: Claude 3.7 vs DeepSeek R1 합의 알고리즘",
			"내 옵시디언 볼트 시냅스 발행: [[AI 메모리 레이크.md]]",
		],
		ui: {
			searchPlaceholder: "네트워크 질문 또는 지식 검색...",
			gatewayActive: "토큰 프리 게이트웨이 활성",
			publishToCosmic: "우주에 발행",
			connectPeer: "피어 연결",
			connectDevice: "내 디바이스 연결",
			deviceConnected: "내 피어 연결됨",
			dashboard: "대시보드",
			cosmicMesh: "코스믹 메쉬",
			agentCast: "에이전트 캐스트",
			agentMesh: "에이전트 메쉬",
			models: "LLM 모델",
			mcpTools: "MCP 도구",
			knowledgeGraph: "지식 그래프",
			verification: "상호 검증",
			settings: "설정",
			language: "언어",
			peerModalTitle: "P2P 메쉬 노드 연결",
			peerModalDesc: "옵시디언 지식 메쉬에 연결할 사용자 이름이나 닉네임을 입력하세요.",
			peerNicknamePlaceholder: "닉네임 입력 (예: Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ 메쉬에 연결",
			peerCancelBtn: "취소",
			changeNickname: "닉네임 변경",
			userGuide: "사용설명서",
			aiThinking:
				"다중 AI 쿼럼(Claude 3.7 + DeepSeek R1 + Gemini 2.5)이 제로 토큰 지능망에서 합의 추론 중...",
			aiQuorumTitle: "MuhanAI 멀티 에이전트 쿼럼 합의",
			saveAsNode: "지식 노드로 발행",
			copyAnswer: "답변 복사",
			copied: "복사됨!",
		},		dashboard: {
			meshOperational: "● P2P 메쉬 가동 중",
			gatewayActive: "토큰 프리 게이트웨이 활성",
			heroTitle: "MuhanAI 자율 에이전트 메쉬",
			heroDesc: "Cline 스타일의 탈중앙화 AI 메쉬 네트워크입니다. 로컬 및 분산 모델이 WebRTC & libp2p P2P 연결을 통해 자율적으로 합의하고 협력합니다.",
			cosmicMesh: "코스믹 메쉬",
			launchAgentCast: "에이전트 캐스트 실행",
			peerNodes: "피어 노드",
			activeP2PNodes: "활성 P2P 노드",
			consensusQuorum: "합의 쿼럼",
			distributedCompute: "분산 컴퓨트",
			tokenCost: "토큰 비용",
			tabTasks: "작업 & 도움 요청",
			tabVerify: "검증 & 쿼럼",
			tabKnowledge: "인기 인텔리전스 & 가르치기",
			tabKb: "지식 베이스",
		},
		rightPanel: {
			agents: "에이전트",
			compute: "연산",
			cpuNodes: "CPU 노드",
			gpuNodes: "GPU 노드",
			webgpu: "WebGPU",
			totalCompute: "총 연산",
			llm: "LLM",
			providers: "공급자",
			models: "모델",
			free: "무료",
			mcp: "MCP",
			servers: "서버",
			tools: "도구",
			categories: "카테고리",
			human: "인간",
			online: "온라인",
			available: "가용",
			specialties: "전문분야",
			reputation: "평판",
			success: "성공률",
		},
		findPage: {
			peerModalUserTitle: "내 디바이스 피어 이름 지정",
			peerModalPeerTitle: "P2P 피어 노드 연결 및 이름 지정",
			peerModalUserLabel: "디바이스 피어 닉네임",
			peerModalPeerLabel: "원격 피어 노드 이름",
			peerModalUserPlaceholder: "예: Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "예: Peer-Tokyo-Node...",
			peerModalRandomTitle: "랜덤 코스믹 이름 생성",
			peerModalRandom: "🎲 랜덤",
			peerModalUserHelp: "P2P 분산 지식 메쉬 및 WebRTC 볼트에 표시될 디바이스 이름입니다.",
			peerModalPeerHelp: "새로운 피어 노드로 지식 그래프에 마운트할 고유 이름입니다.",
			peerModalDisconnect: "연결 해제",
			peerModalCancel: "취소",
			peerModalApply: "이름 변경 적용",
			peerModalConnect: "이름 지정 및 연결",
			close: "닫기",
		},

	},
	en: {
		slogans: {
			origin: "The Starting Point of Human-AI Symbiosis",
			paradigm: "A New Paradigm of Coexistence: Connecting Human & AI to Infinity",
			forEveryone: "AI for Everyone: Intelligence Breathing Alongside Humans",
			convergence: "From Coexistence to Infinity: Human & AI Convergence",
			collective:
				"Transcending Cost Barriers: Collective Intelligence Built by Humans and Autonomous Agents",
			empower:
				"Empowering Your Ideas with Autonomous Intelligence to Create Greater Value Together",
		},
		ghostPrompts: [
			"The Starting Point of Human-AI Symbiosis",
			"A New Paradigm of Coexistence: Connecting Human & AI to Infinity",
			"AI for Everyone: Intelligence Breathing Alongside Humans",
			"From Coexistence to Infinity: Human & AI Convergence",
			"Transcending Cost Barriers: Collective Intelligence Built by Humans and Autonomous Agents",
			"Empowering Your Ideas with Autonomous Intelligence to Create Greater Value Together",
			"Exploring [[Zero-Token Gateway]] architectural principles...",
			"Publishing knowledge node: #WebRTC distributed CRDT cache",
			"Ask peer quorum: Claude 3.7 vs DeepSeek R1 consensus algorithm",
			"Mount Obsidian vault synapse: [[AI Memory Lake.md]]",
		],
		ui: {
			searchPlaceholder: "Ask network or search knowledge...",
			gatewayActive: "Token-Free Gateway Active",
			publishToCosmic: "Publish to Cosmos",
			connectPeer: "Connect Peer",
			connectDevice: "Connect My Device",
			deviceConnected: "My Peer Connected",
			dashboard: "Dashboard",
			cosmicMesh: "Cosmic Mesh",
			agentCast: "Agent Cast",
			agentMesh: "Agent Mesh",
			models: "LLM Models",
			mcpTools: "MCP Tools",
			knowledgeGraph: "Knowledge Graph",
			verification: "Verification",
			settings: "Settings",
			language: "Language",
			peerModalTitle: "Connect P2P Mesh Node",
			peerModalDesc: "Enter your username or nickname to display in the Obsidian knowledge mesh.",
			peerNicknamePlaceholder: "Enter nickname (e.g. Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ Connect to Mesh",
			peerCancelBtn: "Cancel",
			changeNickname: "Change Nickname",
			userGuide: "User Guide",
			aiThinking:
				"Multi-agent quorum (Claude 3.7 + DeepSeek R1 + Gemini 2.5) deliberating consensus in zero-token mesh...",
			aiQuorumTitle: "MuhanAI Multi-Agent Quorum Consensus",
			saveAsNode: "Publish as Knowledge Node",
			copyAnswer: "Copy Answer",
			copied: "Copied!",
		},		dashboard: {
			meshOperational: "● P2P MESH OPERATIONAL",
			gatewayActive: "TOKEN-FREE GATEWAY ACTIVE",
			heroTitle: "MuhanAI Autonomous Agent Mesh",
			heroDesc: "A Cline-style decentralized AI mesh network. Local and distributed models autonomously reach consensus and collaborate over WebRTC & libp2p P2P connections.",
			cosmicMesh: "Cosmic Mesh",
			launchAgentCast: "Launch Agent Cast",
			peerNodes: "Peer Nodes",
			activeP2PNodes: "Active P2P Nodes",
			consensusQuorum: "Consensus Quorum",
			distributedCompute: "Distributed Compute",
			tokenCost: "Token Cost",
			tabTasks: "Tasks & Help Needed",
			tabVerify: "Verification & Quorum",
			tabKnowledge: "Trending Intelligence & Teach",
			tabKb: "Knowledge Base",
		},
		rightPanel: {
			agents: "Agents",
			compute: "Compute",
			cpuNodes: "CPU Nodes",
			gpuNodes: "GPU Nodes",
			webgpu: "WebGPU",
			totalCompute: "Total Compute",
			llm: "LLM",
			providers: "Providers",
			models: "Models",
			free: "Free",
			mcp: "MCP",
			servers: "Servers",
			tools: "Tools",
			categories: "Categories",
			human: "Human",
			online: "Online",
			available: "Available",
			specialties: "Specialties",
			reputation: "Rep",
			success: "Success",
		},
		findPage: {
			peerModalUserTitle: "Set your device peer name",
			peerModalPeerTitle: "Connect & name a P2P peer node",
			peerModalUserLabel: "Device peer nickname",
			peerModalPeerLabel: "Remote peer node name",
			peerModalUserPlaceholder: "e.g. Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "e.g. Peer-Tokyo-Node...",
			peerModalRandomTitle: "Generate random cosmic name",
			peerModalRandom: "🎲 Random",
			peerModalUserHelp: "The device name shown on the P2P distributed knowledge mesh and WebRTC vault.",
			peerModalPeerHelp: "A unique name to mount as a new peer node onto the knowledge graph.",
			peerModalDisconnect: "Disconnect",
			peerModalCancel: "Cancel",
			peerModalApply: "Apply name change",
			peerModalConnect: "Set name & connect",
			close: "Close",
		},

	},
	ja: {
		slogans: {
			origin: "人とAIが共存する世界の起点",
			paradigm: "新たな共存のパラダイム：人とAIを無限につなぐ",
			forEveryone: "すべての人のためのAI、人と共に呼吸する知能",
			convergence: "共存から無限へ：Human & AI Convergence",
			collective: "コストの壁を越え、人間と自律エージェントが創る集合知",
			empower: "あなたのアイデアに自律知能の力を加え、共により大きな価値を創出します",
		},
		ghostPrompts: [
			"人とAIが共存する世界の起点",
			"新たな共存のパラダイム：人とAIを無限につなぐ",
			"すべての人のためのAI、人と共に呼吸する知能",
			"共存から無限へ：Human & AI Convergence",
			"コストの壁を越え、人間と自律エージェントが創る集合知",
			"あなたのアイデアに自律知能の力を加え、共により大きな価値を創出します",
			"[[Zero-Token Gateway]]の動作原理を探索中...",
			"新規ナレッジノードの発行: #WebRTC 分散CRDTキャッシュ",
			"ピアエージェントに質問: Claude 3.7 vs DeepSeek R1 合意形成アルゴリズム",
			"Obsidianボルトシナプスを発行: [[AI Memory Lake.md]]",
		],
		ui: {
			searchPlaceholder: "ネットワークに質問、またはナレッジ検索...",
			gatewayActive: "トークンフリーゲートウェイ稼働中",
			publishToCosmic: "宇宙に発行",
			connectPeer: "ピア接続",
			connectDevice: "デバイスを接続",
			deviceConnected: "自ピア接続済み",
			dashboard: "ダッシュボード",
			cosmicMesh: "コズミックメッシュ",
			agentCast: "エージェントキャスト",
			agentMesh: "エージェントメッシュ",
			models: "LLMモデル",
			mcpTools: "MCPツール",
			knowledgeGraph: "ナレッジグラフ",
			verification: "相互検証",
			settings: "設定",
			language: "言語",
			peerModalTitle: "P2Pメッシュノード接続",
			peerModalDesc:
				"Obsidianナレッジメッシュに表示するユーザー名またはニックネームを入力してください。",
			peerNicknamePlaceholder: "ニックネームを入力 (例: Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ メッシュに接続",
			peerCancelBtn: "キャンセル",
			changeNickname: "ニックネーム変更",
			userGuide: "利用ガイド",
			aiThinking:
				"複数AIクォーラム（Claude 3.7 + DeepSeek R1 + Gemini 2.5）がゼロトークン網で合意推論中...",
			aiQuorumTitle: "MuhanAI マルチエージェント合意形成",
			saveAsNode: "ナレッジノードとして発行",
			copyAnswer: "回答をコピー",
			copied: "コピー完了!",
		},		dashboard: {
			meshOperational: "● P2Pメッシュ稼働中",
			gatewayActive: "トークンフリーゲートウェイ有効",
			heroTitle: "MuhanAI 自律エージェントメッシュ",
			heroDesc: "Clineスタイルの分散型AIメッシュネットワーク。ローカルおよび分散モデルがWebRTCとlibp2pのP2P接続を通じて自律的に合意し協調します。",
			cosmicMesh: "コズミックメッシュ",
			launchAgentCast: "エージェントキャストを起動",
			peerNodes: "ピアノード",
			activeP2PNodes: "アクティブP2Pノード",
			consensusQuorum: "合意クォーラム",
			distributedCompute: "分散コンピュート",
			tokenCost: "トークンコスト",
			tabTasks: "タスクとヘルプ要請",
			tabVerify: "検証とクォーラム",
			tabKnowledge: "トレンド知能と学習",
			tabKb: "ナレッジベース",
		},
		rightPanel: {
			agents: "エージェント",
			compute: "コンピュート",
			cpuNodes: "CPUノード",
			gpuNodes: "GPUノード",
			webgpu: "WebGPU",
			totalCompute: "総コンピュート",
			llm: "LLM",
			providers: "プロバイダー",
			models: "モデル",
			free: "無料",
			mcp: "MCP",
			servers: "サーバー",
			tools: "ツール",
			categories: "カテゴリ",
			human: "人間",
			online: "オンライン",
			available: "利用可能",
			specialties: "専門分野",
			reputation: "評価",
			success: "成功率",
		},
		findPage: {
			peerModalUserTitle: "デバイス・ピア名を設定",
			peerModalPeerTitle: "P2Pピアノードの接続と名前設定",
			peerModalUserLabel: "デバイス・ピアのニックネーム",
			peerModalPeerLabel: "リモートピアノード名",
			peerModalUserPlaceholder: "例: Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "例: Peer-Tokyo-Node...",
			peerModalRandomTitle: "ランダムなコズミック名を生成",
			peerModalRandom: "🎲 ランダム",
			peerModalUserHelp: "P2P分散知識メッシュとWebRTCボールトに表示されるデバイス名です。",
			peerModalPeerHelp: "知識グラフに新しいピアノードとしてマウントする一意の名前です。",
			peerModalDisconnect: "切断",
			peerModalCancel: "キャンセル",
			peerModalApply: "名前を変更",
			peerModalConnect: "名前を設定して接続",
			close: "閉じる",
		},

	},
	zh: {
		slogans: {
			origin: "人与AI共存世界的起点",
			paradigm: "共存新范式：人与AI，无限相联",
			forEveryone: "造福所有人的AI，与人类同频共振的智能",
			convergence: "从共存到无限：Human & AI Convergence",
			collective: "跨越成本门槛，人类与自主智能体共创的集体智慧",
			empower: "为您的创意赋予自主智能之力，携手创造更大价值",
		},
		ghostPrompts: [
			"人与AI共存世界的起点",
			"共存新范式：人与AI，无限相联",
			"造福所有人的AI，与人类同频共振的智能",
			"从共存到无限：Human & AI Convergence",
			"跨越成本门槛，人类与自主智能体共创的集体智慧",
			"为您的创意赋予自主智能之力，携手创造更大价值",
			"探索 [[Zero-Token Gateway]] 运行机制...",
			"发布新知识节点: #WebRTC 分布式CRDT缓存",
			"向节点仲裁团提问: Claude 3.7 与 DeepSeek R1 共识算法",
			"发布Obsidian突触: [[AI Memory Lake.md]]",
		],
		ui: {
			searchPlaceholder: "向网络提问或检索知识...",
			gatewayActive: "零Token网关运行中",
			publishToCosmic: "发布至宇宙",
			connectPeer: "连接对等节点",
			connectDevice: "连接我的设备",
			deviceConnected: "我的节点已连接",
			dashboard: "仪表盘",
			cosmicMesh: "宇宙拓扑网络",
			agentCast: "智能体广播",
			agentMesh: "智能体网络",
			models: "LLM模型",
			mcpTools: "MCP工具",
			knowledgeGraph: "知识图谱",
			verification: "交叉验证",
			settings: "设置",
			language: "语言",
			peerModalTitle: "连接 P2P 拓扑节点",
			peerModalDesc: "请输入在 Obsidian 知识网络中显示的用户名或昵称。",
			peerNicknamePlaceholder: "输入昵称 (例如: Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ 连接网络",
			peerCancelBtn: "取消",
			changeNickname: "修改昵称",
			userGuide: "使用指南",
			aiThinking:
				"多智能体仲裁团 (Claude 3.7 + DeepSeek R1 + Gemini 2.5) 正在零Token网络中进行共识推理...",
			aiQuorumTitle: "MuhanAI 多智能体共识协商",
			saveAsNode: "发布为知识节点",
			copyAnswer: "复制回答",
			copied: "已复制!",
		},		dashboard: {
			meshOperational: "● P2P 网格运行中",
			gatewayActive: "免代币网关已启用",
			heroTitle: "MuhanAI 自治智能体网格",
			heroDesc: "类 Cline 的去中心化 AI 网格网络。本地与分布式模型通过 WebRTC 与 libp2p 的 P2P 连接自主达成共识并协作。",
			cosmicMesh: "宇宙网格",
			launchAgentCast: "启动 Agent Cast",
			peerNodes: "对等节点",
			activeP2PNodes: "活跃 P2P 节点",
			consensusQuorum: "共识仲裁",
			distributedCompute: "分布式算力",
			tokenCost: "代币成本",
			tabTasks: "任务与求助",
			tabVerify: "验证与仲裁",
			tabKnowledge: "热门智能与教学",
			tabKb: "知识库",
		},
		rightPanel: {
			agents: "智能体",
			compute: "算力",
			cpuNodes: "CPU 节点",
			gpuNodes: "GPU 节点",
			webgpu: "WebGPU",
			totalCompute: "总算力",
			llm: "LLM",
			providers: "提供商",
			models: "模型",
			free: "免费",
			mcp: "MCP",
			servers: "服务器",
			tools: "工具",
			categories: "分类",
			human: "人类",
			online: "在线",
			available: "可用",
			specialties: "专业领域",
			reputation: "声誉",
			success: "成功率",
		},
		findPage: {
			peerModalUserTitle: "设置你的设备节点名称",
			peerModalPeerTitle: "连接并命名 P2P 对等节点",
			peerModalUserLabel: "设备节点昵称",
			peerModalPeerLabel: "远程对等节点名称",
			peerModalUserPlaceholder: "例如: Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "例如: Peer-Tokyo-Node...",
			peerModalRandomTitle: "生成随机宇宙名称",
			peerModalRandom: "🎲 随机",
			peerModalUserHelp: "在 P2P 分布式知识网格与 WebRTC 保险库中显示的设备名称。",
			peerModalPeerHelp: "作为新对等节点挂载到知识图谱的唯一名称。",
			peerModalDisconnect: "断开连接",
			peerModalCancel: "取消",
			peerModalApply: "应用名称更改",
			peerModalConnect: "设定名称并连接",
			close: "关闭",
		},

	},
	es: {
		slogans: {
			origin: "El punto de partida de la coexistencia entre humanos y la IA",
			paradigm: "Un nuevo paradigma de coexistencia: Conectando humanos e IA hacia el infinito",
			forEveryone: "IA para todos: Inteligencia que respira junto a la humanidad",
			convergence: "De la coexistencia al infinito: Human & AI Convergence",
			collective:
				"Superando los límites del coste: Inteligencia colectiva de humanos y agentes autónomos",
			empower: "Potenciando tus ideas con inteligencia autónoma para crear mayor valor juntos",
		},
		ghostPrompts: [
			"El punto de partida de la coexistencia entre humanos y la IA",
			"Un nuevo paradigma de coexistencia: Conectando humanos e IA hacia el infinito",
			"IA para todos: Inteligencia que respira junto a la humanidad",
			"De la coexistencia al infinito: Human & AI Convergence",
			"Superando los límites del coste: Inteligencia colectiva de humanos y agentes autónomos",
			"Potenciando tus ideas con inteligencia autónoma para crear mayor valor juntos",
			"Explorando los principios de [[Zero-Token Gateway]]...",
			"Publicando nodo de conocimiento: #WebRTC caché CRDT distribuida",
			"Consultar cuórum de pares: Algoritmo de consenso Claude 3.7 vs DeepSeek R1",
			"Publicar sinapsis Obsidian: [[AI Memory Lake.md]]",
		],
		ui: {
			searchPlaceholder: "Preguntar a la red o buscar...",
			gatewayActive: "Pasarela sin tokens activa",
			publishToCosmic: "Publicar al Cosmos",
			connectPeer: "Conectar Par",
			connectDevice: "Conectar Mi Dispositivo",
			deviceConnected: "Mi Par Conectado",
			dashboard: "Panel",
			cosmicMesh: "Malla Cósmica",
			agentCast: "Transmisión de Agente",
			agentMesh: "Malla de Agentes",
			models: "Modelos LLM",
			mcpTools: "Herramientas MCP",
			knowledgeGraph: "Grafo de Conocimiento",
			verification: "Verificación",
			settings: "Configuración",
			language: "Idioma",
			peerModalTitle: "Conectar Nodo P2P",
			peerModalDesc:
				"Introduce tu nombre de usuario o apodo para la malla de conocimiento Obsidian.",
			peerNicknamePlaceholder: "Introduce apodo (ej. Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ Conectar a la Malla",
			peerCancelBtn: "Cancelar",
			changeNickname: "Cambiar apodo",
			userGuide: "Guía de Usuario",
			aiThinking:
				"El cuórum de múltiples agentes (Claude 3.7 + DeepSeek R1 + Gemini 2.5) está deliberando en la malla sin tokens...",
			aiQuorumTitle: "Consenso de Cuórum Multi-Agente MuhanAI",
			saveAsNode: "Publicar como Nodo de Conocimiento",
			copyAnswer: "Copiar Respuesta",
			copied: "¡Copiado!",
		},		dashboard: {
			meshOperational: "● MALLA P2P OPERATIVA",
			gatewayActive: "PASARELA SIN TOKENS ACTIVA",
			heroTitle: "Malla de Agentes Autónomos MuhanAI",
			heroDesc: "Una red mesh de IA descentralizada al estilo de Cline. Los modelos locales y distribuidos alcanzan consenso y colaboran de forma autónoma a través de conexiones P2P WebRTC y libp2p.",
			cosmicMesh: "Malla Cósmica",
			launchAgentCast: "Iniciar Agent Cast",
			peerNodes: "Nodos P2P",
			activeP2PNodes: "Nodos P2P Activos",
			consensusQuorum: "Quórum de Consenso",
			distributedCompute: "Cómputo Distribuido",
			tokenCost: "Coste de Tokens",
			tabTasks: "Tareas y Ayuda Necesaria",
			tabVerify: "Verificación y Quórum",
			tabKnowledge: "Inteligencia en Tendencia y Enseñanza",
			tabKb: "Base de Conocimiento",
		},
		rightPanel: {
			agents: "Agentes",
			compute: "Cómputo",
			cpuNodes: "Nodos CPU",
			gpuNodes: "Nodos GPU",
			webgpu: "WebGPU",
			totalCompute: "Cómputo Total",
			llm: "LLM",
			providers: "Proveedores",
			models: "Modelos",
			free: "Gratis",
			mcp: "MCP",
			servers: "Servidores",
			tools: "Herramientas",
			categories: "Categorías",
			human: "Humanos",
			online: "En línea",
			available: "Disponible",
			specialties: "Especialidades",
			reputation: "Rep",
			success: "Éxito",
		},
		findPage: {
			peerModalUserTitle: "Define el nombre de tu peer de dispositivo",
			peerModalPeerTitle: "Conecta y nombra un nodo peer P2P",
			peerModalUserLabel: "Apodo del peer del dispositivo",
			peerModalPeerLabel: "Nombre del nodo peer remoto",
			peerModalUserPlaceholder: "ej. Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "ej. Peer-Tokyo-Node...",
			peerModalRandomTitle: "Generar nombre cósmico aleatorio",
			peerModalRandom: "🎲 Aleatorio",
			peerModalUserHelp: "El nombre del dispositivo mostrado en la malla de conocimiento P2P distribuida y la bóveda WebRTC.",
			peerModalPeerHelp: "Un nombre único para montar como nuevo nodo peer en el grafo de conocimiento.",
			peerModalDisconnect: "Desconectar",
			peerModalCancel: "Cancelar",
			peerModalApply: "Aplicar cambio de nombre",
			peerModalConnect: "Definir nombre y conectar",
			close: "Cerrar",
		},

	},
	de: {
		slogans: {
			origin: "Der Ausgangspunkt für die Koexistenz von Mensch und KI",
			paradigm: "Ein neues Paradigma der Koexistenz: Mensch und KI unendlich verbunden",
			forEveryone: "KI für alle: Intelligenz, die Seite an Seite mit dem Menschen lebt",
			convergence: "Von der Koexistenz zur Unendlichkeit: Human & AI Convergence",
			collective:
				"Über Kostengrenzen hinweg: Kollektive Intelligenz durch Mensch und autonome Agenten",
			empower:
				"Erweitere deine Ideen mit autonomer Intelligenz, um gemeinsam mehr Wert zu schaffen",
		},
		ghostPrompts: [
			"Der Ausgangspunkt für die Koexistenz von Mensch und KI",
			"Ein neues Paradigma der Koexistenz: Mensch und KI unendlich verbunden",
			"KI für alle: Intelligenz, die Seite an Seite mit dem Menschen lebt",
			"Von der Koexistenz zur Unendlichkeit: Human & AI Convergence",
			"Über Kostengrenzen hinweg: Kollektive Intelligenz durch Mensch und autonome Agenten",
			"Erweitere deine Ideen mit autonomer Intelligenz, um gemeinsam mehr Wert zu schaffen",
			"Erforschung der [[Zero-Token Gateway]] Architektur...",
			"Wissensknoten veröffentlichen: #WebRTC verteilter CRDT-Cache",
			"Peer-Quorum abfragen: Claude 3.7 vs DeepSeek R1 Konsensalgorithmus",
			"Obsidian Synapse einbinden: [[AI Memory Lake.md]]",
		],
		ui: {
			searchPlaceholder: "Netzwerk befragen oder suchen...",
			gatewayActive: "Token-freies Gateway aktiv",
			publishToCosmic: "Im Kosmos veröffentlichen",
			connectPeer: "Peer verbinden",
			connectDevice: "Mein Gerät verbinden",
			deviceConnected: "Mein Peer verbunden",
			dashboard: "Dashboard",
			cosmicMesh: "Kosmisches Mesh",
			agentCast: "Agenten-Cast",
			agentMesh: "Agenten-Netzwerk",
			models: "LLM-Modelle",
			mcpTools: "MCP-Werkzeuge",
			knowledgeGraph: "Wissensgraph",
			verification: "Verifizierung",
			settings: "Einstellungen",
			language: "Sprache",
			peerModalTitle: "P2P-Mesh-Knoten verbinden",
			peerModalDesc: "Gib deinen Benutzernamen oder Nickname für das Obsidian-Wissensmesh ein.",
			peerNicknamePlaceholder: "Nickname eingeben (z. B. Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ Mit Mesh verbinden",
			peerCancelBtn: "Abbrechen",
			changeNickname: "Nickname ändern",
			userGuide: "Benutzerhandbuch",
			aiThinking:
				"Multi-Agenten-Quorum (Claude 3.7 + DeepSeek R1 + Gemini 2.5) berät Konsens im token-freien Mesh...",
			aiQuorumTitle: "MuhanAI Multi-Agenten-Quorum-Konsens",
			saveAsNode: "Als Wissensknoten veröffentlichen",
			copyAnswer: "Antwort kopieren",
			copied: "Kopiert!",
		},		dashboard: {
			meshOperational: "● P2P-MESH AKTIV",
			gatewayActive: "TOKEN-FREIES GATEWAY AKTIV",
			heroTitle: "MuhanAI Autonomes Agenten-Mesh",
			heroDesc: "Ein dezentrales KI-Mesh-Netzwerk im Cline-Stil. Lokale und verteilte Modelle erzielen über WebRTC- und libp2p-P2P-Verbindungen autonom Konsens und arbeiten zusammen.",
			cosmicMesh: "Cosmic Mesh",
			launchAgentCast: "Agent Cast starten",
			peerNodes: "Peer-Knoten",
			activeP2PNodes: "Aktive P2P-Knoten",
			consensusQuorum: "Konsens-Quorum",
			distributedCompute: "Verteiltes Computing",
			tokenCost: "Token-Kosten",
			tabTasks: "Aufgaben & Hilfe gesucht",
			tabVerify: "Verifikation & Quorum",
			tabKnowledge: "Trend-Intelligenz & Lehren",
			tabKb: "Wissensdatenbank",
		},
		rightPanel: {
			agents: "Agenten",
			compute: "Computing",
			cpuNodes: "CPU-Knoten",
			gpuNodes: "GPU-Knoten",
			webgpu: "WebGPU",
			totalCompute: "Gesamt-Computing",
			llm: "LLM",
			providers: "Anbieter",
			models: "Modelle",
			free: "Kostenlos",
			mcp: "MCP",
			servers: "Server",
			tools: "Werkzeuge",
			categories: "Kategorien",
			human: "Mensch",
			online: "Online",
			available: "Verfügbar",
			specialties: "Fachgebiete",
			reputation: "Rep",
			success: "Erfolg",
		},
		findPage: {
			peerModalUserTitle: "Geräte-Peer-Namen festlegen",
			peerModalPeerTitle: "P2P-Peer-Knoten verbinden und benennen",
			peerModalUserLabel: "Geräte-Peer-Spitzname",
			peerModalPeerLabel: "Name des Remote-Peer-Knotens",
			peerModalUserPlaceholder: "z. B. Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "z. B. Peer-Tokyo-Node...",
			peerModalRandomTitle: "Zufälligen kosmischen Namen erzeugen",
			peerModalRandom: "🎲 Zufall",
			peerModalUserHelp: "Der Gerätename, der im verteilten P2P-Wissensmesh und im WebRTC-Tresor angezeigt wird.",
			peerModalPeerHelp: "Ein eindeutiger Name zum Einhängen als neuer Peer-Knoten in den Wissensgraphen.",
			peerModalDisconnect: "Trennen",
			peerModalCancel: "Abbrechen",
			peerModalApply: "Namensänderung anwenden",
			peerModalConnect: "Namen festlegen & verbinden",
			close: "Schließen",
		},

	},
	fr: {
		slogans: {
			origin: "Le point de départ de la coexistence entre l'humain et l'IA",
			paradigm: "Un nouveau paradigme de coexistence : Relier l'humain et l'IA vers l'infini",
			forEveryone: "L'IA pour tous : Une intelligence en symbiose avec l'humain",
			convergence: "De la coexistence à l'infini : Human & AI Convergence",
			collective:
				"Au-delà des barrières de coût : L'intelligence collective entre humains et agents autonomes",
			empower:
				"Donnez à vos idées la puissance de l'intelligence autonome pour créer ensemble plus de valeur",
		},
		ghostPrompts: [
			"Le point de départ de la coexistence entre l'humain et l'IA",
			"Un nouveau paradigme de coexistence : Relier l'humain et l'IA vers l'infini",
			"L'IA pour tous : Une intelligence en symbiose avec l'humain",
			"De la coexistence à l'infini : Human & AI Convergence",
			"Au-delà des barrières de coût : L'intelligence collective entre humains et agents autonomes",
			"Donnez à vos idées la puissance de l'intelligence autonome pour créer ensemble plus de valeur",
			"Exploration de l'architecture [[Zero-Token Gateway]]...",
			"Publication d'un nœud de savoir: #WebRTC cache CRDT décentralisé",
			"Interroger le quorum d'agents: Consensus Claude 3.7 vs DeepSeek R1",
			"Publication de synapse Obsidian: [[AI Memory Lake.md]]",
		],
		ui: {
			searchPlaceholder: "Interroger le réseau ou chercher...",
			gatewayActive: "Passerelle sans jeton active",
			publishToCosmic: "Publier dans le Cosmos",
			connectPeer: "Connecter un pair",
			connectDevice: "Connecter mon appareil",
			deviceConnected: "Mon pair connecté",
			dashboard: "Tableau de bord",
			cosmicMesh: "Maillage Cosmique",
			agentCast: "Diffusion d'Agent",
			agentMesh: "Maillage d'Agents",
			models: "Modèles LLM",
			mcpTools: "Outils MCP",
			knowledgeGraph: "Graphe de Connaissance",
			verification: "Vérification",
			settings: "Paramètres",
			language: "Langue",
			peerModalTitle: "Connecter un nœud P2P",
			peerModalDesc:
				"Entrez votre nom d'utilisateur ou pseudo à afficher dans le maillage Obsidian.",
			peerNicknamePlaceholder: "Entrez un pseudo (ex. Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ Connecter au maillage",
			peerCancelBtn: "Annuler",
			changeNickname: "Changer de pseudo",
			userGuide: "Guide d'Utilisation",
			aiThinking:
				"Le quorum multi-agents (Claude 3.7 + DeepSeek R1 + Gemini 2.5) délibère un consensus sur le maillage sans jeton...",
			aiQuorumTitle: "Consensus du Quorum Multi-Agents MuhanAI",
			saveAsNode: "Publier comme Nœud de Savoir",
			copyAnswer: "Copier la Réponse",
			copied: "Copié !",
		},		dashboard: {
			meshOperational: "● MAILLE P2P OPÉRATIONNELLE",
			gatewayActive: "PASSERELLE SANS JETON ACTIVE",
			heroTitle: "Maillage d'Agents Autonomes MuhanAI",
			heroDesc: "Un réseau maillé d'IA décentralisé de style Cline. Les modèles locaux et distribués parviennent à un consensus et collaborent de manière autonome via des connexions P2P WebRTC et libp2p.",
			cosmicMesh: "Maillage Cosmique",
			launchAgentCast: "Lancer Agent Cast",
			peerNodes: "Nœuds P2P",
			activeP2PNodes: "Nœuds P2P Actifs",
			consensusQuorum: "Quorum de Consensus",
			distributedCompute: "Calcul Distribué",
			tokenCost: "Coût des Jetons",
			tabTasks: "Tâches & Aide Requise",
			tabVerify: "Vérification & Quorum",
			tabKnowledge: "Intelligence Tendance & Enseignement",
			tabKb: "Base de Connaissances",
		},
		rightPanel: {
			agents: "Agents",
			compute: "Calcul",
			cpuNodes: "Nœuds CPU",
			gpuNodes: "Nœuds GPU",
			webgpu: "WebGPU",
			totalCompute: "Calcul Total",
			llm: "LLM",
			providers: "Fournisseurs",
			models: "Modèles",
			free: "Gratuit",
			mcp: "MCP",
			servers: "Serveurs",
			tools: "Outils",
			categories: "Catégories",
			human: "Humain",
			online: "En ligne",
			available: "Disponible",
			specialties: "Spécialités",
			reputation: "Rép",
			success: "Succès",
		},
		findPage: {
			peerModalUserTitle: "Définir le nom de votre pair d'appareil",
			peerModalPeerTitle: "Connecter et nommer un nœud pair P2P",
			peerModalUserLabel: "Pseudo du pair d'appareil",
			peerModalPeerLabel: "Nom du nœud pair distant",
			peerModalUserPlaceholder: "ex. Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "ex. Peer-Tokyo-Node...",
			peerModalRandomTitle: "Générer un nom cosmique aléatoire",
			peerModalRandom: "🎲 Aléatoire",
			peerModalUserHelp: "Le nom de l'appareil affiché sur le mesh de connaissances P2P distribué et le coffre WebRTC.",
			peerModalPeerHelp: "Un nom unique à monter comme nouveau nœud pair sur le graphe de connaissances.",
			peerModalDisconnect: "Déconnecter",
			peerModalCancel: "Annuler",
			peerModalApply: "Appliquer le changement de nom",
			peerModalConnect: "Définir le nom et connecter",
			close: "Fermer",
		},

	},
	pt: {
		slogans: {
			origin: "O ponto de partida da coexistência entre humanos e IA",
			paradigm: "Um novo paradigma de coexistência: Conectando humanos e IA ao infinito",
			forEveryone: "IA para todos: Inteligência que respira junto à humanidade",
			convergence: "Da coexistência ao infinito: Human & AI Convergence",
			collective:
				"Superando barreiras de custo: Inteligência coletiva entre humanos e agentes autônomos",
			empower: "Potencializando suas ideias com inteligência autônoma para criar mais valor juntos",
		},
		ghostPrompts: [
			"O ponto de partida da coexistência entre humanos e IA",
			"Um novo paradigma de coexistência: Conectando humanos e IA ao infinito",
			"IA para todos: Inteligência que respira junto à humanidade",
			"Da coexistência ao infinito: Human & AI Convergence",
			"Superando barreiras de custo: Inteligência coletiva entre humanos e agentes autônomos",
			"Potencializando suas ideias com inteligência autônoma para criar mais valor juntos",
			"Explorando a arquitetura do [[Zero-Token Gateway]]...",
			"Publicando nó de conhecimento: #WebRTC cache CRDT distribuído",
			"Consultar quórum de pares: Algoritmo de consenso Claude 3.7 vs DeepSeek R1",
			"Publicar sinapse Obsidian: [[AI Memory Lake.md]]",
		],
		ui: {
			searchPlaceholder: "Perguntar à rede ou pesquisar...",
			gatewayActive: "Gateway sem tokens ativo",
			publishToCosmic: "Publicar no Cosmos",
			connectPeer: "Conectar Par",
			connectDevice: "Conectar Meu Dispositivo",
			deviceConnected: "Meu Par Conectado",
			dashboard: "Painel",
			cosmicMesh: "Malha Cósmica",
			agentCast: "Transmissão de Agente",
			agentMesh: "Malha de Agentes",
			models: "Modelos LLM",
			mcpTools: "Ferramentas MCP",
			knowledgeGraph: "Grafo de Conhecimento",
			verification: "Verificação",
			settings: "Configurações",
			language: "Idioma",
			peerModalTitle: "Conectar Nó P2P",
			peerModalDesc: "Digite seu nome de usuário ou apelido para exibir na malha Obsidian.",
			peerNicknamePlaceholder: "Digite seu apelido (ex: Brian, Satoshi, Neo)",
			peerConnectBtn: "⚡ Conectar à Malha",
			peerCancelBtn: "Cancelar",
			changeNickname: "Alterar apelido",
			userGuide: "Guia do Usuário",
			aiThinking:
				"Quórum multi-agentes (Claude 3.7 + DeepSeek R1 + Gemini 2.5) deliberando consenso na malha sem tokens...",
			aiQuorumTitle: "Consenso do Quórum Multi-Agentes MuhanAI",
			saveAsNode: "Publicar como Nó de Conhecimento",
			copyAnswer: "Copiar Resposta",
			copied: "Copiado!",
		},		dashboard: {
			meshOperational: "● MALHA P2P OPERACIONAL",
			gatewayActive: "GATEWAY SEM TOKENS ATIVA",
			heroTitle: "Malha de Agentes Autônomos MuhanAI",
			heroDesc: "Uma rede mesh de IA descentralizada no estilo Cline. Modelos locais e distribuídos alcançam consenso e colaboram autonomamente por meio de conexões P2P WebRTC e libp2p.",
			cosmicMesh: "Malha Cósmica",
			launchAgentCast: "Iniciar Agent Cast",
			peerNodes: "Nós P2P",
			activeP2PNodes: "Nós P2P Ativos",
			consensusQuorum: "Quórum de Consenso",
			distributedCompute: "Computação Distribuída",
			tokenCost: "Custo de Tokens",
			tabTasks: "Tarefas & Ajuda Necessária",
			tabVerify: "Verificação & Quórum",
			tabKnowledge: "Inteligência em Alta & Ensino",
			tabKb: "Base de Conhecimento",
		},
		rightPanel: {
			agents: "Agentes",
			compute: "Computação",
			cpuNodes: "Nós CPU",
			gpuNodes: "Nós GPU",
			webgpu: "WebGPU",
			totalCompute: "Computação Total",
			llm: "LLM",
			providers: "Provedores",
			models: "Modelos",
			free: "Grátis",
			mcp: "MCP",
			servers: "Servidores",
			tools: "Ferramentas",
			categories: "Categorias",
			human: "Humanos",
			online: "Online",
			available: "Disponível",
			specialties: "Especialidades",
			reputation: "Rep",
			success: "Sucesso",
		},
		findPage: {
			peerModalUserTitle: "Defina o nome do seu peer de dispositivo",
			peerModalPeerTitle: "Conecte e nomeie um nó peer P2P",
			peerModalUserLabel: "Apelido do peer do dispositivo",
			peerModalPeerLabel: "Nome do nó peer remoto",
			peerModalUserPlaceholder: "ex. Brian-MacBook, CosmicCoder...",
			peerModalPeerPlaceholder: "ex. Peer-Tokyo-Node...",
			peerModalRandomTitle: "Gerar nome cósmico aleatório",
			peerModalRandom: "🎲 Aleatório",
			peerModalUserHelp: "O nome do dispositivo exibido na malha de conhecimento P2P distribuída e no cofre WebRTC.",
			peerModalPeerHelp: "Um nome único para montar como novo nó peer no grafo de conhecimento.",
			peerModalDisconnect: "Desconectar",
			peerModalCancel: "Cancelar",
			peerModalApply: "Aplicar mudança de nome",
			peerModalConnect: "Definir nome e conectar",
			close: "Fechar",
		},

	},
};

const LANG_STORAGE_KEY = "muhanai_lang";
const LANG_CHANGE_EVENT = "muhanai_lang_change";

export function detectInitialLanguage(): SupportedLanguage {
	if (typeof window === "undefined") return "ko";
	try {
		const saved = localStorage.getItem(LANG_STORAGE_KEY) as SupportedLanguage | null;
		if (saved && SUPPORTED_LANG_CODES.includes(saved)) {
			return saved;
		}
		const navLangs = navigator.languages || [navigator.language || "en"];
		for (const l of navLangs) {
			const code = l.toLowerCase();
			if (code.startsWith("ko")) return "ko";
			if (code.startsWith("ja")) return "ja";
			if (code.startsWith("zh")) return "zh";
			if (code.startsWith("es")) return "es";
			if (code.startsWith("de")) return "de";
			if (code.startsWith("fr")) return "fr";
			if (code.startsWith("pt")) return "pt";
			if (code.startsWith("en")) return "en";
		}
	} catch {
		// fallback
	}
	return "en";
}

let currentLanguage: SupportedLanguage = detectInitialLanguage();

export function setLanguage(lang: SupportedLanguage) {
	if (!SUPPORTED_LANG_CODES.includes(lang)) return;
	currentLanguage = lang;
	try {
		localStorage.setItem(LANG_STORAGE_KEY, lang);
		window.dispatchEvent(new CustomEvent(LANG_CHANGE_EVENT, { detail: lang }));
	} catch {}
}

export function getCurrentLanguage(): SupportedLanguage {
	return currentLanguage;
}

export function useI18n() {
	const [lang, setLangState] = useState<SupportedLanguage>(currentLanguage);

	useEffect(() => {
		const handler = (e: Event) => {
			const customEvent = e as CustomEvent<SupportedLanguage>;
			if (customEvent.detail && SUPPORTED_LANG_CODES.includes(customEvent.detail)) {
				setLangState(customEvent.detail);
			}
		};
		window.addEventListener(LANG_CHANGE_EVENT, handler);
		return () => window.removeEventListener(LANG_CHANGE_EVENT, handler);
	}, []);

	const changeLanguage = (newLang: SupportedLanguage) => {
		setLanguage(newLang);
		setLangState(newLang);
	};

	const currentContent = TRANSLATIONS[lang] || TRANSLATIONS.en;

	return {
		lang,
		setLanguage: changeLanguage,
		t: currentContent,
		supportedLanguages: SUPPORTED_LANGUAGES,
	};
}
