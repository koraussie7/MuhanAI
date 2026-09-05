import { useState } from 'react';
import {
  LayoutDashboard,
  Network,
  Radio,
  Bot,
  Users,
  Globe,
  Brain,
  GitBranch,
  Search,
  ShieldCheck,
  Cpu,
  Zap,
  Boxes,
  ShoppingBag,
  UserCheck,
  Database,
  HardDrive,
  Coins,
  BarChart3,
  Star,
  FolderKanban,
  CheckSquare,
  Workflow,
  Activity,
  Settings,
  ChevronLeft,
  ChevronRight,
  Send,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';

// Harvest A
import { AgentIdentityGrid } from './components/harvest/A/AgentIdentityCard';
import { MeshTopology, MeshStats } from './components/harvest/A/MeshTopology';
import { PeerCanvas, SandboxToolbar, BrowserAgentPanel } from './components/harvest/A/PeerCanvas';
import { PersonalNodeControl, LocalAgentNodeList } from './components/harvest/A/PersonalNode';
import { TaskDispatchBoard as ATaskDispatchBoard } from './components/harvest/A/TaskDispatchBoard';
import { WorkflowDAG as AWorkflowDAG } from './components/harvest/A/WorkflowDAG';
// Harvest B
import { ConsensusView } from './components/harvest/B/ConsensusView';
import { FederatedSearch } from './components/harvest/B/FederatedSearch';
import { KnowledgePool } from './components/harvest/B/KnowledgePool';
import { ModelMeshGrid } from './components/harvest/B/ModelMesh';
// Harvest B2
import { KnowledgeGraphCanvas } from './components/harvest/B2/KnowledgeGraphCanvas';
import { McpSkills } from './components/harvest/B2/McpSkills';
import { ModelHub } from './components/harvest/B2/ModelHub';
// Harvest C
import { ClusterOverview, GpuClusterBar } from './components/harvest/C/ClusterView';
import { ContributionHistory } from './components/harvest/C/ContributionHistory';
import { GatewayTable, PolicyChain, ApiVault } from './components/harvest/C/GatewayPanel';
import { GpuPool, InferencePool } from './components/harvest/C/GpuPool';
import { LedgerTable, RewardChip } from './components/harvest/C/LedgerTable';
import { AgentsMarket, HumanExperts, McpMarket, KnowledgeMarket, ComputeMarket } from './components/harvest/C/MarketplaceGrid';
import { ReputationMatrix } from './components/harvest/C/ReputationMatrix';
import { SecuritySettings } from './components/harvest/C/SecuritySettings';
import { TrustRing, WebOfTrustBadge } from './components/harvest/C/TrustRing';
import { WorkerPool } from './components/harvest/C/WorkerPool';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'agent-mesh', label: 'Agent Mesh', icon: Network },
  { id: 'agent-cast', label: 'Agent Cast', icon: Radio },
  { id: 'agents', label: 'Agents', icon: Bot },
  { id: 'human-agents', label: 'Human Agents', icon: Users },
  { id: 'p2p-network', label: 'P2P Network', icon: Globe },
  { id: 'knowledge', label: 'Knowledge', icon: Brain },
  { id: 'knowledge-graph', label: 'Knowledge Graph', icon: GitBranch },
  { id: 'search', label: 'Search', icon: Search },
  { id: 'verification', label: 'Verification', icon: ShieldCheck },
  { id: 'llm-mesh', label: 'LLM Mesh', icon: Cpu },
  { id: 'mcp-skills', label: 'MCP / Skills', icon: Zap },
  { id: 'compute-mesh', label: 'Compute Mesh', icon: Boxes },
  { id: 'models', label: 'Models', icon: HardDrive },
  { id: 'token-bank', label: 'Token Bank', icon: Coins },
  { id: 'contributions', label: 'Contributions', icon: BarChart3 },
  { id: 'reputation', label: 'Reputation', icon: Star },
  { id: 'projects', label: 'Projects', icon: FolderKanban },
  { id: 'tasks', label: 'Tasks', icon: CheckSquare },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'network-monitor', label: 'Network Monitor', icon: Activity },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const navSections = [
  {
    title: 'NETWORK',
    items: SECTIONS.filter((s) =>
      ['dashboard', 'agent-mesh', 'agent-cast', 'agents', 'human-agents', 'p2p-network'].includes(s.id)
    ),
  },
  {
    title: 'INTELLIGENCE',
    items: SECTIONS.filter((s) =>
      ['knowledge', 'knowledge-graph', 'search', 'verification'].includes(s.id)
    ),
  },
  {
    title: 'AI RESOURCES',
    items: SECTIONS.filter((s) =>
      ['llm-mesh', 'mcp-skills', 'compute-mesh', 'models'].includes(s.id)
    ),
  },
  {
    title: 'MARKETPLACE',
    items: SECTIONS.filter((s) =>
      ['agents', 'human-agents', 'mcp-skills', 'knowledge', 'compute-mesh'].includes(s.id)
    ),
  },
  {
    title: 'ECONOMY',
    items: SECTIONS.filter((s) =>
      ['token-bank', 'contributions', 'reputation'].includes(s.id)
    ),
  },
  {
    title: 'WORKSPACE',
    items: SECTIONS.filter((s) =>
      ['projects', 'tasks', 'workflows'].includes(s.id)
    ),
  },
  {
    title: 'SYSTEM',
    items: SECTIONS.filter((s) =>
      ['network-monitor', 'settings'].includes(s.id)
    ),
  },
];

