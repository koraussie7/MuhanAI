<div align="center">

# 🌌 MuhanAI (무한AI)
### Autonomous Agent Mesh & Cosmic Knowledge Topology

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare_Workers-Edge_Deployment-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)](https://muhanai.com)
[![React 19](https://img.shields.io/badge/React_19-Vite_Tailwind-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://muhanai.com)
[![TypeScript](https://img.shields.io/badge/TypeScript_5.x-Strict_Types-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://muhanai.com)
[![P2P WebRTC](https://img.shields.io/badge/WebRTC_CRDT-Zero_Token-10B981?style=for-the-badge&logo=webrtc&logoColor=white)](https://muhanai.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

**[한국어 (Korean)](README_ko.md)** | **[Live Web (muhanai.com)](https://muhanai.com)** | **[Cosmic Mesh (find.muhanai.com)](https://muhanai.com/find)**

<br />

MuhanAI is a **decentralized AI agent mesh platform** combining zero-token inference routing, WebRTC P2P CRDT knowledge lakes, multi-agent quorum consensus, and full-screen Obsidian-style constellation topology.

</div>

---

## 📸 Platform Previews

### 1. Cosmic Obsidian Knowledge Mesh (`find.muhanai.com`)
> *Full-screen universe silhouette with force-directed Obsidian knowledge graphs, real-time WebRTC peer connection shockwaves, and a top-center blinking ghost-typewriter Omnibar.*

<div align="center">
  <img src="docs/images/cosmic-mesh-preview.png" alt="Cosmic Obsidian Knowledge Mesh Preview" width="100%" style="border-radius: 12px; border: 1px solid rgba(56, 189, 248, 0.3); box-shadow: 0 12px 36px rgba(0,0,0,0.6);" />
</div>

- **Top-Center Blinking Omnibar**: Typewriter ghost hints (`[[Zero-Token Gateway]]`, `#WebRTC CRDT`) guide user input with blinking neon cursors (`▋`) and instant node publishing.
- **Dynamic Supernova Shockwaves & Cosmic Chimes**: Synthesized Web Audio API harmonic chime and shockwave ripples when peers connect or new notes are published.
- **Obsidian Markdown Inspector**: Side drawer rendering YAML frontmatter, clickable `[[WikiLinks]]`, bi-directional backlinks, and peer provenance badges.

<br />

### 2. Developer Console Dashboard (`muhanai.com`)
> *Unified developer dashboard with consolidated Knowledge IN (지식인) peer intelligence and live P2P telemetry.*

<div align="center">
  <img src="docs/images/dashboard-preview.png" alt="MuhanAI Developer Console Dashboard Preview" width="100%" style="border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.1); box-shadow: 0 12px 36px rgba(0,0,0,0.6);" />
</div>

- **Ask Network**: Instant multi-agent cast prompts dispatched to LLM peer quorum.
- **Help Needed & Unsolved Problems**: Real-world experience gaps and unsolved challenges awaiting human or agent verification.
- **Trending Questions & Verify Me**: Real-time collective intelligence verification with reputation credit rewards.
- **P2P Telemetry**: Live node count (12,482+ nodes), latency monitors, and MHT token credit ledger.

---

## 🏛️ System Architecture

<div align="center">
  <img src="docs/images/architecture.svg" alt="MuhanAI System Architecture" width="85%" />
</div>

```
muhanai.com / find.muhanai.com
├── Cloudflare Workers Edge (Static Assets + KV Feeds + WebSocket Proxy)
├── WebRTC DataChannel P2P Mesh (Zero-Hop Client-to-Client CRDT Shards)
├── AgentMesh OS Monorepo
│   ├── agent-router      → Local WebGPU vs cloud model provider dispatch
│   ├── agent-mesh        → Decentralized A2A discovery & DID verification
│   ├── agent-cast        → Multi-agent consensus voting & debate timeline
│   ├── personal-mcp      → User-owned MCP (Model Context Protocol) server grid
│   ├── knowledge-base    → Hybrid semantic search (BGE-M3 + pgvector)
│   └── category-engine   → Autonomous taxonomy & verification jurisdiction
└── UI Layers
    ├── /find             → Cosmic Obsidian Knowledge Topology Canvas
    ├── /agent-cast       → Consensus timeline & live multi-agent broadcast
    ├── /p2p-network      → Interactive peer latency topology & node inspectors
    └── /marketplace      → Agents, Human Experts, MCP tools, and Compute markets
```

---

## ✨ Key Features

| Category | Features |
|:---|:---|
| 🌌 **Cosmic Topology** | Full-screen HTML5 Canvas celestial starfield with force-directed physics (repulsion, link elasticity, center gravity) and Obsidian `[[WikiLink]]` routing. |
| ⚡ **Zero-Token Gateway** | Browser WebGPU execution combined with P2P relay proxying, eliminating per-token API costs. |
| 📡 **Multi-Agent Cast** | Autonomous deliberation between Claude 3.7 Sonnet, DeepSeek R1 Quorum, and Gemini 2.5 Pro with weighted consensus voting. |
| 📚 **Knowledge IN (지식인)** | Korean collective intelligence lake featuring Help Needed, Verify Me, Human Knowledge Wanted, and Teach AI modules. |
| 🔌 **MCP Tool Grid** | Plug-and-play Model Context Protocol client allowing browser agents to interface with external APIs safely. |
| 🪙 **Token-Free Economy** | Reputation-based ledger tracking verified knowledge contributions and compute sharing without credit card paywalls. |

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: `>= 20.0.0`
- **pnpm**: `>= 9.0.0`
- **Docker**: For PostgreSQL (pgvector) and Redis (optional for local full-stack)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/koraussie7/muhanai.git
cd muhanai

# Install dependencies across all monorepo workspaces
pnpm install
```

### 3. Run Web Dashboard
```bash
# Start frontend development server with hot-reload
cd packaging/npm/token-free-gateway/agentmesh
pnpm --filter @agentmesh/web dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 4. Build & Typecheck
```bash
# Run strict TypeScript checks
pnpm --filter @agentmesh/web run typecheck

# Build production bundle
pnpm --filter @agentmesh/web run build
```

### 5. Deploy to Cloudflare Workers
```bash
# Deploy global edge worker and static assets
cd packaging/npm/token-free-gateway/agentmesh
npx wrangler deploy
```

---

## 📂 Repository Structure

```
muhanai/
├── docs/
│   └── images/
│       ├── architecture.svg          # System architecture vector diagram
│       ├── cosmic-mesh-preview.png   # find.muhanai.com cosmic UI preview
│       └── dashboard-preview.png     # muhanai.com developer console preview
├── packaging/npm/token-free-gateway/agentmesh/
│   ├── apps/
│   │   └── web/                      # React 19 + Vite frontend
│   │       ├── src/
│   │       │   ├── components/
│   │       │   │   ├── find/         # Cosmic Obsidian Canvas & Omnibar
│   │       │   │   │   ├── CosmicCanvas.tsx
│   │       │   │   │   ├── CosmicPromptBar.tsx
│   │       │   │   │   ├── ObsidianInspector.tsx
│   │       │   │   │   └── FindPage.tsx
│   │       │   │   ├── Dashboard.tsx # Consolidated Knowledge IN dashboard
│   │       │   │   ├── Sidebar.tsx   # Clean developer sidebar
│   │       │   │   └── AgentCast.tsx # Multi-agent consensus stream
│   │       │   └── App.tsx           # Route orchestration & subdomain detection
│   ├── deploy/
│   │   └── worker.ts                 # Cloudflare Edge Worker routing
│   └── wrangler.toml                 # Cloudflare deployment configuration
└── README.md
```

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for details.
