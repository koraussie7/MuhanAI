/**
 * ComputerUsePanel — minimal UI for the /api/computer-use/run route.
 *
 * Surfaces the open-computer-use style flow inside MuhanAI: enter a
 * goal, pick a vision provider (BYOK), fire a single agent loop on
 * the server, show the step log + final screenshot (if any).
 *
 * The server owns the e2b Desktop sandbox; the browser stays thin.
 * Honest empty states when BYOK or E2B_API_KEY are missing.
 */
import { Computer, KeyRound, Loader2, Play, RotateCcw, X } from "lucide-react";
import { useEffect, useState } from "react";

const BYOK_STORAGE_KEY = "muhanai.byok.v1";

interface ByokSettings {
	provider: "openai" | "openrouter" | "google" | "groq" | "mistral";
	model: string;
	apiKey: string;
}

type ProviderId = "openai" | "google" | "groq" | "openrouter";

const COMPUTER_USE_PROVIDERS: Array<{
	id: ProviderId;
	label: string;
	planModel: string;
	locateModel: string;
	hint: string;
}> = [
	{
		id: "openai",
		label: "OpenAI",
		planModel: "gpt-4o",
		locateModel: "gpt-4o-mini",
		hint: "GPT-4o가 스크린샷을 보고 액션을 결정",
	},
	{
		id: "google",
		label: "Google AI",
		planModel: "gemini-2.0-flash-exp",
		locateModel: "gemini-2.0-flash-exp",
		hint: "Gemini 2.0 Flash (무료 등급도 가능)",
	},
	{
		id: "groq",
		label: "Groq",
		planModel: "llama-3.2-90b-vision-preview",
		locateModel: "llama-3.2-11b-vision-preview",
		hint: "Llama 3.2 Vision (Groq 초고속 추론)",
	},
	{
		id: "openrouter",
		label: "OpenRouter",
		planModel: "anthropic/claude-3.5-sonnet",
		locateModel: "openai/gpt-4o-mini",
		hint: "Claude 3.5 Sonnet으로 데스크톱 조종",
	},
];

interface RunStep {
	index: number;
	action:
		| { type: "click"; x: number; y: number }
		| { type: "click_selector"; selector: string }
		| { type: "type"; text: string }
		| { type: "press"; key: string }
		| { type: "navigate"; url: string }
		| { type: "done"; reason: string };
	durationMs: number;
}

interface RunResult {
	finishedReason: "done" | "max-steps" | "error";
	error?: string;
	finalScreenshot?: string;
	stepCount: number;
	steps: RunStep[];
}

interface ComputerUsePanelProps {
	onClose?: () => void;
}

