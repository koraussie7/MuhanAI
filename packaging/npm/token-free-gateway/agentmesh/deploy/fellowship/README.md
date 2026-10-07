# Colibri WASM Fellowship Node Deployment

## Overview
This directory contains the Docker-based deployment for the Colibri WASM Fellowship Node, which provides:
- **WASM inference** in browser via Emscripten-compiled Colibri
- **Native inference** via Python OpenAI-compatible server
- **IPFS model distribution** for P2P model chunk sharing
- **Gun.js mesh** for browser P2P signaling and coordination

## Quick Start

### 1. Build WASM Module
```bash
# Requires emscripten/emsdk:3.1.56 container or local emsdk
docker run --rm -v $(pwd):/work -w /work emscripten/emsdk:3.1.56 \
  bash -c "cd /work && ./build-wasm.sh"
```

### 2. Build & Run with Docker Compose
```bash
docker compose build
docker compose up -d
```

### 3. Verify Deployment
```bash
# Check health
curl http://localhost:3001/health

# List registered models
curl http://localhost:3001/api/models

# Test inference (WASM)
curl -X POST http://localhost:3001/api/colibri/generate \
  -H "Content-Type: application/json" \
  -d '{"modelCid": "bafyreibglm52", "prompt": "Hello, world!"}'

# Check Colibri status
curl http://localhost:3001/api/colibri/status
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Browser Client                           │
│  (loads colibri.js, colibri.wasm via HTTP)                 │
└──────────────────────┬──────────────────────────────────────┘
                       │ WASM inference
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              Fellowship Node (port 3001)                    │
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │  Colibri WASM   │  │  Gun.js Mesh (port 8081)       │  │
│  │  (Emscripten)   │  │  - Browser P2P signaling       │  │
│  │  - colibri.js   │  │  - Message relay               │  │
│  │  - colibri.wasm │  │  - Agent coordination          │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
│  ┌─────────────────┐  ┌─────────────────────────────────┐  │
│  │  Native Python  │  │  IPFS (port 5001/8080)         │  │
│  │  Server (3002)  │  │  - Model chunk storage         │  │
│  │  - Heavy models │  │  - P2P content distribution    │  │
│  └─────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Model Registration

Models are identified by IPFS CID and registered via:
```bash
curl -X POST http://localhost:3001/api/models/register \
  -H "Content-Type: application/json" \
  -d '{
    "cid": "bafyreibglm52",
    "name": "GLM-5.2 744B",
    "size": 372000000000,
    "quantization": "int4"
  }'
```

## P2PCLAW Integration

The fellowship node integrates with the P2PCLAW network via:
- **Gun.js mesh** at `/gun` — connects browser nodes and other fellowships
- **IPFS bitswap** — distributes model chunks across the 14-agent collective
- **WASM metrics** — exported via `/api/colibri/status` for dashboard

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP API port |
| `GUN_PORT` | `8081` | Gun.js relay port |
| `IPFS_PROFILE` | `fellowship` | IPFS profile |
| `GUN_PEERS` | `wss://fellowship.muhanai.com/gun` | Gun.js bootstrap peers |
| `COLIBRI_MODEL_DIR` | `/data/models` | Model storage path |
| `COLIBRI_WORKERS` | `4` | WASM thread pool size |
| `COLI_PATH` | `/app/coli` | Native binary path |
| `PYTHON_SERVER` | `http://localhost:3002` | Fallback Python server |

## Files

| File | Description |
|------|-------------|
| `Dockerfile.colibri` | Multi-stage: WASM build + native build + runtime |
| `build-wasm.sh` | Standalone WASM build script |
| `docker-compose.yml` | Full stack: fellowship + IPFS + Gun + Python |
| `src/index.js` | Node.js API server with WASM + native inference |
| `public/colibri/` | WASM artifacts (colibri.js, colibri.wasm, colibri.data) |
| `data/` | Persistent volumes (IPFS, Gun, models) |

## Integration with Python Connector

The `pythia_connector` Python package can push events to the fellowship node:

```python
from pythia_connector import PythiaClient
from localcrab_adapter import LocalCrabClient, EvidenceWriter, ForecastLedger

# Events flow: Pythia → LocalCrab → Fellowship P2P network
pythia = PythiaClient()
localcrab = LocalCrabClient()
writer = EvidenceWriter(localcrab)

for event in pythia.get_events():
    writer.write_event(event)  # Stores in LocalCrab, pushes to P2P
```

## Scaling

- **Horizontal**: Run multiple fellowship nodes behind a load balancer
- **Model sharding**: Each node registers different model CIDs
- **Browser offload**: WASM inference runs client-side; server only coordinates
- **IPFS pinning**: Use `ipfs-cluster` for coordinated pinning across fellowships