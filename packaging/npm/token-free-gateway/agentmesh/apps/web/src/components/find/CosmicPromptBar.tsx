import "./cosmic-prompt.css";
import { CornerDownLeft, PlusCircle, Sparkles } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../i18n";

interface CosmicPromptBarProps {
	onSearchOrPublish: (text: string) => void;
	onFilterChange: (text: string) => void;
}

export const CosmicPromptBar: React.FC<CosmicPromptBarProps> = ({
	onSearchOrPublish,
	onFilterChange,
}) => {
	const { t } = useI18n();
	const ghostPrompts = t.ghostPrompts;
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
		const targetFull = ghostPrompts[promptIdx % ghostPrompts.length] || "";
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
					setPromptIdx((prev) => (prev + 1) % ghostPrompts.length);
				}
			}
		}, speed);
		return () => clearTimeout(timer);
	}, [displayText, isDeleting, promptIdx, isFocused, inputVal, ghostPrompts]);

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
			<form onSubmit={handleSubmit} className={`cosmic-prompt-form ${isFocused ? "focused" : ""}`}>
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
							<span>{t.ui.publishToCosmic}</span>
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
