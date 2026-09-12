"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  Folder,
  FileText,
  Terminal as TerminalIcon,
  Globe,
  Cpu,
  Settings as SettingsIcon,
  Code,
  RefreshCw,
  ArrowLeft,
  ArrowRight,
  Play,
  CheckCircle2,
  HardDrive,
  Sliders,
  Rocket,
  Download,
  Radio,
  Zap,
  Package,
  Bot,
} from "lucide-react";
import { BitterbotStatus, type BitterbotWorkerConfig } from "@agentmesh/bitterbot";
import { getMenuTranslation } from "@agentmesh/web/components/menu-i18n.js";
import { useI18n } from "@agentmesh/web/i18n.js";

export function FileExplorerApp() {
  const [currentPath, setCurrentPath] = useState("/home/user");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);

  const files = [
    { name: "Documents", type: "folder", size: "4 items", updated: "Today" },
    {
      name: "Knowledge-Base",
      type: "folder",
      size: "12 docs",
      updated: "Yesterday",
    },
    { name: "Models", type: "folder", size: "3 weights", updated: "Sep 07" },
    {
      name: "agent-mesh.config.json",
      type: "file",
      size: "2.4 KB",
      updated: "Today",
    },
    {
      name: "system-prompt.md",
      type: "file",
      size: "1.1 KB",
      updated: "Sep 08",
    },
    {
      name: "credentials.vault",
      type: "file",
      size: "512 B",
      updated: "Sep 06",
    },
  ];

  return (
    <div className="h-full flex flex-col bg-[#16162a] text-gray-200 text-xs">
      <div className="flex items-center gap-2 p-2 border-b border-gray-700/60 bg-[#121224]">
        <span className="text-gray-400">Path:</span>
        <div className="flex-1 bg-black/40 border border-gray-700/50 rounded px-2 py-1 font-mono text-[11px]">
          {currentPath}
        </div>
      </div>
      <div className="flex-1 p-3 grid grid-cols-3 gap-3 overflow-y-auto content-start">
        {files.map((f) => (
          <button
            key={f.name}
            type="button"
            onClick={() => setSelectedFile(f.name)}
            onDoubleClick={() => {
              if (f.type === "folder") {
                setCurrentPath((prev) => `${prev}/${f.name}`);
              }
            }}
            className={`flex flex-col items-center p-3 rounded-lg border text-center transition-all ${
              selectedFile === f.name
                ? "bg-blue-600/20 border-blue-500 text-white"
                : "bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.08]"
            }`}
          >
            {f.type === "folder" ? (
              <Folder size={32} className="text-amber-400 mb-1" />
            ) : (
              <FileText size={32} className="text-blue-400 mb-1" />
            )}
            <span className="truncate w-full font-medium">{f.name}</span>
            <span className="text-[10px] text-gray-400 mt-0.5">{f.size}</span>
          </button>
        ))}
      </div>
      <div className="p-2 border-t border-gray-700/60 bg-[#121224] text-[11px] text-gray-400 flex justify-between">
        <span>6 items</span>
        <span>{selectedFile ? `Selected: ${selectedFile}` : "Ready"}</span>
      </div>
    </div>
  );
}

