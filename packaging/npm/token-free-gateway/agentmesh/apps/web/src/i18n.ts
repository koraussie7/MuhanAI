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
