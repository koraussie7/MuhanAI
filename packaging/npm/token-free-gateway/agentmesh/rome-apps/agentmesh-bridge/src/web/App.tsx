import "./styles.css";
import { fetchAppApi, type RomeAppBootstrap } from "@rome-os/app-web-sdk";
import { Alert, AlertDescription, AlertTitle } from "@rome-os/ui/alert";
import { Button } from "@rome-os/ui/button";
import { Field, FieldLabel } from "@rome-os/ui/field";
import { Input } from "@rome-os/ui/input";
import {
	Measure,
	Page,
	PageActions,
	PageDescription,
	PageHeader,
	PageHeading,
	PageTitle,
	Section,
	SectionDescription,
	SectionHeader,
	SectionHeading,
	SectionTitle,
} from "@rome-os/ui/page";
import { Spinner } from "@rome-os/ui/spinner";
import { CircleAlert, RefreshCw, Route, Send } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

/**
 * AgentMesh Bridge control surface.
 *
 * Two things the bridge exposes are reachable from here, mirroring the app's
 * own API routes in `src/api/index.ts`:
 *   - `GET /status`  → gateway reachability (via the agentmesh `/health` probe)
 *   - `POST /route`  → run a question through the mesh and show the receipt
 *
 * Both routes reject non-guardian callers (403) in the API handler, so this
 * page only works for the guardian session that opened it.
 */

interface GatewayStatus {
	appId: string;
	gatewayOnline: boolean;
	error?: string;
}

interface RouteReceipt {
	category?: { domain?: string; riskLevel?: string; confidence?: number };
	cast?: { finalAnswer?: string; consensusScore?: number };
	credits?: { spent?: number; balanceAfter?: string; enforced?: boolean };
}

