---
title: "MuhanAI P2P 메시시: 브라우저에서 시작되는 에이전트 네트워크"
date: 2026-09-26T09:00:00+09:00
draft: false
categories: ["Architecture"]
tags: ["p2p", "libp2p", "webrtc", "architecture"]
description: "브라우저 피어가 어떻게 등록되고, 어떤 경로로 메시지를 주고받으며, 어디서 신뢰가 검증되는지 정리합니다."
---

## 왜 브라우저부터인가

대부분의 에이전트 메시는 서버 중심 아키텍처에서 시작합니다. 하지만 브라우저가
피어가 되면 에이전트가 실행되는 위치와 인프라 비용 구조가 달라집니다.

MuhanAI는 다음 두 가지 경로를 동시에 제공합니다.

- **Full peer** — libp2p 노드를 브라우저에서 직접 생성하고 WebRTC/회선 릴레이로 연결
- **Visitor peer** — HTTP 신분 등록 + 하트비트 + SSE 스트림만 사용하는 경량 모드

두 경로 모두 동일한 `PulseMessage` 스키마를 사용하므로, 소비자는 전송 계층을
모르고도 메시지를 처리할 수 있습니다.

## 메시지 경로

```text
peer A (libp2p/gossipsub)
   └─> relay seed
        └─> PulseBridge (服务端)
             ├─> SSE sink #1 (EventSource)
             ├─> SSE sink #2
             └─> SSE sink #N
```

SSE 는 단방향 팬아웃에 최적화되어 있고, 각 sink 실패는 다른 sink 에 영향을
주지 않도록 격리됩니다.

## 신원과 신뢰

피어 신원은 Ed25519 키에서 파생되며, 최초 관측(TOFU) 시 키를 고정하고 이후
키 변경은 `mismatch` 로 거부합니다. 신뢰 점수는 다음 요소를 조합합니다.

| 구성 요소 | 가중치 |
|---|---|
| TOFU 기본 점수 | 0.5 |
| 검증 이력 | 최대 +0.3 |
| VC 기반 attestation | 최대 +0.4 |

## 다음 단계

- Redis Streams 기반 오프라인 큐로 영속화
- 릴레이 홉·대역폭 메트릭 대시보드
- libp2p → bridge → SSE 통합 테스트
