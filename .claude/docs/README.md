# Studies & Reference Docs

Durable findings so we don't re-research the same thing. Each study is a dated
markdown file in [`studies/`](studies/). Read the relevant one before
re-investigating a topic.

| Study | What it covers |
| --- | --- |
| [studies/2026-06-27-calc-verification.md](studies/2026-06-27-calc-verification.md) | Real-data verification of every calculation domain (independent SQL oracles vs app); which are correct, which were wrong + fixed |
| [studies/2026-06-27-db-schema-optimization.md](studies/2026-06-27-db-schema-optimization.md) | DB schema/storage/index study: current layout, what's optimal, recommended changes |

## Conventions

- Date each study `YYYY-MM-DD-topic.md`.
- Lead with a TL;DR, then evidence (real numbers/queries), then recommendations.
- When a study's findings get implemented, note the commit/PR in the study.
- The user's real data lives in `backend/ledger_sync.db` (gitignored — never commit it). Use read-only SQL to verify against it.
