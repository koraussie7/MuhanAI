import { PageBox } from "./PageBox.js";

/** Tasks page rendered inside <PageBox>. */
export default function TasksPage() {
	return (
		<PageBox iconKey="list-todo" title="Tasks" subtitle="할 일 및 작업 관리">
			<p style={{ color: "var(--cline-text-muted)" }}>작업 관리 페이지가 곧 제공됩니다.</p>
		</PageBox>
	);
}