export function ComputerUsePanel({ onClose }: ComputerUsePanelProps) {
	const [byok, setByok] = useState<ByokSettings | null>(null);
	const [provider, setProvider] = useState<ProviderId>("openai");
	const [goal, setGoal] = useState("");
	const [maxSteps, setMaxSteps] = useState(15);
	const [running, setRunning] = useState(false);
	const [result, setResult] = useState<RunResult | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		try {
			const raw = localStorage.getItem(BYOK_STORAGE_KEY);
			if (raw) {
				const parsed = JSON.parse(raw) as ByokSettings;
				setByok(parsed);
			}
		} catch {
			// ignore
		}
	}, []);

	const hasKeyForProvider = (p: ProviderId): boolean => {
		if (!byok) return false;
		// The openai/google/groq/openrouter BYOK panel only stores one
		// provider at a time, so the key matches iff the stored provider
		// is the same as the requested one (or openrouter is a multi-model
		// gateway that fronts all of them, so its key also unlocks).
		if (byok.provider === "openrouter") return true;
		return byok.provider === p;
	};

	async function handleRun() {
		if (!goal.trim()) return;
		const def = COMPUTER_USE_PROVIDERS.find((d) => d.id === provider);
		if (!def) return;
		if (!byok || !hasKeyForProvider(provider)) {
			setError("BYOK 키가 없거나 다른 provider용입니다. 🔑 BYOK 패널에서 키를 등록하세요.");
			return;
		}
		setRunning(true);
		setError(null);
		setResult(null);
		try {
			const res = await fetch("/api/computer-use/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					goal: goal.trim(),
					provider,
					apiKey: byok.apiKey,
					planModel: def.planModel,
					locateModel: def.locateModel,
					maxSteps,
				}),
			});
			const body = (await res.json()) as
				| { error?: string }
				| RunResult;
			if (!res.ok) {
				const msg =
					(body as { error?: string }).error ??
					`computer-use route returned ${res.status}`;
				setError(msg);
			} else {
				setResult(body as RunResult);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setRunning(false);
		}
	}

	return (
		<div className="cosmic-byok-panel" data-testid="computer-use-panel">
			<div className="cosmic-byok-header">
				<Computer size={16} />
				<span>Computer Use (e2b Desktop)</span>
				{onClose && (
					<button
						type="button"
						className="cosmic-byok-close"
						onClick={onClose}
						aria-label="Close computer use panel"
					>
						<X size={14} />
					</button>
				)}
			</div>

			<div className="cosmic-byok-body">
				<div className="cosmic-byok-row">
					<label htmlFor="cu-goal">Goal (자연어로 입력)</label>
					<input
						id="cu-goal"
						type="text"
						value={goal}
						onChange={(e) => setGoal(e.target.value)}
						placeholder='예: "Gmail 열고 마지막 인보이스 찾아줘"'
						disabled={running}
					/>
				</div>

				<div className="cosmic-byok-row">
					<label htmlFor="cu-provider">Vision Provider</label>
					<select
						id="cu-provider"
						value={provider}
						onChange={(e) => setProvider(e.target.value as ProviderId)}
						disabled={running}
					>
						{COMPUTER_USE_PROVIDERS.map((p) => (
							<option key={p.id} value={p.id}>
								{p.label} — {p.hint}
							</option>
						))}
					</select>
				</div>

				<div className="cosmic-byok-row">
					<label htmlFor="cu-steps">최대 step 수</label>
					<input
						id="cu-steps"
						type="number"
						min={1}
						max={100}
						value={maxSteps}
						onChange={(e) => setMaxSteps(Number.parseInt(e.target.value, 10) || 15)}
						disabled={running}
					/>
				</div>

				{!byok && (
					<div className="cosmic-byok-warning">
						<KeyRound size={12} />
						<span>
							BYOK 키가 없습니다. 🔑 BYOK 패널에서 OpenAI / OpenRouter / Google / Groq 중
							하나를 등록하세요.
						</span>
					</div>
				)}
				{byok && !hasKeyForProvider(provider) && (
					<div className="cosmic-byok-warning">
						<KeyRound size={12} />
						<span>
							저장된 BYOK 키는 {byok.provider}용입니다. {provider}를 쓰려면 BYOK 패널에서
							{provider} 키를 새로 등록하세요. (또는 OpenRouter는 모든 모델을 라우팅)
						</span>
					</div>
				)}

				<div className="cosmic-byok-actions">
					<button
						type="button"
						className="cosmic-byok-primary"
						onClick={handleRun}
						disabled={running || !goal.trim() || !byok || !hasKeyForProvider(provider)}
					>
						{running ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
						<span>{running ? "Computer Use 실행 중..." : "Run Computer Use"}</span>
					</button>
					{result && (
						<button
							type="button"
							className="cosmic-byok-secondary"
							onClick={() => {
								setResult(null);
								setError(null);
							}}
						>
							<RotateCcw size={14} />
							<span>Reset</span>
						</button>
					)}
				</div>

				{error && (
					<div className="cosmic-byok-error">
						<strong>실패:</strong> {error}
					</div>
				)}

				{result && (
					<div className="cosmic-byok-result">
						<div className="cosmic-byok-result-header">
							<span>
								{result.finishedReason === "done"
									? "✅ 완료"
									: result.finishedReason === "max-steps"
										? "⏱ Max steps 도달"
										: "❌ 오류"}
							</span>
							<span className="cosmic-byok-result-count">
								{result.stepCount} step
							</span>
						</div>
						{result.error && (
							<div className="cosmic-byok-error">
								<strong>에러:</strong> {result.error}
							</div>
						)}
						{result.finalScreenshot && (
							<div className="cosmic-cu-screenshot">
								<img
									src={`data:image/png;base64,${result.finalScreenshot}`}
									alt="Final desktop state"
								/>
							</div>
						)}
						<ol className="cosmic-cu-step-log">
							{result.steps.map((s) => (
								<li key={s.index}>
									<code>
										#{s.index} {summarizeAction(s.action)}
									</code>
									<span className="cosmic-cu-step-duration">{s.durationMs}ms</span>
								</li>
							))}
						</ol>
					</div>
				)}
			</div>
		</div>
	);
}

function summarizeAction(
	action: RunStep["action"],
): string {
	switch (action.type) {
		case "click":
			return `click(${action.x}, ${action.y})`;
		case "click_selector":
			return `click_selector("${action.selector}")`;
		case "type":
			return `type(${JSON.stringify(action.text)})`;
		case "press":
			return `press(${action.key})`;
		case "navigate":
			return `navigate(${action.url})`;
		case "done":
			return `done — ${action.reason}`;
	}
}

export default ComputerUsePanel;
