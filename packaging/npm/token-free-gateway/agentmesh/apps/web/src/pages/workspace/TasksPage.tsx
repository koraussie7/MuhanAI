import React, { useEffect, useMemo, useState } from "react";
import { load } from "../../services/api";
import { Progress, SpecPage, StatGrid } from "../../components/common/spec";

// =====================================================================
// Priority #9: Tasks
// =====================================================================
interface TaskItem {
  id: string;
  title: string;
  type: string;
  status: "running" | "queued" | "done";
  assignee: string;
  reward: number;
  progress: number;
  projectId: string;
}

const TASK_EMOJI: Record<string, string> = {
  Research: "🔍",
  Coding: "💻",
  Verification: "✅",
  Translation: "🌐",
  "Data Analysis": "📊",
};

export function TasksPage() {
  const [tasks, setTasks] = useState<TaskItem[]>([]);

  useEffect(() => {
    load<TaskItem[]>("/api/tasks").then((d) => d && setTasks(d));
  }, []);

  return (
    <SpecPage
      title="Tasks"
      subtitle="활성 태스크: Researching · Coding · Verification · Translation · Data Analysis"
    >
      <div className="spec-list">
        {tasks.map((t) => (
          <article className="spec-row" key={t.id}>
            <span className="spec-row-icon">{TASK_EMOJI[t.type] ?? "📌"}</span>
            <div className="spec-row-main">
              <h3>{t.title}</h3>
              <p>
                {t.assignee} · {t.type}
              </p>
            </div>
            <div className="spec-task-status">
              <Progress value={t.progress} />
              <span className={`task-status ${t.status}`}>
                {t.status} {t.progress}%
              </span>
            </div>
            <strong className="spec-reward">+{t.reward}</strong>
          </article>
        ))}
      </div>
    </SpecPage>
  );
}
