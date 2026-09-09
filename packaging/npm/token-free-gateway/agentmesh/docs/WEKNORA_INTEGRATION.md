# WeKnora Integration Guide

## Overview

MuhanAI integrates with [WeKnora](https://github.com/Tencent/WeKnora) for:
- Hybrid search (`weknora_search`)
- RAG/ReAct Q&A (`weknora_ask`)
- Document parsing pipeline (PDF, Word, Excel, etc.)
- Long-term memory (profile, preference, fact, task, interest)
- Wiki ↔ KnowledgeNode synchronization

## Prerequisites

- Docker & Docker Compose
- Node.js 20+
- pnpm 9+

## Local Setup

### 1. Deploy WeKnora

```bash
git clone https://github.com/Tencent/WeKnora.git /opt/weknora
cd /opt/weknora
cp .env.example .env
docker compose pull
docker compose up -d
```

Verify:
- Web UI: http://localhost
- API: http://localhost:8080

### 2. Create API Key

In WeKnora Web UI:
1. Go to Settings → API Keys
2. Create a new key
3. Copy the key

### 3. Configure MuhanAI

```bash
cd /Users/brianyeon/muhanai/muhanai
cp .env.example .env
```

Add to `.env`:
```bash
WEKNORA_HOST=http://localhost:8080
WEKNORA_API_KEY=sk-weknora-...
WEKNORA_KB_ID=default
```

### 4. Start MuhanAI

```bash
cd packaging/npm/token-free-gateway/agentmesh
pnpm dev:web
```

Open http://localhost:5173/dashboard and navigate to the **Knowledge Base** tab.

## Usage

### Document Upload

1. Go to Dashboard → Knowledge Base tab
2. Click "Click to upload a document"
3. Select a file (PDF, Word, Excel, Text, Markdown, etc.)
4. Wait for parsing to complete
5. The document is indexed into pgvector

### Search & Ask

WeKnora tools are available through Personal MCP:
- `weknora_search` — hybrid search across knowledge bases
- `weknora_ask` — RAG/ReAct Q&A with citations
- `weknora_read_document` — read a specific document
- `weknora_list_knowledge_bases` — list available KBs

### Wiki Sync

```typescript
import { wikiSync } from "@agentmesh/knowledge-base";

// Import all WeKnora Wiki pages as KnowledgeNodes
const nodes = await wikiSync.importWikiPages("user-id");

// Export a KnowledgeNode as WeKnora Wiki page
await wikiSync.exportKnowledgeNodeToWiki(node);

// Sync revisions
const revisions = await wikiSync.syncRevisions("node-id");
```

### Long-term Memory

```typescript
import { personalMemoryService } from "@agentmesh/personal-mcp";

// Enrich local memories with WeKnora facts
const facts = await personalMemoryService.enrichWithWeKnoraFacts("user-id");

// Search WeKnora memories
const results = await personalMemoryService.searchWeKnoraMemories("user-id", "query");
```

## Architecture

```
┌─────────────────────────────────────────┐
│              MuhanAI Platform            │
│  ┌─────────────┐    ┌───────────────┐  │
│  │ Document    │    │ Personal MCP  │  │
│  │ Upload Panel│    │ + WeKnora     │  │
│  └──────┬──────┘    └──────┬───────┘  │
│         │                  │            │
│  ┌──────▼──────────────────▼──────┐  │
│  │      knowledge-base            │  │
│  │  ┌──────┐  ┌─────────────┐    │  │
│  │  │pgvector│  │WeKnora Client│   │  │
│  │  └──────┘  └─────────────┘    │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   ┌──────────┐      ┌──────────────┐
   │ WeKnora  │      │ agent-device │
   │ (지식    │      │ (모바일     │
   │  파싱/   │      │  제어)       │
   │  검색)   │      │              │
   └──────────┘      └──────────────┘
```

## Environment Variables

| Variable | Required | Default | Description |
|:---|:---|:---|:---|
| `WEKNORA_HOST` | No | - | WeKnora API host |
| `WEKNORA_API_KEY` | No | - | WeKnora API key |
| `WEKNORA_KB_ID` | No | `default` | Default knowledge base ID |

## Troubleshooting

### WeKnora not configured

If `WEKNORA_HOST` is not set, WeKnora features are disabled with graceful fallback:
- `weknora_search` returns empty results
- `weknora_ask` returns "WeKnora is not configured"
- Document upload falls back to local chunking

### Connection refused

Check if WeKnora is running:
```bash
curl http://localhost:8080/health
```

### Parsing failed

Check WeKnora logs:
```bash
cd /opt/weknora
docker compose logs -f app
```
