import { PageBox } from "./PageBox.js";

/** Projects page rendered inside <PageBox>. */
export default function ProjectsPage() {
  return (
    <PageBox
      iconKey="folder-git"
      title="Projects"
      subtitle="프로젝트 작업 공간"
    >
      <p style={{ color: "var(--cline-text-muted)" }}>
        프로젝트 페이지가 곧 제공됩니다.
      </p>
    </PageBox>
  );
}
