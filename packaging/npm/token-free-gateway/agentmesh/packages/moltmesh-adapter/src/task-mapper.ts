/**
 * Task / lease → AgentMesh view mapping.
 *
 * MoltMesh tasks are a state machine (`submitted → working → completed`), while
 * the dashboard row carries a coarse status plus a 0..100 progress bar; these
 * functions encode that translation in one place.
 */

import { capabilityTitle } from "./mapper.ts";
import type { MoltmeshTask, TaskLease, TaskStatus } from "./types.ts";

/** AgentMesh `/api/tasks` row, aligned with `feeds.ts` `TaskItem`. */
export interface WorkItemView {
	id: string;
	title: string;
	type: "Research" | "Coding" | "Verification" | "Translation" | "Data Analysis";
	status: "running" | "queued" | "done";
	assignee: string;
	reward: number;
	progress: number;
	projectId: string;
	/** MoltMesh-specific extras, kept for the task detail drawer. */
	moltmesh: {
		skill: string;
		status: TaskStatus;
		initiator: string;
		assigneeDid: string;
		threadId: string;
		error: string;
		outputArtifacts: number;
	};
}

/** MoltMesh task lifecycle → dashboard status vocabulary. */
export function taskStatusToDashboard(status: TaskStatus): "running" | "queued" | "done" {
	switch (status) {
		case "TASK_STATUS_WORKING":
			return "running";
		// Failed/cancelled tasks are terminal; the list view treats them as done and
		// the error is surfaced through `moltmesh.error`.
		case "TASK_STATUS_COMPLETED":
		case "TASK_STATUS_FAILED":
		case "TASK_STATUS_CANCELLED":
			return "done";
		default:
			return "queued";
	}
}

/** Coarse progress estimate; MoltMesh reports state, not a percentage. */
export function taskStatusToProgress(status: TaskStatus): number {
	switch (status) {
		case "TASK_STATUS_SUBMITTED":
			return 10;
		case "TASK_STATUS_WORKING":
			return 60;
		case "TASK_STATUS_COMPLETED":
			return 100;
		default:
			return 0;
	}
}

const TYPE_KEYWORDS: ReadonlyArray<readonly [string, WorkItemView["type"]]> = [
	["verif", "Verification"],
	["translat", "Translation"],
	["data", "Data Analysis"],
	["code", "Coding"],
	["dev", "Coding"],
];

export function inferWorkType(skill: string): WorkItemView["type"] {
	const lower = skill.toLowerCase();
	for (const [needle, type] of TYPE_KEYWORDS) {
		if (lower.includes(needle)) return type;
	}
	return "Research";
}

export interface TaskToWorkItemOptions {
	projectId?: string;
	reward?: number;
	title?: string;
}

/** Project a MoltMesh task into the `/api/tasks` row shape. */
export function taskToWorkItem(
	task: MoltmeshTask,
	options: TaskToWorkItemOptions = {},
): WorkItemView {
	const title =
		options.title ?? task.metadata["title"] ?? (task.skill ? capabilityTitle(task.skill) : task.id);
	return {
		id: task.id,
		title,
		type: inferWorkType(task.skill),
		status: taskStatusToDashboard(task.status),
		assignee: task.assignee,
		reward: options.reward ?? 0,
		progress: taskStatusToProgress(task.status),
		projectId: options.projectId ?? "moltmesh",
		moltmesh: {
			skill: task.skill,
			status: task.status,
			initiator: task.initiator,
			assigneeDid: task.assignee,
			threadId: task.threadId,
			error: task.error,
			outputArtifacts: task.outputArtifacts.length,
		},
	};
}

/** True while the lease holder still owns the task. */
export function leaseIsActive(lease: TaskLease, now: number = Date.now()): boolean {
	return Number(lease.expiresAtUnixMs) > now;
}

/** Milliseconds until expiry; negative once expired. */
export function leaseRemainingMs(lease: TaskLease, now: number = Date.now()): number {
	return Number(lease.expiresAtUnixMs) - now;
}
