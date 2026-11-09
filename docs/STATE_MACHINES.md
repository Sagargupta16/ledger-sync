# State machines

Every lifecycle in Ledger Sync that has more than two states, where they live,
and which of them still carry a known contradiction. Built 2026-11-09 from a
read-only audit of the whole repo (eight lanes, about 150 findings, 130 after
merging duplicates) for 2.36.0. Rows marked **fixed 2.36.0** were changed and
tested in that release; rows marked **gap** are known and not yet changed, with
the reason. Line numbers drift, so rows name files and functions.

## Conventions

These are the rules new code follows. They exist because the contradictions in
the inventory below all came from the same few shapes: two booleans that can
disagree, a nullable that doubles as a state, a flag that one reader checks and
another ignores.

1. **Name the states.** A lifecycle with more than one flag gets one type:
   a TypeScript discriminated union (`{ kind: 'idle' } | { kind: 'pending' } | ...`)
   or a Python `StrEnum`. Exactly one function derives or advances it; readers
   switch on the kind and never re-combine the raw flags.
2. **Derive before you store.** When the state follows from data, compute it
   (bank alert status, balance check status, rollup freshness). Store a state
   only when nothing else can tell you it (a user's pause, a review decision),
   and then store its cause too.
3. **Query-backed views use `pageStatus`** (`frontend/src/lib/queryStatus.ts`).
   A read that fails while it still holds data keeps that data on screen with
   `RefreshFailedNotice`; only a read with nothing to show blocks the page.
   Loading, error and ready are exclusive, and Retry refetches only the reads
   that failed.
4. **Confirm actions return their promise.** `ConfirmDialog`
   (`components/ui/ConfirmDialog.tsx`) owns idle, pending and failed: pass the
   action's `mutateAsync` promise as `onConfirm` and let it reject. The dialog
   stays open with the reason; never fire and forget, never swallow.
5. **One failure, one message.** The global mutation toast
   (`lib/queryClient.ts`) is the fallback. A caller that reports the failure
   itself (per-call `onError` toast, inline text, a dialog) calls
   `markErrorReported(error)` so the user sees it once.
6. **Offline fails, it does not pause.** Queries and mutations both run with
   `networkMode: 'always'`, so an offline action ends in an error state
   instead of a spinner that never stops.
7. **A period page commits only good data.** `useStablePeriodData` never
   commits a read that failed without data; a retry shows the last good
   period while it settles, not zeros.
8. **Register it here.** A new machine gets a row in the right table below in
   the same PR, with its owner and any known gap.

## Backend

### Imports and analytics publication

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| Analytics publication | missing, rebuild pending, dirty days, clock stale, current (derived from version pairs) | `core/analytics/refresh.py` (`mark_ledger_changed`, `mark_preferences_changed`, `publish_refresh`, `analytics_is_current`) | derived; gap: not exposed to clients, and a preference or budget edit leaves it pending until a client calls refresh |
| Rollup freshness (`rollups_stale`) | fresh, stale | `api/analytics_v2_impl/summaries_health.py` `_rollup_freshness` | **fixed 2.36.0**: compares the newest change-bearing import with the later of the newest monthly stamp and `AnalyticsState.published_at`. A refresh that only removed the trailing month used to read stale after it had succeeded |
| Spreadsheet import record (`ImportLog`) | no log, changed, no-op (from counters) | `core/sync_engine.py` `_record_import` | gap: "already imported" matches any past hash, so re-uploading an older file after another one replaced the ledger needs `force` |
| Money Manager backup outcome | preview, unchanged, imported; analytics ready, failed, skipped; planning saved or failed | `services/money_manager_import.py` | explicit (response literals); gap: `unchanged` uses the same any-past-hash key |
| Transaction liveness | live, manual, soft-deleted | `core/reconciler.py` `_mark_soft_deletes`, `api/transactions_impl/writes.py` | gap: a manual entry identical to a soft-deleted row gets 409 "already exists" for a row the user cannot see; a fix needs resurrection because the source index is not partial |
| Automation token (`lsu_`) | active, expired, revoked (derived in the query) | `services/upload_tokens.py` | gap: the list shows active tokens only, so an expired Shortcut token just disappears; the per-scope limit is counted without a lock |
| Linked planning rows (`ExternalRef`) | unlinked, synced, edited, dangling, dropped | `services/external_ref_sync.py` | gap: a row retired by import and one paused by the user share `is_active=False` |
| CAS holdings and NAV freshness | none, RTA only, depository only, both; NAV fresh, stale, unlisted | `core/mf_store.py`, `core/mf_snapshot.py`, `core/amfi_nav.py` | derived; the AMFI backoff is per process |
| Bank alert status | matched, missing, ignored | `core/bank_alert_inbox.py` `_status` | derived on read, explicit literal |
| Category review decision | unreviewed (no row), keep, change | `core/category_override_reviews.py` | explicit (CHECK); gap: no endpoint lists past decisions to undo |
| Per-user write serialization | locked, free | `core/analytics/refresh.py` `lock_analytics_user` | convention: every analytics input writer must take it and mark changes |

### Planning domain

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| Financial goal | active, completed (paused and cancelled exist in `GoalStatus` but no path reaches them) | `services/goal_service.py` `refresh_goal_progress` | explicit enum; gap: `on_track` is never written; pause and cancel need a product decision |
| Anomaly review | open, acknowledged, dismissed, auto-dismissed (a note prefix) | `api/analytics_v2_impl/networth_misc.py` review route, `core/analytics/anomaly_store.py` | gap: consumers read different flag subsets, open rows get new ids on every refresh, and there is no un-review |
| Recurring transaction | detected, confirmed, paused, paused by account closure, dismissed (tombstone), manual | `api/analytics_v2_impl/recurring.py`, `core/analytics/recurring.py`, `api/account_classifications.py` | gap: reopening an account re-enables commitments the user had paused; recording the pause cause needs a migration (held since 2.35.0) |
| Scheduled transaction (imported repeat rule) | active, ended, retired, detached | `services/external_ref_sync.py`, `core/safe_to_spend_flows.py` | derived |
| Budget | active, paused; derived ok, near, over | `services/budget_service.py`, `core/analytics/budget_tracking.py` | gap: an import-retired budget looks paused; three counter columns are never written |
| Phone alert delivery | per alert key new, told, forgotten | `core/push_delivery.py`, `core/push_alerts.py` | derived from the told-keys set |
| Account closure | open, closed | `services/account_settings.py` `set_account_closed` | explicit flag plus date |
| Balance check status | matched, mismatch, changed, unchecked, idle | `core/balance_checks.py` `account_status` | derived, explicit precedence |
| RSU FX source | ecb, sbi_ttbr, employer | `db/_models/rsu_tax.py` | explicit (CHECK per source) |
| Investment holding `is_active`, categorization rule `is_active` | on, off | `core/analytics/net_worth.py`, `api/categorization_rules.py` | plain flags, not machines |

### Auth, users and AI

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| User account | legacy unlinked, linked, disabled, half-bound (manual edit only) | `services/auth_service.py` | gap: a disabled user gets 401 on token routes and 403 elsewhere; `is_active` is never written by code |
| Session revocation | current, revoked (`token_version` against the `tv` claim) | `services/auth_service.py`, `services/auth_refresh.py`, `api/deps.py` | gap: a refresh racing a logout can return a pair that fails on first use; logout does not revoke `lsu_` tokens |
| Refresh-token rotation | issued, consumed; outcomes rotated, reissued within 60 s, replay revoked | `services/auth_refresh.py` | explicit strings in `audit_logs` |
| OAuth sign-in attempt | pending, consumed, expired (signed) | `api/oauth_state.py` | explicit |
| AI configuration | app funded, personal ready, personal without provider, key unreadable, no row | `api/preferences_ai.py`, `services/ai_settings.py` | gap: removing the key leaves personal mode with no provider, and saving a model always switches to personal mode; the browser now says so (see AI availability) |
| AI usage reservation | reserved, completed, failed | `api/ai_usage.py` | explicit (CHECK); gap: a reservation whose worker died stays reserved and counts against the month |
| AI allowance | unlimited, capped, blocked per funding source | `api/ai_usage.py`, `core/admin_access.py` | derived |
| Chat tool loop | owned by the browser; the server is stateless per request | `api/ai_chat.py`, `api/ai_tools.py` | by design |
| MCP protocol era, rate limits, schema readiness, admin role, reset mode | per request or per process | `api/mcp_protocol.py`, `api/rate_limit.py`, `core/admin_access.py`, `services/auth_account_data.py` | derived; rate limits are per serverless instance |

## Frontend

### Session, shell and platform

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| Auth credentials | booting, anonymous, signed in, signed in unverified (offline start), demo | `store/authStore.ts` | **fixed 2.36.0**: a demo session is no longer written to the shared `ledger-sync-auth` entry, so it can no longer replace a real sign-in another tab stored |
| Startup verification | verifying, verified, kept after offline or 5xx, ended | `hooks/api/useAuth.ts` `useAuthInit` | ok |
| Token refresh | idle, refreshing (shared promise), rotated, rejected, rate limited | `services/api/client.ts` `refreshAccessToken`, `isRefreshRejected` | explicit rule; by design a network error during refresh ends the session |
| Session boundary | generation N (abort controller replaced on every identity change) | `lib/session.ts` | ok |
| Cross-tab auth | in sync, rotated elsewhere, other account stored | `store/authStore.ts` `adoptPersistedTokens` | gap: signing out in one tab leaves the others showing data until a request fails |
| Sign-in modal | providers loading, failed, loaded; starting; redirecting | `components/shared/AuthModal.tsx` | **fixed 2.36.0**: stays in redirecting until the page unloads (no second sign-in overwriting the PKCE attempt), and resets on a back-forward cache return |
| OAuth callback | parsing, restarting, exchanging, failed | `pages/OAuthCallbackPage.tsx` | ok |
| Demo mode | off, on, rebuilt after reload | `store/demoStore.ts`, `lib/demo/enterDemoMode.ts` | ok after the auth fix above |
| Network mode | queries and mutations run offline and fail | `lib/queryClient.ts` | **fixed 2.36.0**: mutations used the default `online` mode, so an offline save spun forever |
| Mutation error reporting | reported by caller, toasted by fallback | `lib/queryClient.ts` `markErrorReported` | **fixed 2.36.0**: per-call toasts no longer double up with the global one |
| Lazy chunk recovery | loaded, reloading once, failed screen | `main.tsx` (`vite:preloadError`), `components/shared/ChunkErrorBoundary.tsx` | fixed 2.35.1 |
| Phone alerts on this device | unsupported, install needed, prompt, blocked, subscribing, on, failed | `services/api/pushDevice.ts` (`PushSupport`), `pages/settings/sections/PushStatus.tsx` | explicit; gap: a permission change in browser settings shows after a remount |
| Overlays (drawer, palette, modals, popovers) | one boolean each | `components/layout/Sidebar`, `components/shared/*` | gap: no overlay stack, so one Escape can close several layers |
| Theme, motion | dark or light; full or reduced | `store/themeStore.ts`, `store/motionStore.ts` | explicit; gap: no cross-tab sync |
| Display currency and rate | base, loading, priced, unpriced, rates unavailable | `hooks/api/useExchangeRate.ts`, `components/layout/Sidebar/CurrencySwitcher.tsx` | **fixed 2.36.0**: a failed rate fetch now says the rates could not load instead of "no rate for this currency" |
| Preferences hydration | defaults, local, server | `store/preferencesStore.ts`, `hooks/api/usePreferences.ts` | gap: a failed preferences load keeps local values with no notice |
| Route transition | settled, navigating | `App.tsx` (`useDeferredValue`) | derived |

### Uploads, Data Health and review

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| Spreadsheet upload | idle, parsing, review, processing, conflict, failed, saved, analytics retry | `pages/upload-sync/useUploadSync.ts` (`UploadPhase`) | gap: no cancel while parsing or processing; shares its busy flag and setters with the backup flow |
| Money Manager backup upload | idle, previewing, review, processing, notice, saved | `pages/upload-sync/useMoneyManagerImport.ts` | gap: no cancel while previewing or processing |
| Post-import analytics | ready, failed, unknown, retrying | `pages/upload-sync/useUploadSync.ts` | ok |
| Import history, balance checks, bank alerts panels | loading, error, empty, list, list with refresh failed | `pages/upload-sync/components/ImportHistory.tsx`, `pages/data-health/components/BalanceChecksPanel.tsx`, `components/shared/BankAlertsPanel.tsx` | **fixed 2.36.0**: a failed refetch keeps the list (`pageStatus`) |
| Data Health page | loading, error, empty ledger, ready | `pages/data-health/DataHealthPage.tsx` | **fixed 2.36.0**: a failed refetch after Recompute keeps the page |
| Stale-figures banner | hidden, stale, check failed, dismissed for a kind | `components/layout/StaleAnalyticsAlert.tsx` | **fixed 2.36.0**: dismissal is per kind and clears when the figures are fresh again; a failed check no longer claims the figures are old |
| Recompute analytics | idle, running, failed | `pages/data-health/useDataHealth.ts` | gap: four places call the refresh endpoint without knowing about each other |
| Balance check row | view, edit, confirm delete (explicit `Mode`) | `pages/data-health/components/BalanceCheckItem.tsx` | explicit |
| Access token create and revoke | idle, creating, revealing, confirming, revoking, failed | `pages/settings/sections/UploadTokensSection.tsx` | **fixed 2.36.0**: the revoke dialog waits for the result; gap: the one-time reveal is lost if the section unmounts mid-request |
| Review queue deck, decisions, insights refresh | loading, reviewing, fetching more, done; saving, failed; clean, dirty, refreshing | `pages/review-queue/*` | gap: a failed earlier save puts its card back over the current one |

### AI chat and Canvas

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| AI availability | loading, error, demo, app, needs key, incomplete, ready | `hooks/api/useAiAvailability.ts` | **fixed 2.36.0**: one derivation for the chat widget, the header button, the weekly recap and the Canvas; loading or a failed config load is no longer treated as app-funded |
| Chat send run | idle, preparing, waiting on the model, running tools, failed, stopped | `components/chat/useChat.ts` | **fixed 2.36.0**: a second send in the same tick no longer starts a second run; a send with an incomplete personal setup says nothing was sent and why, instead of failing silently (the typed text is still cleared) |
| Pending reply | encoded as a trailing empty assistant message | `components/chat/useChat.ts` | gap: the placeholder and a real reply are told apart by position only |
| Canvas request and progress | idle, needs config, running steps, failed, stopped (`StepStatus` explicit) | `pages/ai-canvas/useAiCanvas.ts`, `useCanvasProgress.ts` | partly fixed through AI availability |
| Canvas charts | empty, up to 12 charts, kept per tab | `pages/ai-canvas/canvasStorage.ts` | gap: a storage failure is silent |
| AI settings writes and test | idle, saving, deleting, switching mode, conflict, failed; test idle, testing, success, error | `pages/settings/sections/AIAssistantSection.tsx` | gap: one error slot serves four actions; the key test has no timeout |
| Weekly recap explain | idle, pending, ready, failed | `hooks/api/useWeeklyRecap.ts` | gated by AI availability |

### Settings and forms

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| Settings draft and save | clean, dirty, saving, failed partway, resetting, applying rules | `pages/settings/useSettingsDraft.ts`, `useSettingsState.ts` | gap: no navigation guard for unsaved changes; the "send only changed fields" baseline depends on effect order |
| Destructive confirmations | closed, open, pending, failed | `components/ui/ConfirmDialog.tsx` and its callers | **fixed 2.36.0**: the dialog waits for its action, blocks dismissal while pending and stays open with the reason on failure |
| Inline row editors (budgets, goals, recurring, vest FX, watch tiles) | view, editing, saving, failed | per page | gap: each keeps its own flags; switching rows can drop a typed draft |
| Transactions query | filters, page, sort, per page | `pages/TransactionsPage.tsx`, `components/transactions/TransactionFilters.tsx` | gap: the URL is read once and never written |
| Smart search | off, status, searching, paused, indexing, stopping, removing | `hooks/api/useSemanticSearch.ts` | gap: stopping has no visible state |
| Notification bell | closed, open with loading, error, empty, items | `components/shared/NotificationCenter.tsx` | gap: one failed source among four is not shown when others return items |
| Profile modal | idle, editing name, confirming, busy | `components/shared/ProfileModal.tsx` | ok; its per-call failure toasts no longer double |

### Planning and analytics pages

| Machine | States | Owner | Status |
| --- | --- | --- | --- |
| Page data state (about 25 pages) | loading, error, empty, ready, ready with refresh failed | page hooks via `lib/queryStatus.ts` | **fixed 2.36.0**: a failed background refetch keeps the page and its toolbar; loading and error no longer depend on check order |
| Period snapshot | first load, settled, settling | `hooks/useStablePeriodData.ts` | **fixed 2.36.0**: a failed read is never committed, so a retry no longer shows "No transactions" or zeros |
| Analytics time filter | unsynced, synced to preferences, user chosen | `hooks/useAnalyticsTimeFilter.ts`, `hooks/useDashboardMetrics.ts`, `pages/year-in-review/useYearInReview.ts` | gap: three hand-kept copies with different sync rules |
| Category budget status | paused, over, alert, ok (`BudgetStatus`) | `pages/budget/categoryBudgetUtils.ts` | explicit |
| Goal deadline and projection | none, past due, due soon, scheduled; achieved, on track, slightly behind, behind, no data | `lib/finance/goalProjection.ts` | explicit |
| Monte Carlo run | idle, running, done, error (`RunStatus`) | `pages/fire-calculator/useMonteCarloRunner.ts` | explicit |
| Advance tax instalment | paid, safe harbour, short, open (`InstalmentStatus`) | `lib/tax/advanceTax.ts` | explicit |
| Tax deduction draft | loading, error, clean, dirty, saving | `pages/tax-planning/components/useDeductionDraft.ts` | gap: a draft belongs to one tax year and is replaced by typing in another |
| 50/30/20 section, anomalies list | stale previous period while loading | `pages/budget/components/BudgetRuleSection.tsx`, `pages/anomaly-review/useAnomalyReview.ts` | gap: previous figures show under the new period with no cue |
| Cash Flow drill-down | overview, drilled path | `pages/income-expense-flow/useDrillNavigation.ts` | ok; resets on period change |
| Chart intro | still, intro, live (`Phase`) | `components/charts/SankeyMarks.tsx`, `SlopeChart.tsx` | explicit |

## Gaps held for a decision

These need a migration or a product call, so they stay open on purpose:

- Record why a recurring commitment is paused (user or account closure), so reopening an account never resumes the user's own pause. Needs a column.
- Goal pause and cancel: the enum has them, the API cannot set them.
- AI configuration after removing a key: stay in personal mode (today, now shown honestly) or return to app funding (changes who pays).
- Sweep AI usage reservations whose worker died: refunds possibly billed work.
- Show expired and revoked automation tokens in Settings with their dates.
