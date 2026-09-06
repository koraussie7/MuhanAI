import React, { useState, useEffect, useRef } from "react";
import { Sparkles, CornerDownLeft, PlusCircle } from "lucide-react";

interface CosmicPromptBarProps {
  onSearchOrPublish: (text: string) => void;
  onFilterChange: (text: string) => void;
}

const GHOST_PROMPTS = [
  "[[Zero-Token Gateway]] 동작 원리 탐색하기...",
  "신규 지식 노드 발행: #WebRTC 분산 CRDT 캐시",
  "피어 에이전트에게 묻기: Claude 3.7 vs DeepSeek R1 합의 알고리즘",
  "내 옵시디언 볼트 시냅스 발행: [[AI 메모리 레이크.md]]",
  "분산 P2P 지능 질문: #WebGPU 브라우저 로컬 추론",
];

export const CosmicPromptBar: React.FC<CosmicPromptBarProps> = ({
  onSearchOrPublish,
  onFilterChange,
}) => {
  const [inputVal, setInputVal] = useState("");
  const [promptIdx, setPromptIdx] = useState(0);
  const [displayText, setDisplayText] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global Keyboard Shortcuts: ⌘K or / to focus the prompt bar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "/" && document.activeElement !== inputRef.current) {
        e.preventDefault();
        inputRef.current?.focus();
      } else if (e.key === "Escape" && document.activeElement === inputRef.current) {
        inputRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Typewriter Ghost Animation Effect
  useEffect(() => {
    if (isFocused || inputVal) return; // Pause ghost typing while user is interacting

    const targetFull = GHOST_PROMPTS[promptIdx] || "";
    const speed = isDeleting ? 25 : 65;

    const timer = setTimeout(() => {
      if (!isDeleting) {
        setDisplayText(targetFull.slice(0, displayText.length + 1));
        if (displayText.length + 1 >= targetFull.length) {
          setTimeout(() => setIsDeleting(true), 2400); // Pause on completed sentence
        }
      } else {
        setDisplayText(targetFull.slice(0, displayText.length - 1));
        if (displayText.length <= 1) {
          setIsDeleting(false);
          setPromptIdx((prev) => (prev + 1) % GHOST_PROMPTS.length);
        }
      }
    }, speed);

    return () => clearTimeout(timer);
  }, [displayText, isDeleting, promptIdx, isFocused, inputVal]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputVal(val);
    onFilterChange(val); // Filter nodes in real time
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const query = inputVal.trim();
    if (!query) return;
    onSearchOrPublish(query);
    setInputVal("");
    onFilterChange("");
  };

  return (
    <div className="cosmic-prompt-bar-wrap pointer-events-auto">
      <form
        onSubmit={handleSubmit}
        className={`cosmic-prompt-form ${isFocused ? "focused" : ""}`}
      >
        {/* Leading Pulsing Cosmic Glyph */}
        <div className="prompt-sparkle-indicator">
          <Sparkles size={15} className="sparkle-svg" />
        </div>

        {/* Center Input + Ghost Typing Placeholder */}
        <div className="prompt-input-relative">
          <input
            ref={inputRef}
            type="text"
            value={inputVal}
            onChange={handleChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            className="cosmic-real-input"
            spellCheck={false}
          />

          {!inputVal && (
            <div
              className="ghost-typewriter-line pointer-events-none"
              onClick={() => inputRef.current?.focus()}
            >
              <span className="ghost-text">{displayText}</span>
              <span className="blinking-neon-cursor">▋</span>
            </div>
          )}
        </div>

        {/* Trailing Action or Shortcut Badge */}
        <div className="prompt-tail-action">
          {inputVal.trim() ? (
            <button type="submit" className="prompt-action-pill-btn">
              <PlusCircle size={13} className="text-emerald-400" />
              <span>우주에 발행</span>
              <CornerDownLeft size={11} className="opacity-70" />
            </button>
          ) : (
            <div className="prompt-shortcut-badge">
              <span className="kbd-pill">⌘K</span>
              <span className="kbd-divider">/</span>
              <span className="kbd-pill">/</span>
            </div>
          )}
        </div>
      </form>
    </div>
  );
};

export default CosmicPromptBar;
