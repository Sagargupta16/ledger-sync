---
paths:
  - "backend/src/ledger_sync/api/ai_*.py"
  - "backend/src/ledger_sync/api/ai_tools_impl/**"
  - "backend/src/ledger_sync/api/mcp*.py"
  - "backend/src/ledger_sync/api/preferences_ai.py"
  - "backend/src/ledger_sync/core/admin_access.py"
  - "backend/src/ledger_sync/core/ai_pricing.py"
  - "backend/src/ledger_sync/core/embeddings.py"
  - "backend/src/ledger_sync/core/encryption.py"
  - "backend/src/ledger_sync/db/_models/ai_*.py"
  - "backend/src/ledger_sync/services/ai_*.py"
  - "backend/src/ledger_sync/services/semantic_search_*.py"
  - "backend/tests/**/test_ai_*.py"
  - "frontend/src/components/chat/**"
  - "frontend/src/pages/ai-canvas/**"
  - "frontend/src/pages/settings/sections/AIAssistantSection.tsx"
  - "frontend/src/pages/settings/sections/ai/**"
  - "frontend/src/lib/chat*.ts"
  - "frontend/src/lib/__tests__/chat*.ts"
  - "frontend/src/lib/demo/demoAi*.ts"
  - "frontend/src/services/api/ai*.ts"
---

# AI chatbot

Moved verbatim from the repo `CLAUDE.md` on 2026-10-31; repo-wide rules stay there. Paths and links below are relative to the repo root.

## Architecture

### Key Patterns

- **AI Chatbot (app_bedrock + BYOK, tool-calling)**: Two modes stored in `user_ai_settings.ai_mode`:
  - **`app_bedrock` (default)** -- when the server has Bedrock credentials configured, users share the app-funded model (Claude Haiku 5.5, `us.anthropic.claude-haiku-5-5`, set by `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL`) and region. `LEDGER_SYNC_AI_DAILY_MESSAGE_LIMIT` applies per user (default 10 model invocations/day, including tool rounds), except for the accounts whose stored, provider-verified email is in `LEDGER_SYNC_AI_UNLIMITED_EMAILS` or `LEDGER_SYNC_ADMIN_EMAILS` (JSON arrays; `has_unlimited_ai()` in `core/admin_access.py`, applied by `app_message_limit()` in `api/ai_usage.py`, which `/api/ai/usage` reports as `app_daily_messages: 0`). The server reserves usage before invoking the provider and returns 429 when the applicable budget is exhausted.
  - **`byok`** -- user configures provider, model, API key, and daily/monthly token limits. OpenAI and Anthropic use the user key directly. Bedrock requires a decryptable, nonempty, non-sentinel personal bearer key; incomplete configuration returns 400 before reservation or invocation. Shared access requires explicit `app_bedrock` mode. Browser-direct budgets are informational, while backend-proxied budgets are enforced.
  - **Key preservation**: Same-provider model/region saves omit `api_key` (or send null) and need a usable stored key; a blank/sentinel key or changed provider cannot overwrite it, and concurrent replacement returns 409. `has_key` means stored personal-key availability, not live login. App mode preserves personal configuration; removal uses DELETE.
  - **Transport**: OpenAI and Anthropic go browser-direct. Bedrock goes through `/api/ai/bedrock/chat` because it requires server-side authentication and does not support browser CORS. All providers use non-streaming JSON responses so tool calling remains one bounded request per round.
  - **Tool calling (v2.5+)**: The bot has 19 read-only tools registered in `backend/src/ledger_sync/api/ai_tools_impl/` (registry pattern; `ai_tools.py` is the thin router) -- `list_accounts`, `search_transactions`, `get_monthly_summary`, `list_categories`, `get_category_spending`, `get_net_worth`, `list_recurring`, `list_goals`, `list_recent_months`, `get_fy_summary`, `list_budgets`, `get_cash_flow`, `get_tax_summary`, `get_preferences_summary`, `list_anomalies`, the general `aggregate_transactions` (`aggregate.py`: any slice grouped by period with optional series, or ranked by a dimension, zero-filled; prefer extending it over adding another fixed summary tool), and the 2.34.0 `list_tax_years`, `get_net_worth_history` and `list_investment_holdings` (`tax_history_tools.py`, `wealth_tools.py`). The registry's Pydantic argument models define both advertised schemas and execution validation. Frontend `useChat` sends -> receives `tool_use` -> executes tools in parallel -> appends `tool_result` -> repeats until `end_turn` or the 6-round limit. Each answer's tool calls and results stay in the history it sends next time, as `internal` messages the transcript hides (`useChat` returns only visible ones); without them a follow-up "corrected" figures it could not see the source of. `useChat`'s optional `options` add browser-side `clientTools`, run locally instead of `/api/ai/tools/execute`, a `systemNote`, and `onToolStart`/`onToolEnd` events (the canvas's live step list and its "How this was made" sources, `pages/ai-canvas/canvasSteps.ts`): the AI Canvas (`pages/ai-canvas/`) adds `render_chart` (16 chart types with a `source` of ledger, calculated or estimate; columnar arguments, `labels` plus `series[].values` or sankey `links`, so a chart fits the 1024-token round; `chartSpec.ts` and `chartParse.ts` validate before drawing) and `calculate` (`calculators.ts`: SIP, lump sum, loan, inflation, goal, CAGR in code, reusing `lib/finance/sipProjection.ts`). Every tool is scoped through `CurrentUser` and has bounded arguments/results. Returned financial data enters the selected provider's conversation. `POST /mcp` serves the same registry plus `get_today` to Claude Code under a `ledger:read` token, in a transaction that cannot write.
  - **System prompt**: `chatContext.ts` supplies preferences, date, fiscal-year context, and tool guidance. Financial summaries are fetched through tools when needed.
  - **Usage accounting**: `ai_usage_log` tracks funding source, reservation state, tokens, model, estimated cost, and rounds. Bedrock checks shared caps and token budgets under a user lock, commits the reservation before calling the provider, and settles once. Zero blocks; null removes a personal cap. Pending reservations count, and usage responses expose `reserved_tokens` and `pending_call_count` separately from completed totals. Client/credential/bearer setup failures and known nonbillable provider rejections, including `ModelNotReadyException`, release reservations. Ambiguous inference failures retain them within their original UTC windows. Provider retries are disabled. Browser-direct OpenAI/Anthropic reports track personal usage but cannot enforce a vendor spending ceiling. Opt-in Smart search embeddings (Titan Text Embeddings V2) fund like the chat and reserve under provider `bedrock-embed`: token budgets, not the message cap.

### Deployment

- **App-funded Bedrock chat** requires configured server credentials: a Bedrock bearer token through `LEDGER_SYNC_BEDROCK_API_KEY`/`AWS_BEARER_TOKEN_BEDROCK`, or the supported AWS credential chain. The `LEDGER_SYNC_` bearer variant is bridged at startup. Missing server configuration returns HTTP 503; a usable personal Bedrock key follows the separate user-funded path. If app mode answers 502 after a deploy, pin `LEDGER_SYNC_AI_DEFAULT_BEDROCK_MODEL` to `us.anthropic.claude-haiku-4-5-20251001-v1:0` and redeploy.
- **AI rollout** requires the reservation migration before new workers, draining old workers before v3 ciphertext writes, and retaining previous encryption material until rewrapping completes. Database reservations serialize quotas across instances. Global per-minute limits still require external distributed SlowAPI storage.
