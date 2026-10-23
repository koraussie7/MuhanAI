/**
 * kbizhub landing page — section shell.
 *
 * Owned by the coordinator only. Each parallel track creates its own file under
 * `src/sections/` and `src/components/`; this file is where they are wired
 * together, so no track ever edits it and the four of them cannot collide.
 *
 * See KBIZHUB_REACT_MIGRATION_4AGENTS.md for the ownership table.
 */

/**
 * Placeholder for an unmigrated section.
 *
 * Renders nothing so the page stays coherent while tracks land one by one, and
 * carries the original id so anchor links keep working during the migration.
 */
function Pending({ id }: { id: string }) {
  return <section id={id} data-migration="pending" />;
}

export function App() {
  return (
    <>
      {/* Part A */}
      <Pending id="starter" />
      {/* Part C */}
      <Pending id="mybiz" />
      {/* Part B */}
      <Pending id="pipeline" />
      <Pending id="agent-seo" />
      {/* Part C */}
      <Pending id="team-builder" />
      {/* Part B */}
      <Pending id="marketplace" />
      <Pending id="human-expert" />
      {/* Part A */}
      <Pending id="why" />
      <Pending id="comparison" />
      {/* Part C */}
      <Pending id="economy" />
      {/* Part D */}
      <Pending id="message-center" />
      <Pending id="template-studio" />
    </>
  );
}
