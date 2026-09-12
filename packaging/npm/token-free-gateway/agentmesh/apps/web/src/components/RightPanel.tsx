import { useEffect, useState } from "react";
import { useI18n } from "../i18n.js";

const API = import.meta.env.VITE_API_BASE ?? "";

const DEFAULT_COMPUTE = {
	cpu: 1284,
	gpu: 456,
	webgpu: 892,
	totalTFLOPS: 18400,
};

const DEFAULT_LLM = {
	providers: 13,
	models: 25,
	free: 18,
};

const DEFAULT_MCP = {
	servers: 34,
	tools: 142,
	categories: 8,
};

const DEFAULT_HUMAN = {
	online: undefined,
	available: undefined,
	specialties: undefined,
};

const DEFAULT_AGENTS = [
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
];

export function RightPanel() {
	const { t } = useI18n();
	const [agents, setAgents] = useState<any[]>(DEFAULT_AGENTS);
	const [compute, setCompute] = useState<any>(DEFAULT_COMPUTE);
	const [llm, setLlm] = useState<any>(DEFAULT_LLM);
	const [mcp, setMcp] = useState<any>(DEFAULT_MCP);
	const [human, setHuman] = useState<any>(DEFAULT_HUMAN);

	useEffect(() => {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 4000);

		const loadData = async () => {
			try {
				const [networkRes, agentsRes] = await Promise.all([
					fetch(`${API}/api/network`, { signal: controller.signal })
						.then((r) => (r.ok ? r.json() : null))
						.catch(() => null),
					fetch(`${API}/api/agents`, { signal: controller.signal })
						.then((r) => (r.ok ? r.json() : null))
						.catch(() => null),
				]);

				if (networkRes) {
					setCompute({ ...DEFAULT_COMPUTE, ...networkRes.compute });
					setLlm({ ...DEFAULT_LLM, ...networkRes.llm });
					setMcp({ ...DEFAULT_MCP, ...networkRes.mcp });
					setHuman({ ...DEFAULT_HUMAN, ...networkRes.human });
				}
				if (agentsRes && Array.isArray(agentsRes) && agentsRes.length > 0) {
					setAgents(agentsRes);
				}
			} catch {
				// Fallback defaults already in state
			} finally {
				clearTimeout(timeout);
			}
		};

		loadData();
		const interval = setInterval(loadData, 30000);
		return () => {
			clearTimeout(timeout);
			clearInterval(interval);
			controller.abort();
		};
	}, []);

	return (
		<aside className="right-panel">
			<div className="panel-section">
				<h3>{t.rightPanel.agents}</h3>
				<div className="agent-list">
					{agents.map((agent: any) => (
						<div key={agent.id} className="agent-card">
							<div className="agent-header">
								<span className={`agent-type ${agent.type}`}>{agent.type}</span>
								<span className={agent.online ? "online" : "offline"} />
							</div>
							<div className="agent-name">{agent.name}</div>
							<div className="agent-capabilities">
								{(agent.capabilities ?? []).map((cap: string) => (
									<span key={cap} className="cap-tag">
										{cap}
									</span>
								))}
							</div>
							<div className="agent-stats">
								<span>{t.rightPanel.reputation}: {agent.reputation}%</span>
								<span>{t.rightPanel.success}: {agent.success}%</span>
							</div>
						</div>
					))}
				</div>

				<h3>{t.rightPanel.compute}</h3>
				<div className="compute-stats">
					<div className="compute-item">
						<span className="compute-value">{compute.cpu?.toLocaleString()}</span>
						<span className="compute-label">{t.rightPanel.cpuNodes}</span>
					</div>
					<div className="compute-item">
						<span className="compute-value">{compute.gpu?.toLocaleString()}</span>
						<span className="compute-label">{t.rightPanel.gpuNodes}</span>
					</div>
					<div className="compute-item">
						<span className="compute-value">{compute.webgpu?.toLocaleString()}</span>
						<span className="compute-label">{t.rightPanel.webgpu}</span>
					</div>
					<div className="compute-item total">
						<span className="compute-value">{compute.totalTFLOPS?.toLocaleString()} TFLOPS</span>
						<span className="compute-label">{t.rightPanel.totalCompute}</span>
					</div>
				</div>

				<h3>{t.rightPanel.llm}</h3>
				<div className="llm-stats">
					<div className="llm-item">
						<span className="llm-value">{llm.providers}</span>
						<span className="llm-label">{t.rightPanel.providers}</span>
					</div>
					<div className="llm-item">
						<span className="llm-value">{llm.models?.toLocaleString()}</span>
						<span className="llm-label">{t.rightPanel.models}</span>
					</div>
					<div className="llm-item">
						<span className="llm-value">{llm.free}</span>
						<span className="llm-label">{t.rightPanel.free}</span>
					</div>
				</div>

				<h3>{t.rightPanel.mcp}</h3>
				<div className="mcp-stats">
					<div className="mcp-item">
						<span className="mcp-value">{mcp.servers?.toLocaleString()}</span>
						<span className="mcp-label">{t.rightPanel.servers}</span>
					</div>
					<div className="mcp-item">
						<span className="mcp-value">{mcp.tools?.toLocaleString()}</span>
						<span className="mcp-label">{t.rightPanel.tools}</span>
					</div>
					<div className="mcp-item">
						<span className="mcp-value">{mcp.categories}</span>
						<span className="mcp-label">{t.rightPanel.categories}</span>
					</div>
				</div>

				<h3>{t.rightPanel.human}</h3>
				<div className="human-stats">
					<div className="human-item">
						<span className="human-value">{human.online?.toLocaleString()}</span>
						<span className="human-label">{t.rightPanel.online}</span>
					</div>
					<div className="human-item">
						<span className="human-value">{human.available?.toLocaleString()}</span>
						<span className="human-label">{t.rightPanel.available}</span>
					</div>
					<div className="human-item">
						<span className="human-value">{human.specialties}</span>
						<span className="human-label">{t.rightPanel.specialties}</span>
					</div>
				</div>
			</div>
		</aside>
	);
}
