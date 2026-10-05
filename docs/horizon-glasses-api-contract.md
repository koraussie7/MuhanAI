# Horizon AI Glasses — API Contract (§5)

> **Base URL**: `https://muhanai.com/api/glasses/v1`
> **Auth**: Bearer device token (HMAC-SHA256 signed, 30-day TTL)
> **Safety**: Safety tasks (traffic-light, crosswalk, blind-path, obstacle) are **on-device only** (TFLite). Any request carrying `safety` fields for these tasks is rejected with `400 SAFETY_TASK_FORBIDDEN`.

## Device Token Format

```
Authorization: Bearer <base64url(payload)>.<hex(hmac_secret, payload)>
```

**Payload** (base64url-encoded JSON):
```json
{
  "deviceId": "string",
  "model": "string",
  "issuedAt": 1738000000000,
  "exp": 1738000000000
}
```

**Revocation**: POST `/devices/revoke` adds the token to a KV blacklist (`revoked:token:<token>`). Blacklisted tokens receive `401` on all subsequent calls.

## Rate Limits (per device)

| Endpoint | Limit | Window |
|---|---|---|
| `POST /llm/chat` | 30 | 5 min |
| `POST /llm/vision` | 6 | 5 min |
| `POST /quorum/ask` | 6 | 10 min |
| `GET /knowledge/search` + `POST /knowledge/publish` | 60 | 5 min |
| `POST /telemetry` | 600 | 5 min |

Excess requests return `429 Too Many Requests`.

## Endpoints

### 1. POST `/devices/register`

Issue a signed device token for a new (or re-registering) device.

**Request**:
```json
{
  "deviceId": "rokid-001",
  "model": "Rokid Glass 2"
}
```

**Response** `200`:
```json
{
  "tokenType": "Bearer",
  "expiresIn": 2592000,
  "scopes": ["llm.chat", "llm.vision", "quorum.ask", "knowledge.search", "knowledge.publish", "telemetry"]
}
```

---

### 1b. POST `/devices/revoke`

Revoke the current device token via KV blacklist.

**Requires auth**. The token used for this request is immediately blacklisted.

**Response** `200`:
```json
{
  "status": "revoked",
  "deviceId": "string",
  "message": "Device token has been revoked and added to the KV blacklist."
}
```

---

### 2. GET `/manifest`

Device config manifest — **no auth required**.

**Response** `200`:
```json
{
  "apiVersion": "v1",
  "endpoints": {
    "chat": "/api/glasses/v1/llm/chat",
    "vision": "/api/glasses/v1/llm/vision",
    "quorum": "/api/glasses/v1/quorum/ask",
    "knowledgeSearch": "/api/glasses/v1/knowledge/search",
    "knowledgePublish": "/api/glasses/v1/knowledge/publish",
    "telemetry": "/api/glasses/v1/telemetry"
  },
  "safety": {
    "onDeviceOnly": true,
    "tasks": ["traffic-light", "crosswalk", "blind-path", "obstacle"]
  },
  "rateLimits": {
    "chat": { "limit": 30, "window": "5m" },
    "vision": { "limit": 6, "window": "5m" },
    "quorum": { "limit": 6, "window": "10m" },
    "knowledge": { "limit": 60, "window": "5m" }
  }
}
```

---

### 3. POST `/llm/chat`

Intent-aware LLM proxy via DeepSeek or GLM (keyless-first fallback).

**Requires auth**.

**Request**:
```json
{
  "mode": "chat",
  "messages": [
    {"role": "system", "content": "..."},
    {"role": "user", "content": "..."}
  ],
  "language": "ko",
  "safety": ["traffic-light"]
}
```

- `mode`: `"intent"` | `"chat"` | `"translate"` | `"interpret"`
  - `intent`: Classifies user intent into enum (navigate, translate, interpret, query, none)
  - `translate`: Translates text to `language`
  - `interpret`: Spoken accessibility interpretation
  - `chat`: Standard conversational response
- `safety`: Optional array of safety task names. If any match the on-device set, returns `400 SAFETY_TASK_FORBDEN`.

**Response** `200`: LLM completion JSON (passthrough from upstream).

---

### 4. POST `/llm/vision`

GLM-4V vision proxy — consent-gated image analysis.

**Requires auth**.

**Request**:
```json
{
  "image": "data:image/png;base64,...",
  "question": "What obstacles are on the path ahead?",
  "safety": ["obstacle"]
}
```

- `image`: Base64-encoded image data URI (≤512KB, user-consent required)
- `question`: What to analyze in the image

**Response** `200`: LLM completion JSON (passthrough from GLM-4V).

---

### 5. POST `/quorum/ask`

Federated quorum-based question answering with multi-agent consensus.

**Requires auth**.

**Request**:
```json
{
  "question": "How do I get to the nearest subway station?",
  "minPeers": 3
}
```

**Response** `200`:
```json
{
  "quorum": { "minPeers": 3, "satisfied": true },
  "response": {
    "id": "chatcmpt-...",
    "choices": [{ "message": { "content": "..." } }]
  }
}
```

If the mesh is unavailable, the Worker falls back to a single LLM provider and returns `satisfied: false`.

---

### 6. GET `/knowledge/search`

Search the CRDT-based P2P knowledge lake.

**Requires auth**.

**Query parameters**: `?q=<search terms>` or `&query=<search terms>`

**Response** `200`:
```json
{
  "engine": "crdt-knowledge-lake",
  "query": "경사로",
  "sources": ["p2p-mesh", "local-fallback"],
  "results": [
    {
      "id": "entry-uuid",
      "title": "경사로 위치 정보",
      "content": "1층 계단 옆에 경사로가 있습니다.",
      "source": "p2p-mesh",
      "confidence": 0.94
    }
  ]
}
```

---

### 7. POST `/knowledge/publish`

Publish a first-person accessibility memory to the CRDT knowledge lake for mesh-wide sync.

**Requires auth**.

**Request**:
```json
{
  "intent": "crosswalk location near exit 3",
  "translation": "3번 출구 근처에 횡단보도가 있습니다.",
  "metadata": { "location": "lat,lng", "timestamp": 1738000000000 },
  "timestamp": 1738000000000
}
```

At least one of `intent` or `translation` is required.

**Response** `200`:
```json
{
  "engine": "crdt-knowledge-lake",
  "status": "published",
  "entryId": "entry-<deviceId>-<timestamp>",
  "publishedAt": 1738000000000
}
```

---

### 8. POST `/telemetry`

Device telemetry — metrics only, no raw media.

**Requires auth**.

**Request**:
```json
{
  "metric": "battery",
  "value": 85,
  "timestamp": 1738000000000
}
```

**Response** `200`:
```json
{
  "status": "accepted",
  "deviceId": "rokid-001",
  "metric": "battery",
  "receivedAt": 1738000000000
}
```

## Error Responses

| Status | Error | Description |
|---|---|---|
| `400` | `SAFETY_TASK_FORBIDDEN` | Request contains on-device safety task |
| `400` | `Missing field` | Required field missing in request body |
| `401` | `Unauthorized` | Missing or invalid device token (or token revoked) |
| `429` | `Rate limit exceeded` | Per-device rate limit exceeded |
| `502` | `Upstreams error` | Paid LLM provider (DeepSeek/GLM) unavailable |
| `500` | `Internal error` | Unexpected server error |
