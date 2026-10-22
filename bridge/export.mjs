// export.mjs — Bitterbot tasks → bridge/inbox/*.json (READ-ONLY: SELECT only)
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB = join(homedir(), ".bitterbot", "tasks.sqlite");
const INBOX = join(ROOT, "inbox");
mkdirSync(INBOX, { recursive: true });

const out = execFileSync(
  "sqlite3",
  ["-json", DB, "SELECT id, goal, done_criteria, source, created_at FROM tasks WHERE completed_at IS NULL AND output_ref IS NULL;"],
  { encoding: "utf8" },
);
const tasks = JSON.parse(out.trim() === "" ? "[]" : out);

let n = 0;
for (const t of tasks) {
  const f = join(INBOX, `${t.id}.json`);
  if (!existsSync(f)) {
    writeFileSync(f, JSON.stringify(t, null, 2));
    n++;
  }
}
console.log(`exported ${n} new tasks`);
