# MiniCPM-V & MuhanAI Integration - Implementation Plan

## Executive Summary

Integrate MiniCPM-V-4.7-35B-A3B vision model with DadaBot mobile app and MuhanAI network to enable smart glasses as network nodes with local/remote vision inference capabilities.

## Current State Assessment

### Existing Assets
- Minima blockchain integration (RPC, MDS, Anchor, DADA)
- MuhanAI Anchor minidapp (SHA-256 anchoring to Minima chain)
- Minima client library (RPC, MDS, Anchor, DADA)
- Core packages: busabase-adapter, affine-adapter, proposal-bridge
- sam-tools (FreeModelRotator with 6 free providers)
- dadabot-cli (22 tests passing)
- Web-app with Vite + React + Tauri v2 mobile support

### Missing Components
- GlassesBridge - Smart glasses camera/audio interface
- MiniCPMAdapter - Local/remote vision model inference
- MuhanAIConnector - Network authentication & registration
- VisionTaskRouter - Local/remote inference routing
- PersonalMCP - Knowledge base integration
- Smart glasses UI components

## Phase 1: Foundation (Week 1-2)

### 1.1 GlassesBridge - Smart Glasses Interface
**File**: `web-app/src/glasses/GlassesBridge.ts`

Smart glasses communication layer supporting Bluetooth LE, WiFi Direct, USB-C. Handles camera frames, audio I/O, IMU data, battery status.

### 1.2 MiniCPMAdapter - Vision Model Inference
**File**: `packages/minima-client/src/minicpm-adapter.ts`

Supports both local (ONNX/WebGPU) and remote (API) inference with auto-selection based on device capabilities and task complexity.

### 1.3 MuhanAIConnector - Network Authentication
**File**: `packages/minima-client/src/muhanai-connector.ts`

Handles authentication, node registration, and P2P connectivity using Minima DID for identity, Waku/libp2p for P2P.

## Phase 2: Vision Pipeline (Week 2-3)

### 2.1 VisionTaskRouter - Smart Routing
Routes vision tasks to local or remote based on device capability, task complexity, network conditions, and privacy requirements.

### 2.2 PersonalMCP - Knowledge Base Integration
Personal MCP server for local knowledge base exposing vision results as searchable memories.

## Phase 3: Smart Glasses UI (Week 3-4)

### React Components
- GlassesConnection.tsx - Connection status & pairing
- VisionFeed.tsx - Live camera preview with overlays
- VisionResults.tsx - Analysis results display
- VisionHistory.tsx - Searchable history
- GlassesSettings.tsx - Device config, privacy, routing prefs

### Tauri Mobile Commands (Rust)
Native commands for glasses access via Tauri v2.

## Phase 4: Integration & Testing (Week 4-5)

### 4.1 Minima Bridge Enhancement
Settle vision compute costs on-chain, pay remote providers, reward local compute contributors.

### 4.2 End-to-End Test
Full flow: Glasses Capture → MiniCPM → MuhanAI → Minima → MDS → Knowledge Base

## File Structure Summary

```
integration-finalize/
├── packages/
│   ├── minima-client/
│   │   ├── src/
│   │   │   ├── minicpm-adapter.ts
│   │   │   ├── muhanai-connector.ts
│   │   │   ├── vision-router.ts
│   │   │   ├── personal-mcp.ts
│   │   │   └── index.ts
│   ├── minima-bridge/
│   │   └── src/vision-settlement.ts
├── web-app/
│   ├── src/
│   │   ├── components/glasses/
│   │   ├── hooks/useMinima.ts
│   │   └── components/minima/VisionAnalysisPage.tsx
├── minima-integration/
│   ├── config/minidapps/muhanai-anchor/
├── scripts/e2e-vision.test.ts
```

## Dependencies to Add
- onnxruntime-web, @xenova/transformers
- @waku/sdk, @libp2p/*
- onnxruntime-web, better-sqlite3
- @tauri-apps/cli, @types/web-bluetooth

## Implementation Priority
| Priority | Component | Effort |
|----------|-----------|--------|
| P0 | MiniCPMAdapter (remote) | 3 days |
| P0 | MuhanAIConnector | 2 days |
| P0 | GlassesBridge (BLE) | 3 days |
| P1 | MiniCPMAdapter (local ONNX) | 4 days |
| P1 | VisionTaskRouter | 2 days |
| P1 | PersonalMCP | 3 days |

## Success Criteria
1. Smart glasses connect via BLE/WiFi to DadaBot mobile
2. Camera frames stream to MiniCPM (local or remote)
3. Results displayed in real-time on mobile app
4. Results anchored to Minima chain via MDS
5. Results stored in PersonalMCP with embeddings
6. Compute costs settled on Minima via DADA tokens
7. Knowledge searchable via PersonalMCP
8. Node registered on MuhanAI network via Waku
EOF
echo "Plan created"