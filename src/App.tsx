import { useCallback, useEffect, useState } from "react";
import type {
  Approval,
  ChatResult,
  ClientConfig,
  Credentials,
  WorldConfig,
} from "./api.js";
import { getBridge } from "./webBridge.js";
import { WorldView } from "./components/WorldView.js";

interface Msg {
  role: "user" | "assistant";
  text: string;
  provider?: string;
}

const RISK_LABEL: Record<Approval["riskTier"], string> = {
  read: "읽기 (자동 승인)",
  write: "쓰기 (확인 필요)",
  external: "외부 호출 (항상 확인)",
  system: "시스템 (사유 필수)",
};

const EMPTY_CREDS: Credentials = { deviceToken: "", adminKey: "" };

/** Server stamps epoch millis; render as local time, blank if absent/invalid. */
function fmtTime(ms: number | undefined): string {
  if (!ms) return "";
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString();
}

export function App(): React.JSX.Element {
  const [apiUrl, setApiUrl] = useState("http://localhost:3001");
  const [creds, setCreds] = useState<Credentials>(EMPTY_CREDS);
  const [pairCode, setPairCode] = useState("");
  const [adminKeyInput, setAdminKeyInput] = useState("");
  const [config, setConfig] = useState<ClientConfig | null>(null);
  const [prompt, setPrompt] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [viewMode, setViewMode] = useState<"chat" | "world">("chat");
  const [worldConfig, setWorldConfig] = useState<WorldConfig | null>(null);

  useEffect(() => {
    const b = getBridge();
    void b.getApiUrl().then(setApiUrl).catch(() => undefined);
    void b
      .restoreCreds()
      .then((c) => setCreds({ deviceToken: c.deviceToken ?? "", adminKey: c.adminKey ?? "" }))
      .catch(() => undefined);
  }, []);

  // Server config is public — fetch once the API URL is known.
  useEffect(() => {
    let cancelled = false;
    void getBridge()
      .fetchConfig(apiUrl)
      .then((c) => {
        if (!cancelled) setConfig(c);
      })
      .catch(() => {
        /* 오프라인이어도 UI는 계속 동작 — 무시 */
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  // 월드 뷰 설정 — 공개 엔드포인트, 페어링 없이도 호출 가능
  useEffect(() => {
    let cancelled = false;
    void getBridge()
      .fetchWorldConfig(apiUrl)
      .then((c) => {
        if (!cancelled) setWorldConfig(c);
      })
      .catch(() => {
        /* 월드 구성 불러오기 실패 — 오프라인 시 무시 */
      });
    return () => {
      cancelled = true;
    };
  }, [apiUrl]);

  const pollApprovals = useCallback(async () => {
    if (!creds.adminKey) return; // admin capability absent — nothing we are allowed to read
    try {
      setApprovals(await getBridge().pendingApprovals(apiUrl, creds));
    } catch {
      /* 승인 폴링 실패는 조용히 무시 — 다음 틱에 재시도 */
    }
  }, [apiUrl, creds]);

  useEffect(() => {
    if (!creds.adminKey) return;
    void pollApprovals();
    const t = setInterval(() => void pollApprovals(), 5000);
    return () => clearInterval(t);
  }, [creds.adminKey, pollApprovals]);

  async function onPair(): Promise<void> {
    setError(null);
    const b = getBridge();
    try {
      const code = pairCode.trim().toUpperCase();
      if (!code) throw new Error("페어링 코드가 비어 있습니다.");
      const r = await b.redeemPairingCode(apiUrl, code, { appVersion: "0.1.0" });
      const next: Credentials = { deviceToken: r.token, adminKey: adminKeyInput.trim() };
      await b.setCreds(next);
      setCreds(next);
      setPairCode("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "pairing failed");
    }
  }

  async function onSaveApiUrl(): Promise<void> {
    await getBridge().setApiUrl(apiUrl);
  }

  async function onSaveAdminKey(): Promise<void> {
    const next: Credentials = { ...creds, adminKey: adminKeyInput.trim() };
    await getBridge().setCreds(next);
    setCreds(next);
  }

  async function onSend(): Promise<void> {
    const q = prompt.trim();
    if (!q || busy) return;
    if (!creds.adminKey) {
      setError("채팅에는 관리자 키가 필요합니다. 설정에서 입력하세요.");
      return;
    }
    setBusy(true);
    setError(null);
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setPrompt("");
    try {
      const r: ChatResult = await getBridge().chat(apiUrl, creds, q);
      setMsgs((m) => [...m, { role: "assistant", text: r.text, provider: r.provider }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "chat failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDecide(id: string, decision: "approve" | "deny"): Promise<void> {
    try {
      await getBridge().decideApproval(apiUrl, creds, id, decision);
      setApprovals((a) => a.filter((x) => x.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "approval failed");
    }
  }

  if (!creds.deviceToken) {
    return (
      <main style={{ padding: 32, fontFamily: "system-ui", maxWidth: 480 }}>
        <h1>Muhan Thin Client</h1>
        <p>웹 콘솔에서 발급한 6자리 페어링 코드를 입력하세요.</p>
        {config ? (
          <p style={{ color: "#666", fontSize: 13 }}>
            서버 버전 {config.latestVersion} · 최소 {config.minimumVersion} · 채널 {config.updateChannel}
          </p>
        ) : null}
        <label>
          API URL
          <input
            value={apiUrl}
            onChange={(e) => setApiUrl(e.target.value)}
            onBlur={() => void onSaveApiUrl()}
            style={{ width: "100%" }}
          />
        </label>
        <label>
          Pairing code
          <input value={pairCode} onChange={(e) => setPairCode(e.target.value)} style={{ width: "100%" }} />
        </label>
        <label>
          관리자 키 (chat·승인에 필요)
          <input
            type="password"
            value={adminKeyInput}
            onChange={(e) => setAdminKeyInput(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>
        <button type="button" onClick={() => void onPair()}>
          연결
        </button>
        {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
      </main>
    );
  }

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 720 }}>
      <h1>Muhan Thin Client</h1>
      <div style={{ marginBottom: 16, display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onClick={() => setViewMode("chat")}
          disabled={viewMode === "chat"}
          style={{ padding: "6px 12px" }}
        >
          💬 채팅
        </button>
        <button
          type="button"
          onClick={() => setViewMode("world")}
          disabled={viewMode === "world"}
          style={{ padding: "6px 12px" }}
        >
          🌐 월드 뷰
        </button>
        {worldConfig && (
          <span
            style={{
              fontSize: 12,
              color: "#666",
              marginLeft: "auto",
              padding: "4px 8px",
              background: "#f0f0f0",
              borderRadius: 4,
            }}
          >
            GEV: {worldConfig.gevUrl}
          </span>
        )}
      </div>
      {creds.deviceToken && !creds.adminKey ? (
        <section style={{ border: "1px solid #bbb", padding: 12, marginBottom: 16 }}>
          <strong>관리자 키 미설정</strong>
          <p style={{ fontSize: 13 }}>
            채팅과 승인 처리는 서버가 관리자 키를 요구합니다. 아래에 입력하면 vault에 암호화 저장됩니다.
          </p>
          <input
            type="password"
            value={adminKeyInput}
            onChange={(e) => setAdminKeyInput(e.target.value)}
            placeholder="admin key"
            style={{ width: "60%" }}
          />{" "}
          <button type="button" onClick={() => void onSaveAdminKey()}>
            저장
          </button>
        </section>
      ) : null}
      {approvals.length > 0 ? (
        <section style={{ border: "2px solid darkorange", padding: 12, marginBottom: 16 }}>
          <h2>승인 대기 ({approvals.length})</h2>
          {approvals.map((a) => (
            <div key={a.id} style={{ marginBottom: 8 }}>
              <strong>{a.resource}</strong> — {RISK_LABEL[a.riskTier]}
              <p>{a.summary}</p>
              {a.args ? (
                <pre style={{ fontSize: 12, margin: "4px 0" }}>{JSON.stringify(a.args, null, 2)}</pre>
              ) : null}
              <small style={{ color: "#666" }}>
                {fmtTime(a.createdAt)} 생성 · {fmtTime(a.expiresAt)} 만료
              </small>
              <div>
                <button type="button" onClick={() => void onDecide(a.id, "approve")}>
                  승인
                </button>{" "}
                <button type="button" onClick={() => void onDecide(a.id, "deny")}>
                  거부
                </button>
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {viewMode === "world" && creds.deviceToken ? (
        <section
          style={{
            width: "100%",
            height: "calc(100vh - 320px)",
            minHeight: 400,
            border: "1px solid #ddd",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <WorldView
            apiUrl={apiUrl}
            creds={creds}
            onEntitySelected={(id, type) => {
              setViewMode("chat");
              setPrompt(`월드 뷰에서 선택한 엔티티: ${id} (${type})`);
            }}
            onError={(code, message) => {
              setError(`월드 뷰 오류 [${code}]: ${message}`);
            }}
          />
        </section>
      ) : viewMode === "world" ? (
        <section style={{ padding: 24, textAlign: "center", color: "#666" }}>
          <p>페어링 후 월드 뷰를 사용할 수 있습니다.</p>
        </section>
      ) : null}

      {viewMode === "chat" && (
        <>
          <section>
            {msgs.map((m, i) => (
              <div key={`${i}-${m.role}`} style={{ marginBottom: 12 }}>
                <strong>{m.role === "user" ? "나" : `AI (${m.provider ?? "mesh"})`}:</strong>
                <p style={{ whiteSpace: "pre-wrap" }}>{m.text}</p>
              </div>
            ))}
          </section>
          <div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              style={{ width: "100%" }}
              placeholder="질문을 입력하세요…"
            />
            <button type="button" onClick={() => void onSend()} disabled={busy}>
              {busy ? "전송 중…" : "보내기"}
            </button>
          </div>
          {error ? <p style={{ color: "crimson" }}>{error}</p> : null}
        </>
      )}
    </main>
  );
}
