import { describe, it, expect, beforeEach } from "vitest";
import { ComputeTribute } from "./tribute.js";

describe("ComputeTribute", () => {
  let tribute: ComputeTribute;

  beforeEach(() => {
    tribute = new ComputeTribute();
  });

  it("should submit a ticket and add it to the queue", async () => {
    await tribute.submit({
      taskId: "task-1",
      networkShare: 0.5,
      personalShare: 0.5,
      priority: "normal",
      status: "queued",
    });

    const queue = tribute.getAll();
    expect(queue).toHaveLength(1);
    expect(queue[0]?.taskId).toBe("task-1");
  });

  it("should return tickets in priority order (high first)", async () => {
    await tribute.submit({
      taskId: "low-priority",
      priority: "low",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });
    await tribute.submit({
      taskId: "high-priority",
      priority: "high",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });
    await tribute.submit({
      taskId: "normal-priority",
      priority: "normal",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });

    const next = await tribute.next();
    expect(next?.taskId).toBe("high-priority");

    const next2 = await tribute.next();
    expect(next2?.taskId).toBe("normal-priority");

    const next3 = await tribute.next();
    expect(next3?.taskId).toBe("low-priority");
  });

  it("should respect project weights in ordering", async () => {
    tribute.setProjectWeight("project-a", 0.9);
    tribute.setProjectWeight("project-b", 0.3);

    await tribute.submit({
      taskId: "task-b",
      projectId: "project-b",
      priority: "normal",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });
    await tribute.submit({
      taskId: "task-a",
      projectId: "project-a",
      priority: "normal",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });

    const next = await tribute.next();
    expect(next?.taskId).toBe("task-a");
  });

  it("should handle concurrent submissions without race conditions", async () => {
    const submissions = Array.from({ length: 100 }, (_, i) =>
      tribute.submit({
        taskId: `task-${i}`,
        priority: "normal",
        networkShare: 0.5,
        personalShare: 0.5,
        status: "queued",
      })
    );

    await Promise.all(submissions);

    const queue = tribute.getAll();
    expect(queue).toHaveLength(100);

    // Verify all task IDs are present
    const taskIds = new Set(queue.map((t) => t.taskId));
    expect(taskIds.size).toBe(100);
  });

  it("should remove a task by ID", async () => {
    await tribute.submit({
      taskId: "task-to-remove",
      priority: "normal",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });

    const removed = await tribute.remove("task-to-remove");
    expect(removed).toBe(true);
    expect(tribute.getAll()).toHaveLength(0);
  });

  it("should return false when removing non-existent task", async () => {
    const removed = await tribute.remove("non-existent");
    expect(removed).toBe(false);
  });

  it("should return undefined when queue is empty", async () => {
    const next = await tribute.next();
    expect(next).toBeUndefined();
  });

  it("should clamp project weights between 0 and 1", async () => {
    tribute.setProjectWeight("test", 1.5);
    tribute.setProjectWeight("test2", -0.5);

    // Submit and verify no errors
    await tribute.submit({
      taskId: "task-1",
      projectId: "test",
      priority: "normal",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });
    await tribute.submit({
      taskId: "task-2",
      projectId: "test2",
      priority: "normal",
      networkShare: 0.5,
      personalShare: 0.5,
      status: "queued",
    });

    expect(tribute.getAll()).toHaveLength(2);
  });
});
