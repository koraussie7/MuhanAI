import { PageBox } from "./PageBox.js";

/** Workflows page rendered inside <PageBox>. */
export default function WorkflowsPage() {
  return (
    <PageBox
      iconKey="git-branch"
      title="Workflows"
      subtitle="자동화 워크플로우 빌더"
    >
      <p style={{ color: "var(--cline-text-muted)" }}>
        워크플로우 페이지가 곧 제공됩니다.
      </p>
    </PageBox>
  );
}