export function TerminalApp() {
  const [history, setHistory] = useState<Array<{ cmd: string; out: string }>>([
    {
      cmd: "welcome",
      out: "MuhanAI DaedalOS Shell v1.0.0 [x86_64-darwin]\nType 'help' for a list of available commands.",
    },
  ]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const handleCommand = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    let out = "";
    switch (trimmed.toLowerCase()) {
      case "help":
        out =
          "Commands:\n  help      - Show this help\n  neofetch  - System information\n  status    - Engine & network status\n  clear     - Clear terminal\n  ls        - List directory\n  whoami    - Print user identity";
        break;
      case "neofetch":
        out = `  __  __       _                  OS: DaedalOS Web 2026.09\n |  \\/  |_   _| |__   __ _ _ __   Host: Browser Sandbox (WebGPU)\n | |\\/| | | | | '_ \\ / _\` | '_ \\  Kernel: 6.12.0-agentmesh\n | |  | | |_| | | | | (_| | | | | Uptime: 42 mins\n |_|  |_|\\__,_|_| |_|\\__,_|_| |_| Memory: 2.1 GB / 8.0 GB`;
        break;
      case "status":
        out =
          "AI Engine: Ready (llama-3-8b-q4)\nBackend: WebGPU\nP2P Mesh: 14 connected peers\nToken Bank: 50,000 Credits";
        break;
      case "whoami":
        out = "agent@muhanai.local (role: primary-operator)";
        break;
      case "ls":
        out =
          "Documents/   Knowledge-Base/   Models/   agent-mesh.config.json   system-prompt.md";
        break;
      case "clear":
        setHistory([]);
        setInput("");
        return;
      default:
        out = `bash: command not found: ${trimmed}`;
    }

    setHistory((prev) => [...prev, { cmd: trimmed, out }]);
    setInput("");
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  return (
    <div className="h-full flex flex-col bg-[#0b0c14] text-emerald-400 font-mono text-xs p-3 select-text">
      <div className="flex-1 overflow-y-auto space-y-2">
        {history.map((h, i) => (
          <div key={i}>
            <div className="text-gray-400">
              <span className="text-cyan-400">user@muhanai</span>
              <span className="text-white">:</span>
              <span className="text-purple-400">~</span>$ {h.cmd}
            </div>
            <pre className="text-emerald-400 whitespace-pre-wrap font-mono mt-0.5">
              {h.out}
            </pre>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleCommand}
        className="flex items-center gap-1 pt-2 border-t border-gray-800"
      >
        <span className="text-cyan-400">user@muhanai</span>
        <span className="text-white">:</span>
        <span className="text-purple-400">~</span>$
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 bg-transparent border-none outline-none text-emerald-400 font-mono text-xs"
          autoFocus
        />
      </form>
    </div>
  );
}

export function BrowserApp() {
  const { lang } = useI18n();
  const menuI18n = getMenuTranslation(lang);
  const [url, setUrl] = useState("https://find.muhanai.com");

  return (
    <div className="h-full flex flex-col bg-[#1a1a2e] text-gray-200">
      <div className="flex items-center gap-2 p-2 border-b border-gray-700 bg-[#141426]">
        <button
          type="button"
          className="p-1 rounded hover:bg-white/10 text-gray-400"
        >
          <ArrowLeft size={14} />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-white/10 text-gray-400"
        >
          <ArrowRight size={14} />
        </button>
        <button
          type="button"
          className="p-1 rounded hover:bg-white/10 text-gray-400"
        >
          <RefreshCw size={14} />
        </button>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="flex-1 bg-black/40 border border-gray-700 rounded px-3 py-1 text-xs text-cyan-300 font-mono outline-none"
        />
      </div>
      <div className="flex-1 p-6 flex flex-col items-center justify-center text-center bg-gradient-to-b from-[#16162a] to-[#0d0e1a]">
        <Globe size={48} className="text-blue-400 mb-3 animate-pulse" />
        <h2 className="text-lg font-bold text-white mb-1">
          {menuI18n.desktop?.apps?.browser?.name || "웹 브라우저"}
        </h2>
        <p className="text-xs text-gray-400 max-w-sm mb-4">
          {menuI18n.desktop?.apps?.browser?.description || "탈중앙화 P2P 웹 & 분산 검색"}
        </p>
        <div className="flex items-center gap-2 text-xs bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded-full">
          <CheckCircle2 size={13} />
          <span>안전한 E2E 메쉬 터널 활성</span>
        </div>
      </div>
    </div>
  );
}

export function EngineMonitorApp({ engineStatus }: { engineStatus?: string }) {
  const { lang } = useI18n();
  const menuI18n = getMenuTranslation(lang);
  return (
    <div className="h-full p-4 bg-[#16162a] text-gray-200 text-xs flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-center justify-between p-3 rounded-lg bg-white/[0.04] border border-white/[0.08]">
        <div>
          <div className="font-semibold text-sm text-white">
            {menuI18n.desktop?.apps?.engine?.name || "AI 엔진 모니터"}
          </div>
          <div className="text-gray-400 text-[11px]">
            {menuI18n.desktop?.apps?.engine?.description || "WebGPU / WASM 로컬 추론 텔레메트리"}
          </div>
        </div>
        <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
          {engineStatus || "ready"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-lg bg-black/30 border border-white/5">
          <div className="text-gray-400 text-[11px] mb-1">모델</div>
          <div className="font-semibold text-white">llama-3-8b-q4</div>
        </div>
        <div className="p-3 rounded-lg bg-black/30 border border-white/5">
          <div className="text-gray-400 text-[11px] mb-1">백엔드</div>
          <div className="font-semibold text-cyan-400">
            WebGPU (Metal/Vulkan)
          </div>
        </div>
        <div className="p-3 rounded-lg bg-black/30 border border-white/5">
          <div className="text-gray-400 text-[11px] mb-1">컨텍스트 윈도우</div>
          <div className="font-semibold text-white">2048 Tokens</div>
        </div>
        <div className="p-3 rounded-lg bg-black/30 border border-white/5">
          <div className="text-gray-400 text-[11px] mb-1">샘플링 온도</div>
          <div className="font-semibold text-amber-400">0.70</div>
        </div>
      </div>

      <div className="p-3 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-2">
        <div className="text-[11px] font-medium text-gray-300">
          VRAM / 메모리 할당
        </div>
        <div className="w-full h-2 rounded-full bg-gray-800 overflow-hidden">
          <div className="w-[34%] h-full bg-gradient-to-r from-emerald-500 to-cyan-500" />
        </div>
        <div className="flex justify-between text-[10px] text-gray-400">
          <span>할당: 2.7 GB</span>
          <span>총 가용: 8.0 GB</span>
        </div>
      </div>
    </div>
  );
}

export function CodeStudioApp() {
  const { lang } = useI18n();
  const menuI18n = getMenuTranslation(lang);
  const [code, setCode] = useState(`// MuhanAI Token-Free Autonomous Agent
import { MuhanMesh } from "@agentmesh/mesh";

async function main() {
  const mesh = new MuhanMesh({ tokenFree: true });
  await mesh.connect();
  console.log("Connected to P2P Quorum!");
}

main();`);

  return (
    <div className="h-full flex flex-col bg-[#11121d] text-gray-200">
      <div className="flex items-center justify-between p-2 border-b border-gray-800 bg-[#0d0e17]">
        <span className="font-mono text-xs text-gray-400">scratchpad.ts</span>
        <button
          type="button"
          className="flex items-center gap-1.5 px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-medium"
        >
          <Play size={12} /> {menuI18n.desktop?.apps?.editor?.name || "코드 실행"}
        </button>
      </div>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        className="flex-1 w-full p-3 bg-transparent font-mono text-xs text-emerald-300 outline-none resize-none leading-relaxed"
        spellCheck={false}
      />
    </div>
  );
}

export function SettingsApp() {
  const { lang } = useI18n();
  const menuI18n = getMenuTranslation(lang);
  const [p2pActive, setP2pActive] = useState(true);
  const [darkTheme, setDarkTheme] = useState(true);

  return (
    <div className="h-full p-4 bg-[#16162a] text-gray-200 text-xs space-y-4 overflow-y-auto">
      <div className="border-b border-gray-700/60 pb-2">
        <h3 className="font-semibold text-white text-sm">
          {menuI18n.desktop?.apps?.settings?.name || "시스템 설정"}
        </h3>
        <p className="text-gray-400 text-[11px]">
          {menuI18n.desktop?.apps?.settings?.description || "환경설정, 테마 & P2P 키 관리"}
        </p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center justify-between p-2.5 rounded bg-white/[0.03] border border-white/[0.06] cursor-pointer">
          <div>
            <div className="font-medium text-white">P2P 메쉬 디스커버리</div>
            <div className="text-gray-400 text-[10px]">
              로컬 libp2p 피어를 자동 검색
            </div>
          </div>
          <input
            type="checkbox"
            checked={p2pActive}
            onChange={(e) => setP2pActive(e.target.checked)}
            className="toggle"
          />
        </label>

        <label className="flex items-center justify-between p-2.5 rounded bg-white/[0.03] border border-white/[0.06] cursor-pointer">
          <div>
            <div className="font-medium text-white">다크 네뷸라 테마</div>
            <div className="text-gray-400 text-[10px]">
              우주 글라스 & 그라디언트 액센트
            </div>
          </div>
          <input
            type="checkbox"
            checked={darkTheme}
            onChange={(e) => setDarkTheme(e.target.checked)}
            className="toggle"
          />
        </label>
      </div>
    </div>
  );
}

export function BitterbotApp() {
  const { lang } = useI18n();
  const menuI18n = getMenuTranslation(lang);
  const [status, setStatus] = useState<BitterbotStatus>({
    started: false,
    mode: "local",
    peerId: null,
    multiaddrs: [],
  });
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const toggleMode = () => {
    setStatus((prev) => {
      const nextMode: "local" | "p2p" = prev.mode === "p2p" ? "local" : "p2p";
      return {
        ...prev,
        started: true,
        mode: nextMode,
        peerId: nextMode === "p2p" ? "mock-peer-id" : null,
        multiaddrs: nextMode === "p2p" ? ["/ip4/127.0.0.1/udp/0/quic-v1"] : [],
      };
    });
  };

  const handleSend = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setStatus((prev) => ({ ...prev, started: true }));
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          text: `🤖 Bitterbot Agent (${status.mode.toUpperCase()}): "${userMsg}" 메시지를 확인했습니다. ${
            status.mode === "p2p"
              ? "P2P 메쉬를 통해 피어들과 협업하여 작업을 처리하겠습니다."
              : "로컬 환경에서 작업을 처리하겠습니다."
          }`,
        },
      ]);
    }, 1200);
  };

  return (
    <div className="h-full flex flex-col bg-[#0f111a] text-gray-200 text-xs">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-700/60 bg-[#0a0c12]">
        <div className="flex items-center gap-2">
          <Package size={18} className="text-amber-400" />
          <span className="font-medium text-white">{menuI18n.desktop?.apps?.bitterbot?.name || "비터봇 에이전트"}</span>
        </div>
        <div className="flex items-center gap-2">
          {status.started && status.mode === "p2p" && status.peerId ? (
            <span className="flex items-center gap-1.5 text-emerald-400 text-[10px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              P2P 연결됨
            </span>
          ) : status.started ? (
            <span className="flex items-center gap-1.5 text-amber-400 text-[10px]">
              <Radio size={12} className="animate-spin" />
              로컬 모드
            </span>
          ) : null}
          {status.multiaddrs.length > 0 && (
            <span className="text-gray-500 text-[9px] font-mono hidden sm:inline-block">
              {status.multiaddrs[0]}
            </span>
          )}
          <button
            type="button"
            onClick={toggleMode}
            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 text-[10px] transition-colors"
          >
            <Zap size={10} />
            {status.mode === "p2p" ? "P2P" : "로컬"}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 px-2 py-1 rounded bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 text-[10px] transition-colors"
            onClick={() => { setMessages([]); setStatus({ started: false, mode: "local", peerId: null, multiaddrs: [] }); }}
          >
            <RefreshCw size={11} /> 초기화
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 p-3 overflow-y-auto space-y-2">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center mb-3 border border-amber-500/20">
              <Package size={24} className="text-amber-400" />
            </div>
            <p className="text-gray-400 text-sm mb-1">{menuI18n.desktop?.apps?.bitterbot?.name || "비터봇 에이전트"}</p>
            <p className="text-gray-500 text-[10px] max-w-[200px]">
              {menuI18n.desktop?.apps?.bitterbot?.description || "P2P 자율 에이전트 태스크 러너"}
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-lg p-2.3 ${
                msg.role === "user"
                  ? "bg-emerald-600/30 text-white border border-emerald-500/30"
                  : "bg-gray-800/6 text-gray-200 border border-gray-700/40"
              }`}
            >
              <p className="text-[11px] leading-relaxed">{msg.text}</p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={handleSend}
        className="p-2 border-t border-gray-700/60 bg-[#0a0c12]"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="비터봇 에이전트에게 질문..."
            disabled={!status.started}
            className="flex-1 bg-black/40 border border-gray-600/50 rounded px-3 py-1.5 font-mono text-[11px] text-gray-200 placeholder-gray-500 outline-none focus:border-amber-500/50 transition-colors disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!input.trim() || !status.started}
            className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded border border-amber-500/30 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
          >
            <Play size={11} /> 전송
          </button>
        </div>
      </form>
    </div>
  );
}

export function DownloadBanner() {
  const { lang } = useI18n();
  const menuI18n = getMenuTranslation(lang);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-lg mb-3">
      <Rocket size={16} className="text-amber-400" />
      <div className="flex-1 min-w-0">
        <p className="text-white text-[11px] font-medium">{menuI18n.desktop?.apps?.desktop?.name || "DaedalOS 데스크톱"}</p>
        <p className="text-gray-400 text-[10px]">
          P2P 메쉬, AI 에이전트, 비터봇과 함께하는 오프라인 경험
        </p>
      </div>
      <a
        href="https://muhanai.com/download"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-black rounded text-[10px] font-medium transition-colors flex-shrink-0"
      >
        <Download size={12} /> 다운로드
      </a>
    </div>
  );
}