export default function App({ bootstrap: _bootstrap }: { bootstrap: RomeAppBootstrap }) {
	const [status, setStatus] = useState<GatewayStatus | null>(null);
	const [statusError, setStatusError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);

	const [userId, setUserId] = useState("");
	const [question, setQuestion] = useState("");
	const [routing, setRouting] = useState(false);
	const [receipt, setReceipt] = useState<RouteReceipt | null>(null);
	const [routeError, setRouteError] = useState<string | null>(null);

	const loadStatus = useCallback(async (): Promise<void> => {
		setRefreshing(true);
		setStatusError(null);
		try {
			const response = await fetchAppApi("status");
			const data = (await response.json()) as GatewayStatus & { error?: string };
			if (!response.ok) {
				// A 502 here is the gateway being unreachable — a real, expected
				// outcome rather than a bug, so surface it plainly.
				setStatus(data);
				setStatusError(data.error ?? `Gateway probe failed (${response.status})`);
				return;
			}
			setStatus(data);
		} catch (err: unknown) {
			setStatusError(err instanceof Error ? err.message : String(err));
		} finally {
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		void loadStatus();
	}, [loadStatus]);

	async function submitRoute(): Promise<void> {
		setRouting(true);
		setRouteError(null);
		setReceipt(null);
		try {
			const response = await fetchAppApi("route", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ userId, question }),
			});
			const data = (await response.json()) as RouteReceipt & { error?: string };
			if (!response.ok) {
				// 402 insufficient_credits is a normal business result: no credits
				// were charged and the caller simply needs a top-up.
				const hint =
					data.error === "insufficient_credits"
						? "Insufficient credits for this route — top up the wallet and retry."
						: (data.error ?? `Request failed (${response.status})`);
				setRouteError(hint);
				return;
			}
			setReceipt(data);
		} catch (err: unknown) {
			setRouteError(err instanceof Error ? err.message : String(err));
		} finally {
			setRouting(false);
		}
	}

	const canSubmit = userId.trim().length > 0 && question.trim().length > 0 && !routing;

	return (
		<Page className="min-h-full bg-[var(--app-canvas)]">
			<PageHeader>
				<PageHeading>
					<PageTitle>AgentMesh Bridge</PageTitle>
					<PageDescription>
						Route questions through the agentmesh multi-agent gateway from inside Rome.
					</PageDescription>
				</PageHeading>
				<PageActions>
					<Button onClick={() => void loadStatus()} disabled={refreshing}>
						{refreshing ? <Spinner size="sm" label="Refreshing status" /> : <RefreshCw />}
						{refreshing ? "Refreshing…" : "Refresh"}
					</Button>
				</PageActions>
			</PageHeader>

			<Measure className="flex flex-col gap-6">
				<Section>
					<SectionHeader>
						<SectionHeading>
							<SectionTitle>Gateway</SectionTitle>
							<SectionDescription>
								Read from the agentmesh <code>/health</code> probe via <code>GET /status</code>.
							</SectionDescription>
						</SectionHeading>
					</SectionHeader>
					{statusError ? (
						<Alert variant="destructive">
							<CircleAlert />
							<AlertTitle>Gateway unreachable</AlertTitle>
							<AlertDescription>{statusError}</AlertDescription>
						</Alert>
					) : status ? (
						<div className="rounded-12 border border-border bg-surface p-4 text-ui">
							<div>
								<strong>App:</strong> {status.appId}
							</div>
							<div>
								<strong>Gateway:</strong> {status.gatewayOnline ? "online" : "offline"}
							</div>
						</div>
					) : (
						<div className="flex min-h-24 items-center justify-center gap-2 rounded-12 border border-border bg-surface text-muted-foreground">
							<Spinner size="sm" label="Loading status" />
							Loading status…
						</div>
					)}
				</Section>

				<Section>
					<SectionHeader>
						<SectionHeading>
							<SectionTitle>Route a question</SectionTitle>
							<SectionDescription>
								Calls <code>agentmesh-bridge:route</code>. Consumes credits from the given user
								wallet.
							</SectionDescription>
						</SectionHeading>
					</SectionHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2">
							<Field>
								<FieldLabel htmlFor="userId">AgentMesh user id</FieldLabel>
								<Input
									id="userId"
									value={userId}
									onChange={(e) => setUserId(e.target.value)}
									placeholder="u1"
								/>
							</Field>
						</div>
						<div className="flex flex-col gap-2">
							<Field>
								<FieldLabel htmlFor="question">Question</FieldLabel>
								<Input
									id="question"
									value={question}
									onChange={(e) => setQuestion(e.target.value)}
									placeholder="ping"
								/>
							</Field>
						</div>
						<div>
							<Button onClick={() => void submitRoute()} disabled={!canSubmit}>
								{routing ? <Spinner size="sm" label="Routing" /> : <Send />}
								{routing ? "Routing…" : "Route"}
							</Button>
						</div>
					</div>

					{routeError ? (
						<Alert variant="destructive" className="mt-4">
							<CircleAlert />
							<AlertTitle>Route failed</AlertTitle>
							<AlertDescription>{routeError}</AlertDescription>
						</Alert>
					) : null}

					{receipt ? (
						<div className="mt-4 flex flex-col gap-3 rounded-12 border border-border bg-surface p-4 text-ui">
							<div className="flex items-center gap-2 font-semibold">
								<Route />
								Result
							</div>
							{receipt.category ? (
								<div>
									<strong>Category:</strong> {receipt.category.domain ?? "—"} (
									{receipt.category.riskLevel ?? "—"} risk)
								</div>
							) : null}
							{receipt.credits ? (
								<div>
									<strong>Credits:</strong> spent {receipt.credits.spent ?? "—"}, balance{" "}
									{receipt.credits.balanceAfter ?? "—"}
								</div>
							) : null}
							{receipt.cast?.finalAnswer ? (
								<pre className="whitespace-pre-wrap break-words rounded-8 bg-[var(--app-canvas)] p-3 text-sm">
									{receipt.cast.finalAnswer}
								</pre>
							) : null}
						</div>
					) : null}
				</Section>
			</Measure>
		</Page>
	);
}
