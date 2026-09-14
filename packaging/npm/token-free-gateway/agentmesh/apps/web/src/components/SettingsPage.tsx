import { PageBox } from "./PageBox.js";

/** Settings page rendered inside <PageBox>. */
export default function SettingsPage() {
  return (
    <PageBox
      iconKey="settings"
      title="Settings"
      subtitle="보안 및 API 키 관리"
    >
      <p style={{ color: "var(--cline-text-muted)" }}>
        설정 페이지가 곧 제공됩니다.
      </p>
    </PageBox>
  );
}