const helpNeeded = [
  {
    q: '다낭 장기 거주 시 비자 런 규정의 2025년 최신 변경 사항은?',
    conf: 48,
    answers: 2,
    credit: 300,
    people: 11,
  },
  {
    q: '미얀마 현지에서 실제 USDT P2P 거래 시 가장 안전한 거래 방식은?',
    conf: 61,
    answers: 2,
    credit: 250,
    people: 6,
  },
  {
    q: '베트남에서 한국인이 사업자 등록을 할 때 실제로 가장 많이 발생하는 문제는 무엇인가?',
    conf: 64,
    answers: 4,
    credit: 120,
    people: 9,
  },
];

const trending = [
  { rank: '#1', title: 'AI Agent Mesh', count: '128 ↑' },
  { rank: '#2', title: 'P2P AI', count: '96 ↑' },
  { rank: '#3', title: 'Vietnam Business', count: '88 →' },
];

const humanKnowledge = [
  { q: '"이 식당 실제로 가본 사람?"', tag: 'restaurant', conf: 45, ans: 6, credit: 120 },
  { q: '"베트남 사업자 등록 실제 경험담"', tag: 'business', conf: 58, ans: 9, credit: 250 },
  { q: '"다낭 현지 시세 아는 사람?"', tag: 'local', conf: 62, ans: 4, credit: 150 },
];

const HARVEST_AGENTS = [
  { id: 'agent-gemini', name: 'Gemini Research Agent', did: 'did:muhan:agent:gemini:9f4a12', status: 'online', capabilities: ['Research', 'Web Search', 'Summarization'], reputation: 98.4, latency: '1.2s', success: 99.1, a2a: { peers: 14, verified: true } },
  { id: 'agent-claude', name: 'Claude Analysis Agent', did: 'did:muhan:agent:claude:88b3c1', status: 'online', capabilities: ['Analysis', 'Coding', 'Review'], reputation: 97.8, latency: '0.9s', success: 98.6, a2a: { peers: 22, verified: true } },
  { id: 'agent-local', name: 'Local LLM Agent', did: 'did:muhan:agent:local:7a992d', status: 'online', capabilities: ['Local Inference', 'Privacy'], reputation: 95.2, latency: '2.1s', success: 96.4, a2a: { peers: 6, verified: false } },
  { id: 'agent-human', name: 'Human Expert Pool', did: 'did:muhan:human:pool:4e11fa', status: 'online', capabilities: ['Experience', 'Verification'], reputation: 99.1, latency: '—', success: 97.9, a2a: { peers: 128, verified: true } },
];

const MESH_TOPOLOGY_NODES = [
  { id: 'router', label: 'Router', kind: 'gateway', status: 'online', degree: 4 },
  { id: 'gemini', label: 'Gemini', kind: 'browser', status: 'online', degree: 2 },
  { id: 'claude', label: 'Claude', kind: 'browser', status: 'online', degree: 2 },
  { id: 'local', label: 'Local', kind: 'local', status: 'online', degree: 1 },
  { id: 'human', label: 'Human', kind: 'p2p', status: 'online', degree: 3 },
];

