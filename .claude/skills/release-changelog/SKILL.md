---
name: release-changelog
description: Use when cutting a release / version bump / preparing a CHANGELOG.md entry. Enforces this project's exact format (Fixed / Added / Changed / Tests / Skipped sections, semantic version increment, no Co-Authored-By trailers, no emojis, India FY-aware dates). Trigger when user says "new release", "version bump", "update CHANGELOG", "cut 2.X.0", or finishes a meaningful PR that should be summarized.
---

# Writing a CHANGELOG.md entry for ledger-sync

## The format is non-default

Don't use Keep-a-Changelog defaults. This project has its own structure refined over 2.0 -> 2.10. Match it exactly.

## Read the last entry first

Before writing, read the most recent 2-3 entries in [CHANGELOG.md](CHANGELOG.md) to internalize:
- Section ordering and which sections to include
- Voice (terse, technical, names files explicitly with backticks, no marketing)
- How dates are written (`2026-05-13`, ISO format always)
- How file paths are referenced (`backend/src/...`, with backticks, sometimes line numbers)

## Versioning

Semantic versioning, but the project is conservative:
- **MAJOR** (2.x → 3.0): never yet. Reserve for breaking API contract changes.
- **MINOR** (2.9 → 2.10): a meaningful body of work — a feature, a refactor pass, a UX overhaul. Most releases.
- **PATCH** (2.10.0 → 2.10.1): bugfix only, no feature work, no refactor.

Look at git log since the last tag to decide.

## Section order (fixed)

Use only the sections that have content. Skip the rest entirely — don't write empty sections.

```
## X.Y.Z - YYYY-MM-DD

<1-3 sentence release summary, plain English, why this release exists>

### Removed       (if anything was deleted — pages, endpoints, dependencies)
### Fixed         (bugs that affected user-visible behavior or correctness)
### Added         (new features, new pages, new endpoints, new tools)
### Changed       (refactors, behavior changes that aren't strictly bugs or features)
### Tests         (test count delta, "Frontend test count A -> B")
### Skipped       (only if you're flagging items deliberately punted to a follow-up)
```

The last release that follows this format perfectly is **2.10.0**. Use it as the template.

## Bullet style

- Lead with **bold subject**, then sentence-fragment description. Examples from past entries:
  - `**Convenience spending bug: \`calculate_convenience_spending()\` was returning 0 for every user.** Lowercase-token list ...`
  - `**EPF/PPF/NPS rates via new \`GET /api/rates/instruments\` endpoint** backed by ...`
- Cite files with backticks: `` `core/insights.py` ``, `` `frontend/src/lib/tax-config/index.ts` ``
- Cite line ranges only when they're load-bearing
- For bug fixes, say what was wrong **and** what was hidden by the bug. The 2.10.0 entry is exemplary: it explained that "Significant Convenience Spending insight has never fired in production" — that context turns a one-line fix into a meaningful entry
- Use `--` for em-dash equivalent. Never the actual em-dash (per workspace style)
- No emojis. Anywhere. Ever.

## Style invariants (from CLAUDE.md and global preferences)

- No `Co-Authored-By` trailers in commits — this is a project rule, irrelevant for the CHANGELOG itself but related
- No emojis
- Dates absolute (`2026-05-13`), never relative
- Direct, terse, no marketing language. "Wrote a great new feature!" → "Added X, which does Y."

## Steps

1. **Diff since last release:**
   ```bash
   git log --oneline $(git describe --tags --abbrev=0)..HEAD
   ```
   Or if tags aren't used, find the last `## X.Y.Z` header in CHANGELOG and diff from that commit.

2. **Bucket each commit** into Removed / Fixed / Added / Changed. A single commit can split across buckets if it touches multiple things.

3. **Write the summary** (1-3 sentences). Answer: why does this release exist? What problem does it solve, what theme does it have?

4. **Write each bullet** with the **bold subject** lead pattern, citing files in backticks.

5. **Compute test deltas:**
   ```bash
   # Frontend
   pnpm --dir frontend test 2>&1 | grep "Tests"
   # Backend
   cd backend && ./.venv/Scripts/python.exe -m pytest tests/ -q 2>&1 | tail -3
   ```
   Report as `Frontend test count A -> B (+N).` Mention what tests are new.

6. **List skipped items** explicitly if there are documented "deliberately not in this release" decisions. The 2.10.0 entry's `### Skipped` section is the model — names the item, says why (usually "needs a DB migration" or "changes equality semantics, design discussion needed").

7. **Bump version in:**
   - `CHANGELOG.md` (the new heading)
   - `frontend/package.json` `version` field
   - `backend/pyproject.toml` `version` field
   - `README.md` version badge (URL-encoded)
   - Insert above all prior entries (newest at top)

8. **Tag after merge:**
   ```bash
   git tag -a vX.Y.Z -m "X.Y.Z"
   git push origin vX.Y.Z
   ```
   Don't tag pre-merge — if the PR rebases, the tag points at a dead commit.

## What NOT to write

- "Fixed bugs" — name them
- "Improved performance" — by how much, where, why
- "Updated dependencies" — only call out if a dep update changed runtime behavior; routine bumps go in Renovate PRs and don't deserve a CHANGELOG line
- "Refactored code" — say what code, what shape, why now
- "Better UX" — describe the change concretely

## Definition of done

- [ ] Entry placed at top of CHANGELOG.md, format matches 2.10.0 entry
- [ ] Version bumped in all 4 places (CHANGELOG, frontend/package.json, backend/pyproject.toml, README badge)
- [ ] Test count delta reported
- [ ] Skipped section if any items deliberately punted
- [ ] No emojis, no em-dashes, no Co-Authored-By, no marketing fluff
