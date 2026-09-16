/**
 * Resonance governance — autonomy dial + deterministic governor.
 *
 * Ported from Helldez/Resonance's autonomy governor. Two interacting
 * surfaces:
 *
 *   - AutonomyDial: the user's stated intent (off / suggest / autopilot).
 *     Per-action overrides let the user say "execute is autopilot, read
 *     is off".
 *   - Governor: the deterministic enforcer. Always-on in suggest mode
 *     (every action requires confirmation), permissive in autopilot,
 *     locked-down in off.
 *
 * The governor adds three independent controls on top of the dial:
 *   - dailyActionCap — hard ceiling on actions per UTC day
 *   - dedupWindowMs  — collapses identical (action, subject) pairs
 *   - killSwitch     — global and per-action deny flags
 */

import { randomUUID } from "node:crypto";
import type {
	AutonomyAction,
	AutonomyDial,
	AutonomyLevel,
	GovernorAction,
	GovernorCheckRequest,
	GovernorCheckResponse,
	GovernorConfig,
	GovernorState,
} from "./types.js";

const MAX_RECENT = 1024;

function utcDay(now: Date = new Date()): string {
	return now.toISOString().slice(0, 10);
}

export const DEFAULT_DIAL: AutonomyDial = {
	level: "suggest",
	updatedAt: new Date(0).toISOString(),
	updatedBy: "system",
};

export const DEFAULT_CONFIG: GovernorConfig = {
	dailyActionCap: 1000,
	dedupWindowMs: 60_000,
	killSwitch: false,
	killSwitchPerAction: {},
	currentDay: utcDay(),
};

export class ResonanceGovernor {
	private dial: AutonomyDial;
	private config: GovernorConfig;
	private recentActions: GovernorAction[] = [];
	private dailyCount = 0;

	constructor(dial: AutonomyDial = DEFAULT_DIAL, config: GovernorConfig = DEFAULT_CONFIG) {
		this.dial = dial;
		this.config = { ...config, currentDay: config.currentDay || utcDay() };
	}

	getDial(): AutonomyDial {
		return { ...this.dial };
	}

	getState(): GovernorState {
		this.rolloverIfNeeded();
		return {
			config: { ...this.config },
			recentActions: this.recentActions.slice(-MAX_RECENT),
			dailyCount: this.dailyCount,
		};
	}

	setDial(
		next: AutonomyLevel | { level: AutonomyLevel; perAction?: Partial<Record<AutonomyAction, AutonomyLevel>> },
		updatedBy: string,
	): AutonomyDial {
		const nextLevel: AutonomyLevel = typeof next === "string" ? next : next.level;
		const perAction = typeof next === "object" ? next.perAction : undefined;
		this.dial = {
			level: nextLevel,
			perAction: perAction ?? this.dial.perAction,
			updatedAt: new Date().toISOString(),
			updatedBy,
		};
		return this.getDial();
	}

	updateConfig(patch: Partial<Omit<GovernorConfig, "currentDay">>): GovernorConfig {
		this.rolloverIfNeeded();
		if (typeof patch.dailyActionCap === "number") {
			if (patch.dailyActionCap < 0 || !Number.isInteger(patch.dailyActionCap)) {
				throw new Error("dailyActionCap must be a non-negative integer");
			}
			this.config.dailyActionCap = patch.dailyActionCap;
		}
		if (typeof patch.dedupWindowMs === "number") {
			if (patch.dedupWindowMs < 0 || !Number.isFinite(patch.dedupWindowMs)) {
				throw new Error("dedupWindowMs must be a non-negative finite number");
			}
			this.config.dedupWindowMs = patch.dedupWindowMs;
		}
		if (typeof patch.killSwitch === "boolean") {
			this.config.killSwitch = patch.killSwitch;
		}
		if (patch.killSwitchPerAction && typeof patch.killSwitchPerAction === "object") {
			this.config.killSwitchPerAction = {
				...this.config.killSwitchPerAction,
				...patch.killSwitchPerAction,
			};
		}
		return { ...this.config };
	}