const MESH_TOPOLOGY_EDGES = [
  { from: 'router', to: 'gemini', label: 'A2A' },
  { from: 'router', to: 'claude', label: 'A2A' },
  { from: 'router', to: 'local', label: 'local' },
  { from: 'router', to: 'human', label: 'P2P' },
  { from: 'gemini', to: 'claude', label: 'share' },
];

const PEERS = [
  { id: 'peer-1', name: 'Browser Agent A', status: 'online', latency: '1.2s', capabilities: ['Web', 'Sandbox'] },
  { id: 'peer-2', name: 'Browser Agent B', status: 'busy', latency: '0.9s', capabilities: ['WebRTC', 'P2P'] },
  { id: 'peer-3', name: 'Local Node', status: 'online', latency: '2.1s', capabilities: ['Local Inference'] },
];

const LOCAL_NODES = [
  { id: 'local-1', name: 'nekoni Local', status: 'online', mode: 'assistant', capabilities: ['Chat', 'Search'] },
  { id: 'local-2', name: 'Browser Node', status: 'offline', mode: 'idle', capabilities: ['Web'] },
];

const CLUSTER_NODES = [
  { id: 'worker-1', label: 'GPU Node A', gpu: 'RTX 4090', status: 'online', load: 82 },
  { id: 'worker-2', label: 'GPU Node B', gpu: 'RTX 3080', status: 'busy', load: 64 },
  { id: 'worker-3', label: 'CPU Worker', gpu: '—', status: 'online', load: 41 },
];

const MARKET_AGENTS = [
  { id: 'a1', name: 'Gemini Research', price: '0.5 credits/req', reputation: 98.4, success: 99.1 },
  { id: 'a2', name: 'Claude Analysis', price: '0.8 credits/req', reputation: 97.8, success: 98.6 },
];

const MARKET_EXPERTS = [
  { id: 'h1', name: 'Vietnam Legal Expert', field: 'Business', reputation: 99.1, answered: 342 },
  { id: 'h2', name: 'P2P Trading Guide', field: 'Finance', reputation: 96.4, answered: 128 },
];

const MARKET_MCPS = [
  { id: 'm1', name: 'web_search', provider: 'InfoMesh', runs: 12400, success: 97.2 },
  { id: 'm2', name: 'rag_query', provider: 'Society', runs: 8300, success: 94.5 },
];

const MARKET_KNOWLEDGE = [
  { id: 'k1', title: '베트남 비자 런 규정 2025', author: 'gov.vn', confidence: 92, price: '0' },
  { id: 'k2', title: 'USDT P2P 거래 가이드', author: 'community', confidence: 74, price: '0' },
];

const MARKET_COMPUTE = [
  { id: 'c1', provider: 'GPU Node A', spec: 'RTX 4090', price: '1.2 credits/hr', status: 'online' },
  { id: 'c2', provider: 'GPU Node B', spec: 'RTX 3080', price: '0.8 credits/hr', status: 'busy' },
];

const REPUTATION_ACTORS = [
  { id: 'agent-gemini', name: 'Gemini Research', type: 'agent', reputation: 98.4, trust: 97.1, tasks: 1240 },
  { id: 'human-vietnam', name: 'Vietnam Expert', type: 'human', reputation: 99.1, trust: 98.4, tasks: 342 },
  { id: 'mcp-websearch', name: 'web_search', type: 'mcp', reputation: 95.2, trust: 93.8, tasks: 12400 },
];

const CONTRIBUTIONS = [
  { id: 'cx-1', actor: 'Gemini Research', action: 'Answer', credits: 120, at: '2026-09-05 09:12' },
  { id: 'cx-2', actor: 'Vietnam Expert', action: 'Verify', credits: 85, at: '2026-09-05 08:44' },
];

const LEDGER_ROWS = [
  { id: 'L-001', owner: 'Gemini Research', type: 'Agent', status: 'Active', balance: 12400 },
  { id: 'L-002', owner: 'Vietnam Expert', type: 'Human', status: 'Active', balance: 8320 },
];

const LEDGER_ENTRIES = [
  { id: 'E-001', account: 'L-001', delta: '+120', reason: 'Answer', at: '2026-09-05 09:12' },
  { id: 'E-002', account: 'L-002', delta: '+85', reason: 'Verify', at: '2026-09-05 08:44' },
];

const PROVIDERS = [
  { name: 'OpenAI GPT-4o', quota: 1000, used: 642, status: 'active' },
  { name: 'Anthropic Claude', quota: 800, used: 210, status: 'active' },
  { name: 'Google Gemini', quota: 1200, used: 980, status: 'limited' },
];

