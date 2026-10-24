import { useEffect, useRef, useCallback, useState } from "react";
import type { Credentials } from "../api.js";
import {
  isTrustedGEVOrigin,
  registerGEVMessageHandler,
  sendToGEV,
  type FromGEVMessage,
  type ToGEVMessage,
} from "../worldBridge.js";

/** Vite가 주입하는 환경 변수 타입 (vite/client 미설치 환경 대응) */
declare global {
  interface ImportMetaEnv {
    VITE_GEV_URL?: string;
  }
  interface ImportMeta {
    env: ImportMetaEnv;
  }
}

export interface WorldViewProps {
  apiUrl: string;
  creds: Credentials;
  onEntitySelected?: (id: string, entityType: string) => void;
  onError?: (code: string, message: string) => void;
}

/**
 * WorldView — gods-eye-view 글로브를 iframe으로 임베드.
 *
 * - creds.deviceToken이 있을 때만 iframe을 렌더링 (미페어링 시 안내 메시지)
 * - GEV_READY 수신 후 GEV_AUTH로 인증 토큰 전달
 * - postMessage origin은 muhanai.com 도메인으로 엄격 제한
 * - 레이어 토글 / 카메라 이동 메시지를 외부에서 전송할 수 있는 콜백 반환
 */
export function WorldView({ apiUrl, creds, onEntitySelected, onError }: WorldViewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);

  // GEV 서비스 URL — 배포 환경에 따라 .env로 오버라이드 가능
  const GEV_URL = import.meta.env.VITE_GEV_URL ?? "https://world.muhanai.com";

  const handleMessage = useCallback(
    (msg: FromGEVMessage) => {
      switch (msg.type) {
        case "GEV_READY":
          setReady(true);
          // 인증 토큰 전달
          void sendToGEV(iframeRef.current, GEV_URL, {
            type: "GEV_AUTH",
            token: creds.deviceToken,
            adminKey: creds.adminKey,
          });
          break;

        case "GEV_ENTITY_SELECTED":
          onEntitySelected?.(msg.id, msg.entityType);
          break;

        case "GEV_ERROR":
          onError?.(msg.code, msg.message);
          break;
      }
    },
    [creds, onEntitySelected, onError, GEV_URL]
  );

  // postMessage 수신 등록 (마운트 시 1회, 언마운트 시 해제)
  useEffect(() => {
    return registerGEVMessageHandler(handleMessage);
  }, [handleMessage]);

  // 레이어 토글 메시지 전송
  const sendLayerToggle = useCallback(
    (layer: string, enabled: boolean) => {
      const msg: ToGEVMessage = { type: "GEV_LAYER", layer, enabled };
      sendToGEV(iframeRef.current, GEV_URL, msg);
    },
    [GEV_URL]
  );

  // 카메라 이동 메시지 전송
  const sendCameraMove = useCallback(
    (lat: number, lon: number, zoom: number) => {
      const msg: ToGEVMessage = { type: "GEV_CAMERA", lat, lon, zoom };
      sendToGEV(iframeRef.current, GEV_URL, msg);
    },
    [GEV_URL]
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: "#000",
      }}
    >
      {creds.deviceToken ? (
        <iframe
          ref={iframeRef}
          src={`${GEV_URL}/`}
          title="MuhanAI World View — God's Eye View"
          role="iframe"
          style={{ width: "100%", height: "100%", border: "none", display: "block" }}
          sandbox="allow-scripts allow-same-origin"
          allow="camera; microphone; autoplay; geolocation"
        />
      ) : (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            color: "#666",
            fontFamily: "system-ui",
            padding: 24,
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: 16, marginBottom: 8 }}>페어링 후 월드 뷰를 사용할 수 있습니다.</p>
          <p style={{ fontSize: 13, color: "#999" }}>
            설정에서 페어링 코드를 입력하고 연결하세요.
          </p>
        </div>
      )}
    </div>
  );
}

export type { FromGEVMessage, ToGEVMessage } from "../worldBridge.js";