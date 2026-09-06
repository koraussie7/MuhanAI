import React, { useCallback, useMemo, useRef, useState } from 'react';
import { CosmicCanvas } from './CosmicCanvas';
import { CosmicHud } from './CosmicHud';
import { ObsidianInspector } from './ObsidianInspector';
import { INITIAL_NODES, INITIAL_EDGES, INITIAL_PEERS } from './initialData';
import { CosmicNode, NodeType, Shockwave, PeerInfo } from './types';

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

export const FindPage: React.FC<FindPageProps> = ({ onNavigateHome }) => {
  const [nodes, setNodes] = useState<CosmicNode[]>(INITIAL_NODES);
  const edges = INITIAL_EDGES;
  const [selectedNode, setSelectedNode] = useState<CosmicNode | null>(null);
  const [shockwaves, setShockwaves] = useState<Shockwave[]>([]);
  const [searchFilter, setSearchFilter] = useState('');
  const [activeTypeFilters, setActiveTypeFilters] = useState<Record<NodeType, boolean>>(ALL_TYPE_FILTERS);
  const [repelStrength, setRepelStrength] = useState(1.0);
  const [linkDistance, setLinkDistance] = useState(130);
  const [centerGravity, setCenterGravity] = useState(0.8);
  const [userPeerConnected, setUserPeerConnected] = useState(false);
  const [peers] = useState<PeerInfo[]>(INITIAL_PEERS);
  const [latencyMs, setLatencyMs] = useState(28);
  const [eventsLog, setEventsLog] = useState<string[]>([
    `[init] muhanai.com/find mesh attached · ${INITIAL_PEERS.length} peers · ${INITIAL_NODES.length} notes · ${INITIAL_EDGES.length} synapses`,
    '[init] CRDT knowledge lake subscribed — WebRTC shard #89 linked',
  ]);
  const shockwaveTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

  const peersCount = peers.length + (userPeerConnected ? 1 : 0);
  const notesCount = nodes.length;
  const edgesCount = edges.length;
  const selectedNodeId = selectedNode?.id ?? null;

  const logEvent = useCallback((line: string) => {
    const ts = new Date().toISOString().slice(11, 19);
    setEventsLog((prev) => [`[${ts}] ${line}`, ...prev].slice(0, 12));
  }, []);

  const spawnShockwave = useCallback((sx: number, sy: number, color = '#38bdf8') => {
    const id = `sw-${++shockwaveSeq}`;
    setShockwaves((prev) => [
      ...prev,
      { id, x: sx, y: sy, radius: 0, maxRadius: 240, opacity: 0.9, color },
    ]);
    const timer = setTimeout(() => {
      setShockwaves((prev) => prev.filter((sw) => sw.id !== id));
      shockwaveTimers.current.delete(timer);
    }, 1400);
    shockwaveTimers.current.add(timer);
  }, []);

  const handleSelectNode = useCallback((node: CosmicNode | null) => {
    setSelectedNode(node);
    if (node) {
      logEvent(`selected node ${node.frontmatter.title} (${node.type})`);
    }
  }, [logEvent]);

  const handleToggleTypeFilter = useCallback((type: NodeType) => {
    setActiveTypeFilters((prev) => ({ ...prev, [type]: !prev[type] }));
  }, []);

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
    logEvent(`peer joined → ${newNode.frontmatter.title}`);
  }, [logEvent, spawnShockwave]);

  const handleConnectUserPeer = useCallback(() => {
    setUserPeerConnected((prev) => {
      const next = !prev;
      logEvent(next ? 'user device mounted into P2P mesh' : 'user device disconnected from P2P mesh');
      return next;
    });
    setLatencyMs((prev) => Math.max(1, Math.round(prev + (Math.random() - 0.5) * 12)));
  }, [logEvent]);

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
          onToggleTypeFilter={handleToggleTypeFilter}
          repelStrength={repelStrength}
          onRepelChange={setRepelStrength}
          linkDistance={linkDistance}
          onLinkDistChange={setLinkDistance}
          centerGravity={centerGravity}
          onGravityChange={setCenterGravity}
          eventsLog={eventsLog}
          onNavigateHome={onNavigateHome}
        />
      </div>

      {selectedNode && (
        <ObsidianInspector
          node={selectedNode}
          allNodes={allNodesForInspector}
          onClose={() => handleSelectNode(null)}
          onSelectNode={(n) => {
            handleSelectNode(n);
          }}
        />
      )}
    </div>
  );
};

export default FindPage;
