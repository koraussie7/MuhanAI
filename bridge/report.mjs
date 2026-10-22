// report.mjs — bridge/outbox/*.json → task_handoffs
// Tries direct INSERT; if the DB is locked/readonly from this shell,
// leaves bridge/pending/*.sql for the user to apply in their own terminal:
//   sqlite3 ~/.bitterbot/tasks.sqlite < bridge/pending/<id>.sql
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DB = join(homedir(), ".bitterbot", "tasks.sqlite");
const OUTBOX = join(ROOT, "outbox");
const DONE = join(ROOT, "outbox-done");
const PENDING = join(ROOT, "pending");
mkdirSync(OUTBOX, { recursive: true });
mkdirSync(DONE, { recursive: true });
mkdirSync(PENDING, { recursive: true });

const esc = (s) => String(s).replace(/'/g, "''");
const now = Math.floor(Date.now() / 1000);
let ok = 0, pending = 0;
for (const f of readdirSync(OUTBOX).filter((x) => x.endsWith(".json"))) {
  const r = JSON.parse(readFileSync(join(OUTBOX, f), "utf8"));
  if (!r.task_id || !r.result) {
    console.log(`skip ${f}: need task_id + result`);
    continue;
  }
  const sql = `INSERT INTO task_handoffs (task_id, intent, context, created_at) VALUES ('${esc(r.task_id)}', 'vscode-result', '${esc(r.result)}', ${now});`;
  const res = spawnSync("sqlite3", [DB, sql], { encoding: "utf8" });
  if (res.status === 0) {
    renameSync(join(OUTBOX, f), join(DONE, f));
    ok++;
  } else {
    writeFileSync(join(PENDING, `${r.task_id}.sql`), sql + "\n");
    console.log(`deferred ${f}: DB not writable here, apply with: sqlite3 ~/.bitterbot/tasks.sqlite < bridge/pending/${r.task_id}.sql`);
    pending++;
  }
}
console.log(`reported ${ok}, deferred ${pending}`);