const WORKERS = [
  { id: 'w1', name: 'GPU Node A', status: 'online', tasks: 3, gpu: 'RTX 4090', load: 82 },
  { id: 'w2', name: 'GPU Node B', status: 'busy', tasks: 5, gpu: 'RTX 3080', load: 64 },
  { id: 'w3', name: 'CPU Worker', status: 'online', tasks: 1, gpu: '—', load: 41 },
];

const TASKS = [
  { id: 'task-1', title: 'Research Vietnam visa', status: 'running', assignee: 'Gemini Research', progress: 72 },
  { id: 'task-2', title: 'Verify P2P guide', status: 'pending', assignee: 'Claude Analysis', progress: 0 },
];

export default function App() {
  const [collapsed, setCollapsed] = useState(false);
  const [activeSection, setActiveSection] = useState('dashboard');
  const [peerFilter, setPeerFilter] = useState('');
  const [selectedPeer, setSelectedPeer] = useState<typeof PEERS[0] | null>(null);

  const section = activeSection;

  return (
    <div className="flex h-screen bg-black text-zinc-100 overflow-hidden">
      {/* Sidebar */}
      <aside
        className={`${
          collapsed ? 'w-[72px]' : 'w-[260px]'
        } flex-shrink-0 border-r border-zinc-900 bg-[#0a0a0a] flex flex-col transition-all duration-300`}
      >
        {/* Brand */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-zinc-900">
          <div className="w-8 h-8 rounded-lg bg-[#e6ff87] flex items-center justify-center text-black font-bold text-lg flex-shrink-0">
            M
          </div>
          {!collapsed && (
            <span className="font-semibold tracking-tight text-[15px]">MUHAN AI</span>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-5">
          {navSections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <div className="px-3 mb-1.5 text-[10px] font-medium tracking-widest text-zinc-500 uppercase">
                  {section.title}
                </div>
              )}
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.label}
                      onClick={() => setActiveSection(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-[13px] transition-colors ${
                        isActive
                          ? 'bg-zinc-900 text-[#e6ff87]'
                          : 'text-zinc-400 hover:bg-zinc-900/60 hover:text-zinc-100'
                      }`}
                    >
                      <item.icon size={16} className="flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-zinc-900 p-3">
          <div className="flex items-center justify-between">
            {!collapsed && (
              <div className="text-xs text-zinc-500 min-w-0">
                <div className="text-zinc-300 font-medium truncate">1,284 Agents Online</div>
                <div className="mt-0.5 truncate">Brian</div>
              </div>
            )}
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-1.5 rounded-md hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 flex-shrink-0"
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 md:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              {SECTIONS.find((s) => s.id === activeSection)?.label ?? 'Dashboard'}
            </h1>
            <div className="flex items-center gap-3">
              <div className="text-sm text-zinc-400">
                <span className="text-[#e6ff87] font-medium">12,480</span> Credits
              </div>
            </div>
          </div>

          {/* Dashboard */}
          {section === 'dashboard' && (
            <>
              {/* Search / Ask */}
              <div className="mb-8">
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <input
                      value=""
                      onChange={() => {}}
                      placeholder="Ask the Network..."
                      className="w-full bg-[#111] border border-zinc-800 rounded-lg px-4 py-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
                    />
                  </div>
                  <button className="px-5 py-3 bg-white text-black text-sm font-medium rounded-lg hover:bg-zinc-200 transition-colors">
                    Search
                  </button>
                </div>

                {/* Live stats */}
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-500">
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-zinc-300">12,482</span> Agents
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                    <span className="text-zinc-300">3,821</span> Humans
                  </span>
                  <span className="text-zinc-600 hidden sm:inline">•</span>
                  <span>3 new questions</span>
                  <span>3 verification requests</span>
                  <span>3 human experts needed</span>
                  <span>1 AI conflicts</span>
                </div>
              </div>

              {/* Help Needed */}
              <section className="mb-12">
                <div className="flex items-center gap-2 mb-1 text-xs font-medium tracking-widest text-zinc-500 uppercase">
                  02 / HELP NEEDED
                </div>
                <h2 className="text-3xl font-semibold tracking-tight mb-6 leading-tight">
                  AI가 해결하지 못한
                  <br />
                  <span className="text-[#e6ff87]">문제에 참여</span>하세요.
                </h2>

                <div className="space-y-4">
                  {helpNeeded.map((item, i) => (
                    <div
                      key={i}
                      className="p-5 rounded-xl border border-zinc-800 bg-[#0a0a0a] hover:border-zinc-700 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <div className="mt-1.5 w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-medium leading-snug mb-3">{item.q}</p>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-500 mb-4">
                            <span>
                              AI Confidence <span className="text-zinc-300">{item.conf}%</span>
                            </span>
                            <span>
                              Human Answers <span className="text-zinc-300">{item.answers}</span>
                            </span>
                            <span className="text-[#e6ff87]">+{item.credit} Credit</span>
                            <span className="flex items-center gap-1">
                              <Users size={12} /> {item.people}명 참여 중
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors">
                              내가 아는 내용 추가
                            </button>
                            <button className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors">
                              검증하기
                            </button>
                            <button className="px-3 py-1.5 text-xs rounded-md bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors">
                              AI에게 맡기기
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Trending */}
              <section className="mb-12">
                <h3 className="text-sm font-medium text-zinc-400 mb-4 flex items-center gap-2">
                  🔥 TRENDING QUESTIONS
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {trending.map((t) => (
                    <div
                      key={t.rank}
                      className="p-4 rounded-xl border border-zinc-800 bg-[#0a0a0a] hover:border-zinc-700 transition-colors cursor-pointer"
                    >
                      <div className="text-xs text-zinc-500 mb-1">{t.rank}</div>
                      <div className="font-medium text-sm mb-1">{t.title}</div>
                      <div className="text-xs text-[#e6ff87]">{t.count}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* Verify Me */}
              <section className="mb-12">
                <div className="flex items-center gap-2 mb-1 text-xs font-medium tracking-widest text-zinc-500 uppercase">
                  03 / VERIFY ME
                </div>
                <h2 className="text-2xl font-semibold tracking-tight mb-4 leading-tight">
                  3초면 충분합니다.
                  <br />
                  <span className="text-[#e6ff87]">지식을 검증</span>하세요.
                </h2>
                <div className="p-5 rounded-xl border border-zinc-800 bg-[#0a0a0a]">
                  <p className="text-[15px] mb-2">
                    "다낭의 FPT 인터넷은 500Mbps 서비스를 제공한다."
                  </p>
                  <div className="text-xs text-zinc-500 mb-4">출처 3개 · 21명 참여</div>
                  <div className="flex flex-wrap gap-2">
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-sm hover:bg-emerald-500/20 transition-colors">
                      <CheckCircle2 size={14} /> 맞음
                    </button>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm hover:bg-red-500/20 transition-colors">
                      <XCircle size={14} /> 틀림
                    </button>
                    <button className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 text-sm hover:bg-zinc-800 transition-colors">
                      <HelpCircle size={14} /> 모르겠음
                    </button>
                  </div>
                </div>
              </section>

              {/* Human Knowledge Wanted */}
              <section className="mb-8">
                <h3 className="text-sm font-medium text-zinc-400 mb-2 flex items-center gap-2">
                  👤 HUMAN KNOWLEDGE WANTED
                </h3>
                <p className="text-sm text-zinc-500 mb-4">당신만 알고 있을 수 있는 경험</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {humanKnowledge.map((item, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl border border-zinc-800 bg-[#0a0a0a] hover:border-zinc-700 transition-colors"
                    >
                      <p className="text-sm font-medium mb-2">{item.q}</p>
                      <div className="text-xs text-zinc-500 mb-3">{item.tag}</div>
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span>🤖 {item.conf}%</span>
                        <span>👥 {item.ans}</span>
                        <span className="text-[#e6ff87]">💰 +{item.credit}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* Agent Mesh */}
          {section === 'agent-mesh' && (
            <div className="space-y-4">
              <div className="flex gap-2 mb-2">
                <button className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs">Identity Cards</button>
                <button className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 text-xs">Mesh Topology</button>
              </div>
              <AgentIdentityGrid agents={HARVEST_AGENTS} filter="" onUse={() => {}} onConnect={() => {}} />
              <MeshStats nodes={MESH_TOPOLOGY_NODES} edges={MESH_TOPOLOGY_EDGES} />
              <MeshTopology nodes={MESH_TOPOLOGY_NODES} edges={MESH_TOPOLOGY_EDGES} onSelect={() => {}} />
            </div>
          )}

          {/* Agent Cast */}
          {section === 'agent-cast' && <ConsensusView />}

          {/* Agents */}
          {section === 'agents' && (
            <AgentIdentityGrid agents={HARVEST_AGENTS} filter="" onUse={() => {}} onConnect={() => {}} />
          )}

          {/* Human Agents */}
          {section === 'human-agents' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {MARKET_EXPERTS.map((expert) => (
                <div key={expert.id} className="p-4 rounded-xl border border-zinc-800 bg-[#0a0a0a]">
                  <div className="text-sm font-medium">{expert.name}</div>
                  <div className="text-xs text-zinc-500">{expert.field}</div>
                  <div className="text-xs text-zinc-500 mt-2">Reputation {expert.reputation}</div>
                  <div className="text-xs text-zinc-500">Answered {expert.answered}</div>
                </div>
              ))}
            </div>
          )}

          {/* P2P Network */}
          {section === 'p2p-network' && (
            <div className="space-y-4">
              <PeerCanvas peers={PEERS} onSelect={(peer) => setSelectedPeer(peer)} selectedId={selectedPeer?.id} />
              <SandboxToolbar onAction={(action) => console.log(action)} />
              {selectedPeer && <BrowserAgentPanel peer={selectedPeer} onClose={() => setSelectedPeer(null)} />}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <PersonalNodeControl node={LOCAL_NODES[0]} onToggle={() => {}} onModeChange={() => {}} />
                <LocalAgentNodeList nodes={LOCAL_NODES} onSelect={() => {}} />
              </div>
            </div>
          )}

          {/* Knowledge */}
          {section === 'knowledge' && <KnowledgePool />}

          {/* Knowledge Graph */}
          {section === 'knowledge-graph' && <KnowledgeGraphCanvas />}

          {/* Search */}
          {section === 'search' && <FederatedSearch />}

          {/* Verification */}
          {section === 'verification' && (
            <div className="space-y-4">
              <KnowledgePool />
              <p className="dash-note">Verification center — CRDT / Provenance badges coming soon.</p>
            </div>
          )}

          {/* LLM Mesh */}
          {section === 'llm-mesh' && <ModelMeshGrid />}

          {/* MCP / Skills */}
          {section === 'mcp-skills' && <McpSkills />}

          {/* Compute Mesh */}
          {section === 'compute-mesh' && (
            <div className="space-y-4">
              <GpuPool nodes={CLUSTER_NODES} />
              <InferencePool nodes={CLUSTER_NODES} />
            </div>
          )}

          {/* Models */}
          {section === 'models' && <ModelHub />}

          {/* Token Bank */}
          {section === 'token-bank' && (
            <div className="space-y-4">
              <LedgerTable table={LEDGER_ROWS} entries={LEDGER_ENTRIES} />
              <RewardChip reason="Answer" credits={120} />
            </div>
          )}

          {/* Contributions */}
          {section === 'contributions' && <ContributionHistory entries={CONTRIBUTIONS} />}

          {/* Reputation */}
          {section === 'reputation' && <ReputationMatrix actors={REPUTATION_ACTORS} />}

          {/* Projects */}
          {section === 'projects' && <ATaskDispatchBoard />}

          {/* Tasks */}
          {section === 'tasks' && (
            <div className="space-y-4">
              <ATaskDispatchBoard />
            </div>
          )}

          {/* Workflows */}
          {section === 'workflows' && <AWorkflowDAG />}

          {/* Network Monitor */}
          {section === 'network-monitor' && (
            <div className="p-5 rounded-xl border border-zinc-800 bg-[#0a0a0a]">
              <h3 className="text-sm font-medium text-zinc-300 mb-2">Network Monitor</h3>
              <p className="text-xs text-zinc-500">Live network status — connect feed API to enable.</p>
            </div>
          )}

          {/* Settings */}
          {section === 'settings' && <SecuritySettings />}

          {/* Marketplace subsections */}
          {section === 'agents' && (
            <AgentsMarket />
          )}
          {section === 'human-agents' && (
            <HumanExperts />
          )}
          {section === 'mcp-skills' && (
            <McpMarket />
          )}
          {section === 'knowledge' && (
            <KnowledgeMarket />
          )}
          {section === 'compute-mesh' && (
            <ComputeMarket />
          )}
        </div>
      </main>
    </div>
  );
}
