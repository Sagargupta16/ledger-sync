# Project Memory — ledger-sync

This file is the **project knowledge index**. It lists the atlases and reference skills that hold deep project context, so a fresh Claude Code session can find what it needs in seconds.

> **Important distinction.** This file is committed and shared via git — it documents project knowledge.
> Claude Code also has an **auto-memory** mechanism that lives at `~/.claude/projects/<project>/memory/MEMORY.md` per machine. That auto-memory is private, machine-local, and Claude writes to it autonomously. It is NOT this file. See [Claude Code memory docs](https://code.claude.com/docs/en/memory) for the auto-memory mechanism.

## Reading order for a new session

1. [CLAUDE.md](CLAUDE.md) — always loaded; project rules, conventions, where things live
2. This file (MEMORY.md) — index of skills below
3. [CHANGELOG.md](CHANGELOG.md) — what shipped recently
4. Skills below — load on demand based on what task is at hand

## Atlas skills (codebase mental models)

These are `user-invocable: false` skills — they don't show in the `/` menu. They auto-load when Claude works in their `paths:` scope or when needed. They contain background knowledge, not task recipes.

| Skill | Loads when... | Holds |
|---|---|---|
| [backend-atlas](.claude/skills/backend-atlas/SKILL.md) | Editing any backend Python file | Layer map, hard rules, where-things-live cheat sheet, key non-obvious decisions |
| [frontend-atlas](.claude/skills/frontend-atlas/SKILL.md) | Editing any frontend TS/TSX file | Tree map, page convention, state-management decision matrix, design system invariants |
| [data-flow-atlas](.claude/skills/data-flow-atlas/SKILL.md) | Always available (no path scope) | End-to-end flows: upload, OAuth, AI tools, V1 vs V2 analytics, currency, tax calc |
| [domain-atlas](.claude/skills/domain-atlas/SKILL.md) | Editing tax/FY/currency/instrument code | Indian FY rules, multi-currency contract, instrument-rate sources, classification rules, frequency bands |
| [deployment-atlas](.claude/skills/deployment-atlas/SKILL.md) | Editing workflows, vercel.json, settings | Topology, env vars, CI/CD, migration deploy, OAuth caveats, when-something-breaks |
| [indian-finance-expert](.claude/skills/indian-finance-expert/SKILL.md) | Editing tax/investment/savings code | Tax regimes, sections, capital gains, savings instruments, ITR forms, advance tax, real-world rules of thumb |

## Frontend craft skills (best practices)

Also `user-invocable: false`, auto-load by `paths:`. Unlike the atlases (which map the codebase), these hold frontend *practice* — distilled from current library docs (TanStack Query v5, React 19.2, Recharts 3, Tailwind 4, WAI-ARIA APG, WCAG 2.2) and grounded in this repo's own fixed bugs.

| Skill | Loads when... | Holds |
|---|---|---|
| [query-states](.claude/skills/query-states/SKILL.md) | Editing pages/hooks/components/services | loading→error→empty→success order, undefined-data guards, EmptyState usage, mutation invalidation |
| [accessible-ui](.claude/skills/accessible-ui/SKILL.md) | Editing components/pages | ARIA names for icon controls, modal dialog semantics + focus, label association, WCAG contrast, color-as-only-signal |
| [recharts-viz](.claude/skills/recharts-viz/SKILL.md) | Editing analytics/chart components | ResponsiveContainer + ChartContainer, token colors, NaN/empty guards, tooltip formatting, a11y layer |
| [react-patterns](.claude/skills/react-patterns/SKILL.md) | Editing any frontend TS/TSX | useEffectEvent, stable list keys, stale-state/date, no-setState-in-effect, lazy/Suspense, hooks-lint v7 |
| [design-system-ui](.claude/skills/design-system-ui/SKILL.md) | Editing components/pages/CSS | design tokens (no raw hex), mobile-first + 44px touch, h-dvh, banned AI-slop patterns (side-stripes, gradient text, dark:) |
| [ui-patterns-reference](.claude/skills/ui-patterns-reference/SKILL.md) | Editing components/pages/CSS | cross-system principles from shadcn/Radix/Material/Primer/Nielsen/Refactoring UI — hierarchy, semantic-token architecture, tables, forms, 10 heuristics; the "why" behind the tactical skills |

## Task skills (recipes for recurring work)

Normal user-invocable skills — they show in `/` menu and Claude can also auto-trigger them based on phrasing. Consolidated to **6 broad workflows** rather than one skill per layer (per [Anthropic skill design guidance](https://code.claude.com/docs/en/skills): create a skill when you keep pasting the same procedure, not for every conceivable task).

| Skill | Trigger when... |
|---|---|
| [add-feature](.claude/skills/add-feature/SKILL.md) | **Full-stack feature** — endpoint + schema + service + hook + page (the most common workflow) |
| [new-ai-tool](.claude/skills/new-ai-tool/SKILL.md) | Adding a tool the AI chatbot can call (single-file workflow, stays standalone) |
| [new-migration](.claude/skills/new-migration/SKILL.md) | Touching `db/_models/` (DB schema change with empty-downgrade convention) |
| [schema-drift-check](.claude/skills/schema-drift-check/SKILL.md) | Pydantic schema changed — catches silent TS drift before PR |
| [release-changelog](.claude/skills/release-changelog/SKILL.md) | Cutting a release / version bump |
| [debug-finance](.claude/skills/debug-finance/SKILL.md) | Wrong number / missing data / unexpected analytics |

## Stable facts about the codebase (rarely change)

- **Stack:** FastAPI + SQLAlchemy 2 + Pydantic v2 + Alembic (backend); React 19 + TypeScript 5.9 + Vite 7 + Tailwind 4 + TanStack Query 5 + Zustand (frontend)
- **Deployment:** GitHub Pages + Vercel serverless (Mangum) + Neon Postgres (Singapore, free tier)
- **Auth:** OAuth-only (Google + GitHub), JWT HS256 (30min access / 7d refresh), client-side logout (no server-side revocation list)
- **AI:** 3 providers (OpenAI, Anthropic, Bedrock), 16 read-only tools, 6-round tool-loop cap, two modes (`app_bedrock` shared / `byok` user-key)
- **Domain:** India-first (FY April-March, INR base, Indian tax law), 14 supported display currencies
- **Multi-tenancy:** every query filters by `user_id` — no Row-Level Security; convention enforced by integration test
- **Migrations:** 26 in repo; all post-2026-02-03 have empty `downgrade()` by convention
- **Test count** (post-2.10.0): 170 frontend + 98 backend = 268 total

## Volatile facts (check git first if exact numbers matter)

- Latest version: see [CHANGELOG.md](CHANGELOG.md) (most recent entry header)
- Open PRs / dependabot count: `gh pr list`, `gh api /repos/{owner}/{repo}/dependabot/alerts`
- Latest pages count: `find frontend/src/pages -maxdepth 1 \( -name "*.tsx" -o -type d \) | wc -l`
- Latest router count: `ls backend/src/ledger_sync/api/*.py | grep -v __init__ | wc -l`
- Latest AI tool count: `grep -c "_register(" backend/src/ledger_sync/api/ai_tools.py`

## When a fact in this file goes stale

Update this file. The atlases each have their own "what this skill is NOT" or update guidance — same idea: when the *layout* changes (new top-level directory, new domain area, removed stack component), the atlas should change too. Stale knowledge skills are worse than missing ones because they confidently mislead.

## Things deliberately NOT in this file

- **Per-PR work-in-progress.** That belongs in PR descriptions and the project board.
- **Personal preferences for one developer.** Those go in `CLAUDE.local.md` (gitignored).
- **Auto-memory content.** Claude manages that itself in `~/.claude/projects/<project>/memory/`.
- **Detailed task recipes.** Those live in the task skills above, not duplicated here.
