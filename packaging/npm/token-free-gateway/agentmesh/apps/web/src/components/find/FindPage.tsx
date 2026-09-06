import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CosmicCanvas } from './CosmicCanvas';
import { CosmicHud } from './CosmicHud';
import { ObsidianInspector } from './ObsidianInspector';
import { CosmicPromptBar } from './CosmicPromptBar';
import { INITIAL_NODES, INITIAL_EDGES, INITIAL_PEERS } from './initialData';
import { CosmicNode, CosmicEdge, NodeType, Shockwave, PeerInfo } from './types';

interface FindPageProps {
  onNavigateHome: () => void;
}

const ALL_TYPE_FILTERS: Record<NodeType, boolean> = {
  core: true,
  agent: true,
  peer: true,
  note: true,
  tag: true,
};

let shockwaveSeq = 0;

function playCosmicChime() {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now);
    osc1.frequency.exponentialRampToValueAtTime(1174.66, now + 0.45);

    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880.0, now);
    osc2.frequency.exponentialRampToValueAtTime(1760.0, now + 0.55);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.9);
    osc2.stop(now + 0.9);
  } catch {}
}

export const FindPage: React.FC<FindPageProps> = ({ onNavigateHome }) => {
  const [nodes, setNodes] = useState<CosmicNode[]>(INITIAL_NODES);
  const [edges, setEdges] = useState<CosmicEdge[]>(INITIAL_EDGES);
  const [selectedNode, setSelectedNode] = useState<CosmicNode | null>(INITIAL_NODES[0] ?? null);
  const [shockwaves, setShockwaves] = useState<Shockwave[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTypeFilters, setActiveTypeFilters] = useState<Record<NodeType, boolean>>(ALL_TYPE_FILTERS);
  const [repelStrength, setRepelStrength] = useState(1.0);
  const [linkDistance, setLinkDistance] = useState(130);
  const [centerGravity, setCenterGravity] = useState(0.8);
  const [userPeerConnected, setUserPeerConnected] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>(INITIAL_PEERS);
  const [latencyMs, setLatencyMs] = useState(28);
  const [eventsLog, setEventsLog] = useState<string[]>([
    `[init] muhanai.com/find mesh attached · ${INITIAL_PEERS.length} peers · ${INITIAL_NODES.length} notes · ${INITIAL_EDGES.length} synapses`,
    '[init] CRDT knowledge lake subscribed — WebRTC shard #89 linked',
    '[prompt] Cosmic Omnibar active: type to search or publish new Obsidian nodes',
  ]);

  const shockwaveTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const peersCount = peers.length + (userPeerConnected ? 1 : 0);
  const notesCount = nodes.length;
  const edgesCount = edges.length;
  const selectedNodeId = selectedNode?.id ?? null;

  const addEvent = useCallback((line: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setEventsLog((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 14));
  }, []);

  const spawnShockwave = useCallback((sx: number, sy: number, color = '#38bdf8') => {
    const id = `sw-${++shockwaveSeq}`;
    setShockwaves((prev) => [
      ...prev,
      { id, x: sx, y: sy, radius: 0, maxRadius: 260, opacity: 0.95, color },
    ]);
    const timer = setTimeout(() => {
      setShockwaves((prev) => prev.filter((sw) => sw.id !== id));
      shockwaveTimers.current.delete(timer);
    }, 1400);
    shockwaveTimers.current.add(timer);
  }, []);

  const handleSelectNode = useCallback(
    (node: CosmicNode | null) => {
      setSelectedNode(node);
      if (node) {
        addEvent(`selected node ${node.frontmatter.title} (${node.type})`);
      }
    },
    [addEvent]
  );

  const toggleTypeFilter = useCallback((type: NodeType) => {
    setActiveTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

  const handleSearchOrPublish = useCallback(
    (query: string) => {
      const clean = query.trim().replace(/^[[|]]$/g, '');
      const lower = clean.toLowerCase();

      const found = nodes.find(
        (n) =>
          n.label.toLowerCase().includes(lower) ||
          n.frontmatter.title.toLowerCase().includes(lower) ||
          n.frontmatter.tags.some((t) => t.toLowerCase() === lower)
      );

      if (found) {
        setSelectedNode(found);
        spawnShockwave(found.x, found.y, found.color || '#38bdf8');
        playCosmicChime();
        addEvent(`🔍 Located existing node: ${found.frontmatter.title}`);
        return;
      }

      playCosmicChime();
      const angle = Math.random() * Math.PI * 2;
      const distance = 140 + Math.random() * 100;
      const nx = Math.cos(angle) * distance;
      const ny = Math.sin(angle) * distance;
      const newId = `note-user-${Date.now()}`;
      const color = '#10b981';

      const newNode: CosmicNode = {
        id: newId,
        label: `[[${clean}.md]]`,
        type: 'note',
        peerId: userPeerConnected ? 'peer-local-user-browser' : 'peer-anonymous-creator',
        x: nx,
        y: ny,
        vx: 0,
        vy: 0,
        radius: 13,
        color,
        connectionsCount: 2,
        frontmatter: {
          title: clean,
          author: userPeerConnected ? 'You (Active Peer)' : 'Anonymous Contributor',
          peerId: userPeerConnected ? 'peer-local-user-browser' : 'peer-anonymous-creator',
          created: new Date().toISOString().slice(0, 10),
          tags: ['knowledge', 'obsidian', 'user-published', 'p2p-mesh'],
          links: ['note-muhanai-core', 'note-webrtc-crdt'],
          summary: '유저가 muhanai.com/find 상단 옴니바에서 우주 메쉬로 직접 발행한 옵시디언 지식 조각',
          markdown: `# ${clean}\n\n사용자가 상단 옴니바를 통해 전체화면 우주 지식 메쉬에 실시간으로 발행한 지식 노드입니다.\n\n## Network Shard\n- **Sync Protocol**: WebRTC CRDT State Vector\n- **Origin Hub**: [[MuhanAI Origin MOC.md]]\n- **Verification**: [[CRDT Knowledge Lake.md]]\n\n- Published at: ${new Date().toISOString()}`,
        },
      };

      const newEdge: CosmicEdge = {
        id: `e-user-pub-${Date.now()}`,
        source: 'note-muhanai-core',
        target: newId,
        label: 'user-synapse',
        weight: 1.3,
      };

      setNodes((prev) => [...prev, newNode]);
      setEdges((prev) => [...prev, newEdge]);
      setSelectedNode(newNode);
      spawnShockwave(nx, ny, '#10b981');

      addEvent(`✨ Published new Obsidian node: [[${clean}.md]] into Cosmic Mesh`);
    },
    [nodes, userPeerConnected, spawnShockwave, addEvent]
  );

  const handleConnectSimulatedPeer = useCallback(() => {
    const colors = ['#38bdf8', '#10b981', '#a855f7', '#f59e0b'];
    const angle = Math.random() * Math.PI * 2;
    const r = 320;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    const color = colors[Math.floor(Math.random() * colors.length)];
    const id = `note-sim-peer-${Date.now()}`;
    const newNode: CosmicNode = {
      id,
      label: `[[Simulated Peer #${shockwaveSeq}.md]]`,
      type: 'peer',
      x,
      y,
      vx: 0,
      vy: 0,
      radius: 11,
      color,
      connectionsCount: 0,
      frontmatter: {
        title: `Simulated Peer #${shockwaveSeq}`,
        author: 'Mesh Simulator',
        created: new Date().toISOString().slice(0, 10),
        tags: ['peer', 'simulated'],
        links: [],
        summary: 'Simulated remote peer joining the cosmic mesh.',
        markdown: `# Simulated Peer\n\nJoined at ${new Date().toISOString()}\n\nLocation (x,y) = (${Math.round(x)}, ${Math.round(y)})`,
      },
    };
    setNodes((prev) => [...prev, newNode]);
    spawnShockwave(x, y, color);
    playCosmicChime();
    addEvent(`peer joined → ${newNode.frontmatter.title}`);
  }, [addEvent, spawnShockwave]);

  const handleConnectUserPeer = useCallback(() => {
    setUserPeerConnected((prev) => {
      const next = !prev;
      addEvent(next ? 'user device mounted into P2P mesh' : 'user device disconnected from P2P mesh');
      return next;
    });
    setLatencyMs((prev) => Math.max(1, Math.round(prev + (Math.random() - 0.5) * 12)));
    playCosmicChime();
  }, [addEvent]);

  const allNodesForInspector = useMemo(() => nodes, [nodes]);

  return (
    <div className="find-page-shell">
      <div className="find-page-canvas-area">
        <CosmicCanvas
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          onSelectNode={handleSelectNode}
          shockwaves={shockwaves}
          searchFilter={searchFilter}
          activeTypeFilters={activeTypeFilters}
          repelStrength={repelStrength}
          linkDistance={linkDistance}
          centerGravity={centerGravity}
        />

        <CosmicHud
          peersCount={peersCount}
          notesCount={notesCount}
          edgesCount={edgesCount}
          latencyMs={latencyMs}
          searchFilter={searchFilter}
          onSearchChange={setSearchFilter}
          onConnectSimulatedPeer={handleConnectSimulatedPeer}
          onConnectUserPeer={handleConnectUserPeer}
          userPeerConnected={userPeerConnected}
          activeTypeFilters={activeTypeFilters}
          onToggleTypeFilter={toggleTypeFilter}
          repelStrength={repelStrength}
          onRepelChange={setRepelStrength}
          linkDistance={linkDistance}
          onLinkDistChange={setLinkDistance}
          centerGravity={centerGravity}
          onGravityChange={setCenterGravity}
          eventsLog={eventsLog}
          onNavigateHome={onNavigateHome}
        />

        <CosmicPromptBar
          onSearchOrPublish={handleSearchOrPublish}
          onFilterChange={setSearchFilter}
        />
      </div>

      {selectedNode && (
        <ObsidianInspector
          node={selectedNode}
          allNodes={allNodesForInspector}
          onClose={() => handleSelectNode(null)}
          onSelectNode={handleSelectNode}
        />
      )}
    </div>
  );
};

export default FindPage;
