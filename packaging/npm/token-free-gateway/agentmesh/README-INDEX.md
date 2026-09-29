# MuhanAI × OpsMaxx Integration — Documentation Index

> Six-language companion to the [main English README](README.md).

| Language                   | File                         |
| -------------------------- | ---------------------------- |
| English (canonical)        | [README.md](README.md)       |
| 한국어 (Korean)            | [README.ko.md](README.ko.md) |
| 中文 (Chinese, simplified) | [README.zh.md](README.zh.md) |
| 日本語 (Japanese)          | [README.ja.md](README.ja.md) |
| Español (Spanish)          | [README.es.md](README.es.md) |
| Français (French)          | [README.fr.md](README.fr.md) |
| Deutsch (German)           | [README.de.md](README.de.md) |
| Português (Portuguese)     | [README.pt.md](README.pt.md) |
| العربية (Arabic)           | [README.ar.md](README.ar.md) |

## How to add a new language

1. Copy [README.md](README.md) as `README.<iso-639-1>.md`.
2. Translate all user-facing prose. Keep the architecture diagram,
   table of capabilities, and code blocks verbatim.
3. Update this index with the new row.
4. Open a PR. Reviewers must verify:
   - The architecture diagram is unchanged.
   - Code blocks (bash, ts) are byte-for-byte identical.
   - The link structure (relative paths to other READMEs) is intact.

## Translation policy

- The English file is the source of truth. Other languages should
  follow it within one minor release.
- Translations are not auto-generated. They are reviewed by humans.
- When the English README changes, ping the translators in the PR
  thread; do not let languages drift silently.

## Related documents

- [ADR 0010 — OpsMaxx bridge](docs/adr/0010-opsmaxx-bridge.md)
- [OPSMAXX-INTEGRATION.md](docs/agentmesh/OPSMAXX-INTEGRATION.md) — threat model
- [AGENT-ASSIGNMENT-PLAN.md](docs/agentmesh/AGENT-ASSIGNMENT-PLAN.md) — who built what
- [OPSMAXX-CONTACT.md](docs/agentmesh/OPSMAXX-CONTACT.md) — email to OpsMaxx maintainers