	effectiveLevel(action: AutonomyAction): AutonomyLevel {
		return this.dial.perAction?.[action] ?? this.dial.level;
	}

	check(req: GovernorCheckRequest): GovernorCheckResponse {
		this.rolloverIfNeeded();
		const action = req.action;
		const subject = req.subject;
		const now = Date.now();

		if (this.config.killSwitch) {
			return this.deny(action, subject, "global kill-switch is on");
		}
		if (this.config.killSwitchPerAction[action]) {
			return this.deny(action, subject, `kill-switch is on for action ${action}`);
		}

		const level = this.effectiveLevel(action);
		if (level === "off") {
			return this.deny(action, subject, `autonomy dial is off for action ${action}`);
		}

		if (this.config.dailyActionCap > 0 && this.dailyCount >= this.config.dailyActionCap) {
			return this.deny(action, subject, `daily action cap reached (${this.config.dailyActionCap})`);
		}

		if (this.config.dedupWindowMs > 0) {
			const cutoff = now - this.config.dedupWindowMs;
			const dup = this.recentActions.find(
				(a) => a.action === action && a.subject === subject && a.timestamp >= cutoff,
			);
			if (dup) {
				return this.deny(action, subject, `duplicate within dedup window (${this.config.dedupWindowMs}ms)`);
			}
		}

		if (level === "suggest") {
			return this.allow(action, subject, "autonomy dial is suggest — caller must confirm");
		}

		// autopilot: allow and record.
		this.recordAllowed(action, subject);
		return this.allow(action, subject, "autopilot");
	}

	/**
	 * Record a confirmed action in suggest mode. Required for the dailyCount
	 * to increment. If the caller denies, the action is NOT recorded.
	 */
	confirm(action: AutonomyAction, subject: string): GovernorAction {
		this.rolloverIfNeeded();
		this.recordAllowed(action, subject);
		return this.tail();
	}

	private allow(action: AutonomyAction, subject: string, reason: string): GovernorCheckResponse {
		return {
			allowed: true,
			reason,
			dial: this.getDial(),
			usage: {
				dailyCount: this.dailyCount,
				dailyCap: this.config.dailyActionCap,
				recentActions: this.recentActions.length,
				dedupWindowMs: this.config.dedupWindowMs,
			},
		};
	}

	private deny(action: AutonomyAction, subject: string, reason: string): GovernorCheckResponse {
		const record: GovernorAction = {
			id: randomUUID(),
			action,
			subject,
			timestamp: Date.now(),
			allowed: false,
			reason,
		};
		this.recentActions.push(record);
		if (this.recentActions.length > MAX_RECENT) {
			this.recentActions = this.recentActions.slice(-MAX_RECENT);
		}
		return {
			allowed: false,
			reason,
			dial: this.getDial(),
			usage: {
				dailyCount: this.dailyCount,
				dailyCap: this.config.dailyActionCap,
				recentActions: this.recentActions.length,
				dedupWindowMs: this.config.dedupWindowMs,
			},
		};
	}

	private recordAllowed(action: AutonomyAction, subject: string): void {
		this.dailyCount += 1;
		this.recentActions.push({
			id: randomUUID(),
			action,
			subject,
			timestamp: Date.now(),
			allowed: true,
			reason: "executed",
		});
		if (this.recentActions.length > MAX_RECENT) {
			this.recentActions = this.recentActions.slice(-MAX_RECENT);
		}
	}

	private tail(): GovernorAction {
		const r = this.recentActions[this.recentActions.length - 1];
		if (!r) throw new Error("recentActions empty after recordAllowed");
		return r;
	}

	private rolloverIfNeeded(): void {
		const today = utcDay();
		if (today !== this.config.currentDay) {
			this.config.currentDay = today;
			this.dailyCount = 0;
		}
	}
}
