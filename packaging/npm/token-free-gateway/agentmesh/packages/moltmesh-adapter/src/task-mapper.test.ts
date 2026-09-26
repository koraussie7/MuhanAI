import { describe, expect, it } from "vitest";
import {
	inferWorkType,
	leaseIsActive,
	leaseRemainingMs,
	taskStatusToDashboard,
	taskStatusToProgress,
	taskToWorkItem,
} from "./task-mapper.ts";
import type { MoltmeshTask } from "./types.ts";

const TASK: MoltmeshTask = {
	id: "task-1",
	initiator: "did:key:zInitiator",
	assignee: "did:key:z6MkTestAgent",
	threadId: "thread-1",
	skill: "a2a:v1:cap:code-review",
	status: "TASK_STATUS_WORKING",
	inputArtifacts: [],
	outputArtifacts: [],
	createdAt: "1",
	updatedAt: "2",
	error: "",
	metadata: {},
};

describe("task status mapping", () => {
	it("maps the lifecycle onto dashboard statuses", () => {
		expect(taskStatusToDashboard("TASK_STATUS_SUBMITTED")).toBe("queued");
		expect(taskStatusToDashboard("TASK_STATUS_WORKING")).toBe("running");
		expect(taskStatusToDashboard("TASK_STATUS_COMPLETED")).toBe("done");
		expect(taskStatusToDashboard("TASK_STATUS_FAILED")).toBe("done");
		expect(taskStatusToDashboard("TASK_STATUS_CANCELLED")).toBe("done");
		expect(taskStatusToDashboard("TASK_STATUS_UNSPECIFIED")).toBe("queued");
	});

	it("gives coarse progress per state", () => {
		expect(taskStatusToProgress("TASK_STATUS_SUBMITTED")).toBe(10);
		expect(taskStatusToProgress("TASK_STATUS_WORKING")).toBe(60);
		expect(taskStatusToProgress("TASK_STATUS_COMPLETED")).toBe(100);
		expect(taskStatusToProgress("TASK_STATUS_UNSPECIFIED")).toBe(0);
	});
});

describe("task → work item", () => {
	it("uses the metadata title when present", () => {
		const view = taskToWorkItem(
			{ ...TASK, metadata: { title: "Auth 리팩터링" } },
			{ projectId: "p-1" },
		);
		expect(view.title).toBe("Auth 리팩터링");
		expect(view.projectId).toBe("p-1");
	});

	it("falls back to the capability title", () => {
		expect(taskToWorkItem(TASK).title).toBe("code review");
	});

	it("infers the dashboard work type from the skill", () => {
		expect(inferWorkType("a2a:v1:cap:code-review")).toBe("Coding");
		expect(inferWorkType("a2a:v1:cap:translation")).toBe("Translation");
		expect(inferWorkType("a2a:v1:cap:deep-research")).toBe("Research");
	});

	it("carries the raw MoltMesh detail alongside the row", () => {
		const failed: MoltmeshTask = {
			...TASK,
			status: "TASK_STATUS_FAILED",
			error: "oom",
		};
		const view = taskToWorkItem(failed);
		expect(view.status).toBe("done");
		expect(view.progress).toBe(0);
		expect(view.moltmesh.error).toBe("oom");
		expect(view.moltmesh.status).toBe("TASK_STATUS_FAILED");
	});
});

describe("task leases", () => {
	const now = 10_000;

	it("reports an active lease", () => {
		const lease = {
			taskId: "t",
			leaseToken: "tok",
			expiresAtUnixMs: "11000",
			attempt: 1,
		};
		expect(leaseIsActive(lease, now)).toBe(true);
		expect(leaseRemainingMs(lease, now)).toBe(1000);
	});

	it("reports an expired lease", () => {
		const lease = {
			taskId: "t",
			leaseToken: "tok",
			expiresAtUnixMs: "9000",
			attempt: 1,
		};
		expect(leaseIsActive(lease, now)).toBe(false);
		expect(leaseRemainingMs(lease, now)).toBe(-1000);
	});
});
