/**
 * WorldView ↔ gods-eye-view iframe 간 postMessage 통신 계약.
 *
 * thin-client → GEV (iframe contentWindow.postMessage):
 *   - GEV_AUTH: 인증 토큰 전달 (deviceToken, adminKey)
 *   - GEV_LAYER: 데이터 레이어 표시/숨김 토글
 *   - GEV_CAMERA: 카메라 위치/줌 이동
 *
 * GEV → thin-client (window.message 이벤트):
 *   - GEV_READY: 글로브 로드 완료
 *   - GEV_ENTITY_SELECTED: 사용자가 엔티티 선택 (CCTV, 항공기, 선박 등)
 *   - GEV_ERROR: GEV 측 오류 (인증 실패, 레이어 로드 실패 등)
 *
 * 보안: 모든 수신 메시지는 origin이 "*.muhanai.com"인지 검증 후 처리.
 */

/** thin-client → GEV iframe 메시지 */
export type ToGEVMessage =
  | { type: "GEV_AUTH"; token: string; adminKey: string }
  | { type: "GEV_LAYER"; layer: string; enabled: boolean }
  | { type: "GEV_CAMERA"; lat: number; lon: number; zoom: number };

/** GEV iframe → thin-client 메시지 */
export type FromGEVMessage =
  | { type: "GEV_READY"; version: string }
  | { type: "GEV_ENTITY_SELECTED"; id: string; entityType: string }
  | { type: "GEV_ERROR"; code: string; message: string };

/** 허락된 GEV origin 패턴 (배포 도메인) */
const GEV_ORIGIN_REGEX = /^https:\/\/(world|gev)\.muhanai\.com$/;

/** origin이 신뢰할 수 있는 GEV 도메인인지 검증 */
export function isTrustedGEVOrigin(origin: string): boolean {
  return GEV_ORIGIN_REGEX.test(origin);
}

/** 안전한 postMessage 전송 헬퍼 */
export function sendToGEV(
  iframe: HTMLIFrameElement | null,
  gevUrl: string,
  message: ToGEVMessage
): void {
  if (!iframe?.contentWindow) return;
  iframe.contentWindow.postMessage(message, gevUrl);
}

/** 메시지 수신 핸들러 등록 (origin 검증 포함) */
export type OnGEVMessage = (msg: FromGEVMessage) => void;

export function registerGEVMessageHandler(
  handler: OnGEVMessage
): () => void {
  const onMessage = (event: MessageEvent) => {
    if (!isTrustedGEVOrigin(event.origin)) return;
    try {
      handler(event.data as FromGEVMessage);
    } catch {
      // 핸들러 내부 오류는 앱 전체를 죽이지 않음
    }
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}