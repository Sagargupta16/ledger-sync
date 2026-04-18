# AI Finance Chatbot -- Design Spec

**Date:** 2026-04-18
**Issue:** #90
**Status:** Approved

## Goal

Add a floating AI chatbot widget to the Ledger Sync dashboard that lets users ask natural-language questions about their personal financial data. Users bring their own API key (BYOK) -- OpenAI, Anthropic, or AWS Bedrock. The chatbot has full read access to the user's financial context.

## Architecture: Frontend-Direct LLM Calls

The frontend collects financial data from existing V2/calculations endpoints, builds a system prompt, and calls the user's chosen LLM provider directly from the browser. The backend only stores the encrypted API key -- no LLM calls happen server-side.

**Why:**
- Zero backend LLM cost or dependencies
- Lower latency (browser streams directly from provider)
- Simpler -- no proxy endpoint, no provider SDK on backend
- User's key never touches our server at runtime (decrypted key sent to frontend, used in-browser)

### Data Flow

```
User types question
  -> Frontend fetches financial summary from existing API endpoints
  -> Builds system prompt with financial context (~2-4K tokens)
  -> Calls LLM provider REST API from browser (user's decrypted key)
  -> Streams response token-by-token into chat panel
```

## Components

### 1. Backend: Encrypted Key Storage

**New `user_preferences` columns:**
- `ai_provider` -- enum string: `"openai"`, `"anthropic"`, `"bedrock"` (default: `null`)
- `ai_model` -- string: model ID like `"gpt-4o"`, `"claude-sonnet-4-5-20250514"`, `"us.anthropic.claude-sonnet-4-5-v2"` (default: `null`)
- `ai_api_key_encrypted` -- text: AES-256-GCM encrypted blob (default: `null`)

**Encryption:**
- AES-256-GCM using a key derived from `LEDGER_SYNC_JWT_SECRET_KEY` via PBKDF2 (SHA-256, 100k iterations, static salt per-app)
- Format stored: `base64(nonce + ciphertext + tag)`
- Encrypt on write (`PUT /api/preferences/ai-config`), decrypt on read (`GET /api/preferences/ai-config/key`)
- The decrypt endpoint returns the raw key only to the authenticated user, over HTTPS

**New endpoints:**
- `PUT /api/preferences/ai-config` -- accepts `{ provider, model, api_key }`, encrypts key, stores all three
- `GET /api/preferences/ai-config` -- returns `{ provider, model, has_key: bool }` (never returns the key itself)
- `GET /api/preferences/ai-config/key` -- returns `{ api_key }` (decrypted, for frontend LLM calls only)
- `DELETE /api/preferences/ai-config` -- clears provider, model, and encrypted key

### 2. Frontend: AI Settings Section

New section in the Settings page: "AI Assistant"

**Fields:**
- Provider dropdown: OpenAI | Anthropic | AWS Bedrock
- Model dropdown: populated based on provider selection (hardcoded list of popular models)
- API Key input: password field, shows masked value if key exists, "Update" to change
- "Test Connection" button: sends a tiny prompt to verify the key works
- "Remove Key" button: calls DELETE endpoint

**Models per provider (hardcoded, updatable):**
- OpenAI: `gpt-4o`, `gpt-4o-mini`, `gpt-4.1`, `gpt-4.1-mini`, `gpt-4.1-nano`
- Anthropic: `claude-sonnet-4-5-20250514`, `claude-haiku-4-5-20251001`
- Bedrock: `us.anthropic.claude-sonnet-4-5-v2`, `us.anthropic.claude-haiku-4-5-v2`

### 3. Frontend: Floating Chat Widget

**Placement:** Fixed, bottom-right corner (`right-6 bottom-6 z-40`)

**Collapsed state:** Circular button (48px) with sparkle/message icon, subtle pulse animation when AI is configured, disabled/greyed when no key configured

**Expanded state:** Glass-morphism panel (~380px wide, ~500px tall max), anchored bottom-right:
- Header bar: "AI Assistant" title + minimize button + clear chat button
- Message list: scrollable, auto-scroll on new messages
- User messages: right-aligned, blue-ish bubble
- AI messages: left-aligned, dark bubble with markdown rendering
- Input area: text input + send button, disabled during streaming
- Streaming indicator: animated dots while response is arriving

**State management:** Local component state (messages array, isOpen, isStreaming). No Zustand store needed -- chat is ephemeral per session.

**Keyboard:** Escape closes the panel. Enter sends message (Shift+Enter for newline).

### 4. Frontend: Financial Context Builder

A pure function that fetches data from existing endpoints and compresses it into a system prompt.

**Data sources (all existing V2/calculations endpoints):**
- `GET /api/analytics/v2/monthly-summaries` -- last 6 months of income/expense/savings
- `GET /api/calculations/category-breakdown` -- top categories
- `GET /api/calculations/totals` -- overall totals
- `GET /api/analytics/v2/recurring` -- subscriptions/bills
- `GET /api/analytics/v2/net-worth` -- latest net worth snapshot
- `GET /api/preferences` -- user's fiscal year, currency, spending rules, goals

