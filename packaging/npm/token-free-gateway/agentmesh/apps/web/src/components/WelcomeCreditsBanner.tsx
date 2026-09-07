import { Gift, Sparkles } from "lucide-react";

type Props = {
	amount?: number;
};

export function WelcomeCreditsBanner({ amount = 1_000_000 }: Props) {
	const formatted = new Intl.NumberFormat("en-US").format(amount);
	return (
		<div
			className="welcome-credits-banner relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-r from-cyan-500/10 via-violet-500/10 to-fuchsia-500/10 p-5"
			style={{
				boxShadow: "0 0 24px -8px rgba(34, 211, 238, 0.35), inset 0 1px 0 rgba(255,255,255,0.04)",
			}}
		>
			<div className="flex items-start gap-4">
				<div className="rounded-xl bg-white/10 p-3">
					<Gift size={22} className="text-cyan-300" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex items-center gap-2">
						<h3 className="font-semibold">Welcome to MuhanAI</h3>
						<Sparkles size={15} className="text-fuchsia-300" />
						<span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-200">
							Free Credits
						</span>
					</div>
					<p className="mt-1 text-sm opacity-70">
						New members receive <strong className="text-cyan-200">{formatted} Muhan Credits</strong>{" "}
						to explore AI, Agent Mesh, MCP tools and the knowledge network — no token required.
					</p>
				</div>
				<div
					className="welcome-credits-glow pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-cyan-400/20 blur-2xl"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
