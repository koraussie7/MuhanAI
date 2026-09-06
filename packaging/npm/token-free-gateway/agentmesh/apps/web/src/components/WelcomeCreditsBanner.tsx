import { Gift, Sparkles } from "lucide-react";

type Props = {
  amount?: number;
};

export function WelcomeCreditsBanner({ amount = 1_000_000 }: Props) {
  const formatted = new Intl.NumberFormat("en-US").format(amount);
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-white/10 to-white/5 p-5">
      <div className="flex items-start gap-4">
        <div className="rounded-xl bg-white/10 p-3">
          <Gift size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">Welcome to MuhanAI</h3>
            <Sparkles size={15} />
          </div>
          <p className="mt-1 text-sm opacity-70">
            New members receive <strong>{formatted} Muhan Credits</strong> to explore
            AI, Agent Mesh, MCP tools and the knowledge network.
          </p>
        </div>
      </div>
    </div>
  );
}