**System prompt structure:**
```
You are a personal finance assistant for {user_name}.
Currency: {currency_symbol} ({display_currency}).
Fiscal year starts: {month}.

## Financial Summary (Last 6 Months)
| Month | Income | Expenses | Savings Rate |
...

## Top Spending Categories (Current Month)
1. {category}: {amount} ({pct}%)
...

## Active Budgets
- {category}: {spent}/{limit} ({pct}% used)
...

## Recurring Bills
- {name}: {amount}/{frequency}
...

## Net Worth
Total: {net_worth} (Assets: {assets}, Liabilities: {liabilities})

## Goals
- {name}: {current}/{target} ({pct}%, ETA: {date})
...

Answer questions about the user's finances based on this data.
Be specific with numbers. Use the correct currency.
If you don't have enough data to answer, say so.
Keep responses concise -- 2-3 sentences for simple questions, more detail only when asked.
```

**Token budget:** ~2-4K tokens for context. Fetched once when chat opens, refreshed if chat has been open > 5 minutes.

### 5. Frontend: Provider Adapters

Thin wrappers that call each provider's REST API directly from the browser using `fetch()` with streaming.

**OpenAI adapter:**
- Endpoint: `https://api.openai.com/v1/chat/completions`
- Headers: `Authorization: Bearer {key}`
- Body: `{ model, messages, stream: true }`
- Parse: SSE stream, extract `choices[0].delta.content`

**Anthropic adapter:**
- Endpoint: `https://api.anthropic.com/v1/messages`
- Headers: `x-api-key: {key}`, `anthropic-version: 2023-06-01`, `anthropic-dangerous-direct-browser-access: true`
- Body: `{ model, messages, system, stream: true, max_tokens: 1024 }`
- Parse: SSE stream, extract `content_block_delta.delta.text`

**Bedrock adapter:**
- Endpoint: `https://bedrock-runtime.{region}.amazonaws.com/model/{model}/converse-stream`
- Headers: `Authorization: Bearer {token}` (session token)
- Body: `{ messages, system, inferenceConfig: { maxTokens: 1024 } }`
- Parse: event stream, extract `contentBlockDelta.delta.text`
- Note: Bedrock requires region config (default: `us-east-1`, configurable in settings)

**Shared interface:**
```typescript
interface ChatAdapter {
  stream(params: {
    model: string
    systemPrompt: string
    messages: ChatMessage[]
    apiKey: string
    onToken: (token: string) => void
    onDone: () => void
    onError: (error: string) => void
    signal: AbortSignal
  }): void
}
```

**Error handling:**
- 401/403: "Invalid API key. Check your key in Settings."
- 429: "Rate limited by {provider}. Wait a moment and try again."
- Network error: "Could not reach {provider}. Check your connection."
- CORS error (Bedrock): Bedrock may not support direct browser calls -- fall back to note in UI saying "Bedrock requires a proxy. Use OpenAI or Anthropic for direct browser access." (Investigate at implementation time; if CORS blocks it, we defer Bedrock to a future backend proxy.)

### 6. Demo Mode

In demo mode (no auth), the chat widget shows but clicking it displays: "Sign in and configure your AI key in Settings to use the assistant."

## File Plan

### Backend (3 new/modified files)
- `backend/src/ledger_sync/core/encryption.py` -- AES-256-GCM encrypt/decrypt helpers
- `backend/src/ledger_sync/api/preferences.py` -- add 3 new endpoints (ai-config CRUD)
- `backend/src/ledger_sync/db/models.py` -- add 3 columns to `user_preferences`
- Alembic migration for the 3 new columns

### Frontend (8 new files, 2 modified)
- `frontend/src/components/chat/ChatWidget.tsx` -- floating button + expanded panel
- `frontend/src/components/chat/ChatPanel.tsx` -- message list + input
- `frontend/src/components/chat/ChatMessage.tsx` -- single message bubble with markdown
- `frontend/src/components/chat/useChat.ts` -- hook: messages state, send, stream, abort
- `frontend/src/lib/chatContext.ts` -- financial context builder (fetches + formats system prompt)
- `frontend/src/lib/chatAdapters.ts` -- provider adapters (OpenAI, Anthropic, Bedrock)
- `frontend/src/services/api/aiConfig.ts` -- API service for ai-config endpoints
- `frontend/src/pages/settings/AIAssistantSection.tsx` -- settings UI
- `frontend/src/components/layout/AppLayout.tsx` -- add `<ChatWidget />`
- `frontend/src/pages/settings/SettingsPage.tsx` -- add AI section

## Testing

- **Backend:** Unit tests for encryption round-trip, ai-config endpoints (store/retrieve/delete)
- **Frontend:** Unit tests for `chatContext.ts` (prompt builder) and `chatAdapters.ts` (request formatting)
- Manual E2E: configure key in settings, open chat, ask "How much did I spend last month?", verify streaming response

## Out of Scope (Future)

- Chat history persistence (currently ephemeral per session)
- Proactive tips/reminders
- Chat export
- RAG with full transaction history (current approach uses summary data in system prompt)
- Backend proxy for providers that block browser CORS
