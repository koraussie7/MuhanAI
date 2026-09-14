/** McpSkillsPage — MCP 도구 목록 페이지 */

import { PageBox } from "./PageBox.js";

export default function McpSkillsPage() {
  return (
    <PageBox
      iconKey="layers"
      title="MCP 도구"
      subtitle="Model Context Protocol 도구 모음"
    >
      <p style={{ color: "var(--cline-text-muted)" }}>
        MCP 도구 페이지가 곧 제공됩니다.
      </p>
    </PageBox>
  );
}
