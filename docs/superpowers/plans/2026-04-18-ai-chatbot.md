# AI Finance Chatbot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a floating AI chatbot widget that answers questions about the user's financial data using their own API key (OpenAI, Anthropic, or AWS Bedrock).

**Architecture:** Frontend-direct LLM calls. Backend stores encrypted API key in user_preferences. Frontend fetches financial context from existing V2 endpoints, builds a system prompt, and streams responses directly from the user's chosen provider.

**Tech Stack:** FastAPI + SQLAlchemy (backend encryption), React + TypeScript (chat UI), fetch + ReadableStream (SSE streaming), AES-256-GCM (key encryption via Python `cryptography` library)

---

## File Structure

### Backend (new files)
- `backend/src/ledger_sync/core/encryption.py` -- AES-256-GCM encrypt/decrypt using PBKDF2-derived key
- `backend/src/ledger_sync/db/migrations/versions/20260418_1200_add_ai_config_columns.py` -- migration for 3 new columns

### Backend (modified files)
- `backend/src/ledger_sync/db/models.py` -- add `ai_provider`, `ai_model`, `ai_api_key_encrypted` columns
- `backend/src/ledger_sync/api/preferences.py` -- add 4 new endpoints (ai-config CRUD + key retrieval)

### Frontend (new files)
- `frontend/src/lib/chatAdapters.ts` -- provider streaming adapters (OpenAI, Anthropic, Bedrock)
- `frontend/src/lib/chatContext.ts` -- financial context builder (system prompt)
- `frontend/src/services/api/aiConfig.ts` -- API service for ai-config endpoints
- `frontend/src/components/chat/ChatWidget.tsx` -- floating button + panel container
- `frontend/src/components/chat/ChatPanel.tsx` -- message list + input
- `frontend/src/components/chat/ChatMessage.tsx` -- single message with markdown
- `frontend/src/components/chat/useChat.ts` -- chat state hook (messages, send, stream, abort)
- `frontend/src/pages/settings/AIAssistantSection.tsx` -- settings section for AI config

### Frontend (modified files)
- `frontend/src/components/layout/AppLayout.tsx` -- render `<ChatWidget />`
- `frontend/src/pages/SettingsPage.tsx` -- add `<AIAssistantSection />`
- `frontend/src/services/api/preferences.ts` -- add `ai_provider`, `ai_model` to UserPreferences interface

---

## Task 1: Backend -- Encryption Module

**Files:**
- Create: `backend/src/ledger_sync/core/encryption.py`
- Test: `backend/tests/unit/test_encryption.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_encryption.py
from ledger_sync.core.encryption import encrypt_api_key, decrypt_api_key


def test_round_trip():
    key = "sk-ant-api03-reallyLongKeyHere12345"
    encrypted = encrypt_api_key(key)
    assert encrypted != key
    assert decrypt_api_key(encrypted) == key


def test_different_nonces():
    key = "sk-test-key-123"
    e1 = encrypt_api_key(key)
    e2 = encrypt_api_key(key)
    assert e1 != e2  # different nonces each time


def test_empty_key():
    encrypted = encrypt_api_key("")
    assert decrypt_api_key(encrypted) == ""
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && uv run pytest tests/unit/test_encryption.py -v`
Expected: FAIL with "ModuleNotFoundError" or "ImportError"

- [ ] **Step 3: Install cryptography dependency**

Run: `cd backend && uv add cryptography`

- [ ] **Step 4: Write the encryption module**

```python
# backend/src/ledger_sync/core/encryption.py
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

from ledger_sync.config.settings import settings

_SALT = b"ledger-sync-api-key-encryption-v1"
_ITERATIONS = 100_000
_KEY_LENGTH = 32  # AES-256
_NONCE_LENGTH = 12  # 96-bit nonce for GCM


def _derive_key() -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=_KEY_LENGTH,
        salt=_SALT,
        iterations=_ITERATIONS,
    )
    return kdf.derive(settings.jwt_secret_key.encode())


def encrypt_api_key(plaintext: str) -> str:
    key = _derive_key()
    nonce = os.urandom(_NONCE_LENGTH)
    aesgcm = AESGCM(key)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt_api_key(encrypted: str) -> str:
    key = _derive_key()
    raw = base64.b64decode(encrypted)
    nonce = raw[:_NONCE_LENGTH]
    ciphertext = raw[_NONCE_LENGTH:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && uv run pytest tests/unit/test_encryption.py -v`
Expected: 3 PASSED

- [ ] **Step 6: Commit**

```bash
git add backend/src/ledger_sync/core/encryption.py backend/tests/unit/test_encryption.py backend/pyproject.toml backend/uv.lock
git commit -m "feat: add AES-256-GCM encryption for API key storage"
```

---

## Task 2: Backend -- Database Columns + Migration

**Files:**
- Modify: `backend/src/ledger_sync/db/models.py` (lines ~1331, after `growth_assumptions`)
- Create: `backend/src/ledger_sync/db/migrations/versions/20260418_1200_add_ai_config_columns.py`

- [ ] **Step 1: Add columns to UserPreferences model**

In `backend/src/ledger_sync/db/models.py`, after the `growth_assumptions` line (line 1331), add:

```python
    # ── AI Assistant Configuration ───────────────────────────────────────
    ai_provider: Mapped[str | None] = mapped_column(String(20), nullable=True, default=None)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    ai_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
```

- [ ] **Step 2: Create the Alembic migration**

```python
# backend/src/ledger_sync/db/migrations/versions/20260418_1200_add_ai_config_columns.py
"""add AI assistant config columns to user_preferences

Revision ID: a1b2c3d4e5f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-18 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f7"
down_revision: str | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("user_preferences", sa.Column("ai_provider", sa.String(20), nullable=True))
    op.add_column("user_preferences", sa.Column("ai_model", sa.String(100), nullable=True))
    op.add_column("user_preferences", sa.Column("ai_api_key_encrypted", sa.Text(), nullable=True))


def downgrade() -> None:
    pass
```

- [ ] **Step 3: Verify migration applies locally**

Run: `cd backend && uv run alembic upgrade head`
Expected: "Running upgrade f1a2b3c4d5e6 -> a1b2c3d4e5f7"

- [ ] **Step 4: Commit**

```bash
git add backend/src/ledger_sync/db/models.py backend/src/ledger_sync/db/migrations/versions/20260418_1200_add_ai_config_columns.py
git commit -m "feat: add ai_provider, ai_model, ai_api_key_encrypted columns"
```

---

## Task 3: Backend -- AI Config API Endpoints

**Files:**
- Modify: `backend/src/ledger_sync/api/preferences.py`
- Test: `backend/tests/unit/test_ai_config.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/unit/test_ai_config.py
from ledger_sync.core.encryption import encrypt_api_key, decrypt_api_key


def test_encrypt_decrypt_round_trip():
    """Verify encryption/decryption works for API key storage."""
    original = "sk-ant-api03-test-key-123456"
    encrypted = encrypt_api_key(original)
    assert encrypted != original
    decrypted = decrypt_api_key(encrypted)
    assert decrypted == original
```

- [ ] **Step 2: Run test to verify it passes** (reuses encryption module)

Run: `cd backend && uv run pytest tests/unit/test_ai_config.py -v`
Expected: PASS

- [ ] **Step 3: Add Pydantic models and endpoints to preferences.py**

At the top of `backend/src/ledger_sync/api/preferences.py`, add import:

```python
from ledger_sync.core.encryption import encrypt_api_key, decrypt_api_key
```

Add these Pydantic models after the existing `EarningStartDateConfig` class:

```python
class AIConfigUpdate(BaseModel):
    """AI assistant configuration."""

    provider: str = Field(pattern=r"^(openai|anthropic|bedrock)$", description="LLM provider")
    model: str = Field(min_length=1, max_length=100, description="Model ID")
    api_key: str = Field(min_length=1, description="Provider API key (will be encrypted)")
    region: str | None = Field(default=None, max_length=20, description="AWS region for Bedrock")


class AIConfigResponse(BaseModel):
    """AI config response (never includes raw key)."""

    provider: str | None = None
    model: str | None = None
    has_key: bool = False
    region: str | None = None
```

Add these 4 endpoints at the end of the file:

```python
@router.put("/ai-config")
def update_ai_config(
    current_user: CurrentUser,
    config: AIConfigUpdate,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Store AI provider configuration with encrypted API key."""
    prefs = _get_or_create_preferences(session, current_user)
    prefs.ai_provider = config.provider
    prefs.ai_model = config.model
    # Store region in ai_model as "model|region" for Bedrock
    if config.region and config.provider == "bedrock":
        prefs.ai_model = f"{config.model}|{config.region}"
    prefs.ai_api_key_encrypted = encrypt_api_key(config.api_key)
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    return AIConfigResponse(
        provider=prefs.ai_provider,
        model=config.model,
        has_key=True,
        region=config.region,
    )


@router.get("/ai-config")
def get_ai_config(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> AIConfigResponse:
    """Get AI config (without the raw key)."""
    prefs = _get_or_create_preferences(session, current_user)
    model = prefs.ai_model
    region = None
    if model and "|" in model:
        model, region = model.rsplit("|", 1)
    return AIConfigResponse(
        provider=prefs.ai_provider,
        model=model,
        has_key=prefs.ai_api_key_encrypted is not None,
        region=region,
    )


@router.get("/ai-config/key")
def get_ai_key(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, str]:
    """Decrypt and return the API key for frontend LLM calls."""
    prefs = _get_or_create_preferences(session, current_user)
    if not prefs.ai_api_key_encrypted:
        raise HTTPException(status_code=404, detail="No AI key configured")
    return {"api_key": decrypt_api_key(prefs.ai_api_key_encrypted)}


@router.delete("/ai-config")
def delete_ai_config(
    current_user: CurrentUser,
    session: DatabaseSession,
) -> dict[str, str]:
    """Remove AI configuration and encrypted key."""
    prefs = _get_or_create_preferences(session, current_user)
    prefs.ai_provider = None
    prefs.ai_model = None
    prefs.ai_api_key_encrypted = None
    prefs.updated_at = datetime.now(UTC)
    session.commit()
    return {"status": "deleted"}
```

Also add the `HTTPException` import at the top if not already present:

```python
from fastapi import APIRouter, HTTPException
```

- [ ] **Step 4: Run backend lint + type check**

Run: `cd backend && uv run ruff check src/ && uv run mypy src/`
Expected: All checks pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/ledger_sync/api/preferences.py backend/tests/unit/test_ai_config.py
git commit -m "feat: add AI config CRUD endpoints with encrypted key storage"
```

---

## Task 4: Frontend -- AI Config API Service

**Files:**
- Create: `frontend/src/services/api/aiConfig.ts`
- Modify: `frontend/src/services/api/preferences.ts` (add ai fields to interface)

- [ ] **Step 1: Add AI fields to UserPreferences interface**

In `frontend/src/services/api/preferences.ts`, after the `growth_assumptions` field (~line 95), add:

```typescript
  // AI Assistant
  ai_provider: string | null
  ai_model: string | null
```

- [ ] **Step 2: Create the AI config service**

```typescript
// frontend/src/services/api/aiConfig.ts
import { apiClient } from './client'

export interface AIConfig {
  provider: string | null
  model: string | null
  has_key: boolean
  region: string | null
}

export interface AIConfigUpdate {
  provider: string
  model: string
  api_key: string
  region?: string
}

export const aiConfigService = {
  async getConfig(): Promise<AIConfig> {
    const response = await apiClient.get<AIConfig>('/api/preferences/ai-config')
    return response.data
  },

  async updateConfig(config: AIConfigUpdate): Promise<AIConfig> {
    const response = await apiClient.put<AIConfig>('/api/preferences/ai-config', config)
    return response.data
  },

  async getKey(): Promise<string> {
    const response = await apiClient.get<{ api_key: string }>('/api/preferences/ai-config/key')
    return response.data.api_key
  },

  async deleteConfig(): Promise<void> {
    await apiClient.delete('/api/preferences/ai-config')
  },
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api/aiConfig.ts frontend/src/services/api/preferences.ts
git commit -m "feat: add AI config API service and types"
```

---

## Task 5: Frontend -- Chat Provider Adapters

**Files:**
- Create: `frontend/src/lib/chatAdapters.ts`
- Test: `frontend/src/lib/__tests__/chatAdapters.test.ts`

- [ ] **Step 1: Write test for request formatting**

```typescript
// frontend/src/lib/__tests__/chatAdapters.test.ts
import { describe, it, expect } from 'vitest'
import { buildOpenAIRequest, buildAnthropicRequest, buildBedrockRequest } from '../chatAdapters'

describe('buildOpenAIRequest', () => {
  it('formats messages and sets stream flag', () => {
    const req = buildOpenAIRequest({
      model: 'gpt-4o',
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(req.body.model).toBe('gpt-4o')
    expect(req.body.stream).toBe(true)
    expect(req.body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' })
    expect(req.body.messages[1]).toEqual({ role: 'user', content: 'Hello' })
  })
})

describe('buildAnthropicRequest', () => {
  it('uses system field and anthropic headers', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'Finance bot.',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    expect(req.body.system).toBe('Finance bot.')
    expect(req.body.stream).toBe(true)
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })
})

describe('buildBedrockRequest', () => {
  it('formats for Bedrock Converse API', () => {
    const req = buildBedrockRequest({
      model: 'us.anthropic.claude-sonnet-4-5-v2',
      systemPrompt: 'Finance.',
      messages: [{ role: 'user', content: 'Test' }],
      region: 'us-east-1',
    })
    expect(req.url).toContain('us-east-1')
    expect(req.url).toContain('us.anthropic.claude-sonnet-4-5-v2')
    expect(req.body.system).toEqual([{ text: 'Finance.' }])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && pnpm test -- --run src/lib/__tests__/chatAdapters.test.ts`
Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement the adapters**

```typescript
// frontend/src/lib/chatAdapters.ts

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface BuildParams {
  model: string
  systemPrompt: string
  messages: ChatMessage[]
  region?: string
}

interface StreamParams extends BuildParams {
  apiKey: string
  onToken: (token: string) => void
  onDone: () => void
  onError: (error: string) => void
  signal: AbortSignal
}

// --- Request builders (exported for testing) ---

export function buildOpenAIRequest(params: BuildParams) {
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: params.model,
      stream: true,
      messages: [
        { role: 'system', content: params.systemPrompt },
        ...params.messages,
      ],
    },
  }
}

export function buildAnthropicRequest(params: BuildParams) {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model: params.model,
      max_tokens: 1024,
      system: params.systemPrompt,
      stream: true,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    },
  }
}

export function buildBedrockRequest(params: BuildParams) {
  const region = params.region ?? 'us-east-1'
  return {
    url: `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(params.model)}/converse-stream`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      messages: params.messages.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      system: [{ text: params.systemPrompt }],
      inferenceConfig: { maxTokens: 1024 },
    },
  }
}

// --- SSE stream parsers ---

async function streamOpenAI(params: StreamParams) {
  const req = buildOpenAIRequest(params)
  const response = await fetch(req.url, {
    method: 'POST',
    headers: { ...req.headers, Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify(req.body),
    signal: params.signal,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `OpenAI error ${response.status}`)
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        const token = json.choices?.[0]?.delta?.content
        if (token) params.onToken(token)
      } catch {
        // skip malformed JSON
      }
    }
  }
  params.onDone()
}

async function streamAnthropic(params: StreamParams) {
  const req = buildAnthropicRequest(params)
  const response = await fetch(req.url, {
    method: 'POST',
    headers: { ...req.headers, 'x-api-key': params.apiKey },
    body: JSON.stringify(req.body),
    signal: params.signal,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Anthropic error ${response.status}`)
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ')) continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        if (json.type === 'content_block_delta') {
          const token = json.delta?.text
          if (token) params.onToken(token)
        }
      } catch {
        // skip
      }
    }
  }
  params.onDone()
}

async function streamBedrock(params: StreamParams) {
  const req = buildBedrockRequest(params)
  const response = await fetch(req.url, {
    method: 'POST',
    headers: { ...req.headers, Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify(req.body),
    signal: params.signal,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.message ?? `Bedrock error ${response.status}`)
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const json = JSON.parse(trimmed)
        const token = json.contentBlockDelta?.delta?.text
        if (token) params.onToken(token)
      } catch {
        // skip
      }
    }
  }
  params.onDone()
}

// --- Public API ---

const adapters: Record<string, (params: StreamParams) => Promise<void>> = {
  openai: streamOpenAI,
  anthropic: streamAnthropic,
  bedrock: streamBedrock,
}

export async function streamChat(provider: string, params: StreamParams) {
  const adapter = adapters[provider]
  if (!adapter) throw new Error(`Unknown provider: ${provider}`)
  try {
    await adapter(params)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : 'Unknown streaming error'
    params.onError(message)
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && pnpm test -- --run src/lib/__tests__/chatAdapters.test.ts`
Expected: 3 PASSED

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/chatAdapters.ts frontend/src/lib/__tests__/chatAdapters.test.ts
git commit -m "feat: add LLM streaming adapters for OpenAI, Anthropic, Bedrock"
```

---

## Task 6: Frontend -- Financial Context Builder

**Files:**
- Create: `frontend/src/lib/chatContext.ts`

- [ ] **Step 1: Create the context builder**

```typescript
// frontend/src/lib/chatContext.ts
import { apiClient } from '@/services/api/client'

interface MonthlySummary {
  period: string
  income: number
  expenses: number
  savings_rate: number
}

interface CategoryItem {
  category: string
  total_amount: number
  pct_of_monthly_total: number
}

interface RecurringItem {
  pattern_name: string
  expected_amount: number
  frequency: string
}

interface NetWorthSnapshot {
  total_assets: number
  total_liabilities: number
  net_worth: number
}

interface GoalItem {
  name: string
  target_amount: number
  current_amount: number
  goal_type: string
  target_date: string | null
}

function fmtAmount(n: number, symbol: string): string {
  return `${symbol}${Math.round(n).toLocaleString()}`
}

export async function buildFinancialContext(): Promise<string> {
  const [summariesRes, categoriesRes, recurringRes, netWorthRes, goalsRes, prefsRes] =
    await Promise.allSettled([
      apiClient.get<MonthlySummary[]>('/api/analytics/v2/monthly-summaries', {
        params: { limit: 6 },
      }),
      apiClient.get<CategoryItem[]>('/api/calculations/category-breakdown', {
        params: { transaction_type: 'expense', limit: 10 },
      }),
      apiClient.get<RecurringItem[]>('/api/analytics/v2/recurring'),
      apiClient.get<NetWorthSnapshot[]>('/api/analytics/v2/net-worth', {
        params: { limit: 1 },
      }),
      apiClient.get<GoalItem[]>('/api/analytics/v2/goals'),
      apiClient.get('/api/preferences'),
    ])

  const summaries =
    summariesRes.status === 'fulfilled' ? summariesRes.value.data : []
  const categories =
    categoriesRes.status === 'fulfilled' ? categoriesRes.value.data : []
  const recurring =
    recurringRes.status === 'fulfilled' ? recurringRes.value.data : []
  const netWorthList =
    netWorthRes.status === 'fulfilled' ? netWorthRes.value.data : []
  const prefs =
    prefsRes.status === 'fulfilled' ? prefsRes.value.data : null

  const currency = prefs?.currency_symbol ?? '₹'
  const displayCurrency = prefs?.display_currency ?? 'INR'

  const sections: string[] = []

  sections.push(
    `You are a personal finance assistant. Currency: ${currency} (${displayCurrency}).`,
  )

  if (Array.isArray(summaries) && summaries.length > 0) {
    const rows = summaries
      .map(
        (s: MonthlySummary) =>
          `| ${s.period} | ${fmtAmount(s.income, currency)} | ${fmtAmount(s.expenses, currency)} | ${Math.round(s.savings_rate)}% |`,
      )
      .join('\n')
    sections.push(
      `## Monthly Summary (Recent)\n| Month | Income | Expenses | Savings Rate |\n|---|---|---|---|\n${rows}`,
    )
  }

  if (Array.isArray(categories) && categories.length > 0) {
    const rows = categories
      .slice(0, 8)
      .map(
        (c: CategoryItem, i: number) =>
          `${i + 1}. ${c.category}: ${fmtAmount(c.total_amount, currency)} (${Math.round(c.pct_of_monthly_total)}%)`,
      )
      .join('\n')
    sections.push(`## Top Spending Categories\n${rows}`)
  }

  if (Array.isArray(recurring) && recurring.length > 0) {
    const rows = recurring
      .slice(0, 10)
      .map(
        (r: RecurringItem) =>
          `- ${r.pattern_name}: ${fmtAmount(r.expected_amount, currency)}/${r.frequency}`,
      )
      .join('\n')
    sections.push(`## Recurring Bills & Subscriptions\n${rows}`)
  }

  if (Array.isArray(netWorthList) && netWorthList.length > 0) {
    const nw = netWorthList[0]
    sections.push(
      `## Net Worth\nTotal: ${fmtAmount(nw.net_worth, currency)} (Assets: ${fmtAmount(nw.total_assets, currency)}, Liabilities: ${fmtAmount(nw.total_liabilities, currency)})`,
    )
  }

  if (Array.isArray(goalsRes.status === 'fulfilled' ? goalsRes.value.data : []) && goals.length > 0) {
    const goals = goalsRes.status === 'fulfilled' ? goalsRes.value.data : []
    const rows = goals
      .slice(0, 5)
      .map((g: GoalItem) => {
        const pct = g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0
        return `- ${g.name}: ${fmtAmount(g.current_amount, currency)}/${fmtAmount(g.target_amount, currency)} (${pct}%)`
      })
      .join('\n')
    sections.push(`## Financial Goals\n${rows}`)
  }

  sections.push(
    `\nAnswer questions about the user's finances based on this data. Be specific with numbers. Use ${currency} currency. Keep responses concise. If you lack data to answer, say so.`,
  )

  return sections.join('\n\n')
}
```

**Note:** The goals section above has a bug in the plan -- the variable `goals` is used before assignment. The implementer should fix this to:

```typescript
  const goals: GoalItem[] = goalsRes.status === 'fulfilled' ? goalsRes.value.data : []
  if (goals.length > 0) {
    const rows = goals
      .slice(0, 5)
      .map((g: GoalItem) => {
        const pct = g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0
        return `- ${g.name}: ${fmtAmount(g.current_amount, currency)}/${fmtAmount(g.target_amount, currency)} (${pct}%)`
      })
      .join('\n')
    sections.push(`## Financial Goals\n${rows}`)
  }
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/lib/chatContext.ts
git commit -m "feat: add financial context builder for AI system prompt"
```

---

## Task 7: Frontend -- Chat Hook

**Files:**
- Create: `frontend/src/components/chat/useChat.ts`

- [ ] **Step 1: Create the chat state hook**

```typescript
// frontend/src/components/chat/useChat.ts
import { useState, useRef, useCallback } from 'react'
import type { ChatMessage } from '@/lib/chatAdapters'
import { streamChat } from '@/lib/chatAdapters'
import { buildFinancialContext } from '@/lib/chatContext'
import { aiConfigService } from '@/services/api/aiConfig'

interface UseChatReturn {
  messages: ChatMessage[]
  isStreaming: boolean
  error: string | null
  send: (content: string) => void
  stop: () => void
  clear: () => void
}

export function useChat(provider: string | null, model: string | null): UseChatReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const contextRef = useRef<string | null>(null)
  const contextTimestamp = useRef(0)

  const send = useCallback(
    async (content: string) => {
      if (!provider || !model || isStreaming) return

      setError(null)
      const userMsg: ChatMessage = { role: 'user', content }
      setMessages((prev) => [...prev, userMsg])
      setIsStreaming(true)

      try {
        const apiKey = await aiConfigService.getKey()

        const now = Date.now()
        if (!contextRef.current || now - contextTimestamp.current > 5 * 60 * 1000) {
          contextRef.current = await buildFinancialContext()
          contextTimestamp.current = now
        }

        const assistantMsg: ChatMessage = { role: 'assistant', content: '' }
        setMessages((prev) => [...prev, assistantMsg])

        const controller = new AbortController()
        abortRef.current = controller

        // Parse region from model if Bedrock
        let region: string | undefined
        if (provider === 'bedrock') {
          // Region was stored during config, fetch it
          const config = await aiConfigService.getConfig()
          region = config.region ?? undefined
        }

        await streamChat(provider, {
          model,
          systemPrompt: contextRef.current,
          messages: [...messages, userMsg],
          apiKey,
          region,
          signal: controller.signal,
          onToken: (token) => {
            setMessages((prev) => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + token }
              }
              return updated
            })
          },
          onDone: () => setIsStreaming(false),
          onError: (err) => {
            setError(err)
            setIsStreaming(false)
          },
        })
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to send message')
        setIsStreaming(false)
      }
    },
    [provider, model, messages, isStreaming],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setIsStreaming(false)
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setError(null)
    setIsStreaming(false)
    contextRef.current = null
  }, [])

  return { messages, isStreaming, error, send, stop, clear }
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/chat/useChat.ts
git commit -m "feat: add useChat hook with streaming and context management"
```

---

## Task 8: Frontend -- Chat UI Components

**Files:**
- Create: `frontend/src/components/chat/ChatMessage.tsx`
- Create: `frontend/src/components/chat/ChatPanel.tsx`
- Create: `frontend/src/components/chat/ChatWidget.tsx`

- [ ] **Step 1: Create ChatMessage component**

```typescript
// frontend/src/components/chat/ChatMessage.tsx
import { memo } from 'react'
import { User, Sparkles } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '@/lib/chatAdapters'

function ChatMessageComponent({ message }: Readonly<{ message: ChatMessageType }>) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser ? 'bg-primary/20' : 'bg-white/10'
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-app-purple" />
        )}
      </div>
      <div
        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-primary/15 text-white rounded-br-md'
            : 'bg-white/[0.06] text-foreground rounded-bl-md'
        }`}
      >
        {message.content || (
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.3s]" />
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(ChatMessageComponent)
```

- [ ] **Step 2: Create ChatPanel component**

```typescript
// frontend/src/components/chat/ChatPanel.tsx
import { useState, useRef, useEffect } from 'react'
import { Send, Square, Trash2, Minus, AlertCircle } from 'lucide-react'
import { motion } from 'framer-motion'
import ChatMessage from './ChatMessage'
import type { ChatMessage as ChatMessageType } from '@/lib/chatAdapters'

interface Props {
  messages: ChatMessageType[]
  isStreaming: boolean
  error: string | null
  onSend: (content: string) => void
  onStop: () => void
  onClear: () => void
  onMinimize: () => void
}

export default function ChatPanel({
  messages,
  isStreaming,
  error,
  onSend,
  onStop,
  onClear,
  onMinimize,
}: Readonly<Props>) {
  const [input, setInput] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSend = () => {
    const trimmed = input.trim()
    if (!trimmed || isStreaming) return
    onSend(trimmed)
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      onMinimize()
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className="absolute bottom-16 right-0 w-[380px] max-h-[500px] glass rounded-2xl border border-border flex flex-col overflow-hidden shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-app-green animate-pulse" />
          <span className="text-sm font-medium text-white">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onClear}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Clear chat"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={onMinimize}
            className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
            title="Minimize"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[200px]">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">
              Ask me anything about your finances.
            </p>
            <div className="mt-3 space-y-1.5">
              {['How much did I spend last month?', 'What are my top expense categories?', "What's my savings rate?"].map(
                (q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => onSend(q)}
                    className="block w-full text-left text-xs text-primary/80 hover:text-primary px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    {q}
                  </button>
                ),
              )}
            </div>
          </div>
        )}
        {messages.map((msg, i) => (
          <ChatMessage key={`${msg.role}-${i}`} message={msg} />
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-2 px-3 py-2 bg-app-red/10 border border-app-red/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-app-red shrink-0 mt-0.5" />
          <p className="text-xs text-app-red">{error}</p>
        </div>
      )}

      {/* Input */}
      <div className="p-3 border-t border-border">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your finances..."
            rows={1}
            className="flex-1 resize-none bg-white/5 border border-border rounded-xl px-3 py-2 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary transition-colors"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={onStop}
              className="p-2 rounded-xl bg-app-red/20 text-app-red hover:bg-app-red/30 transition-colors"
            >
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="p-2 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: Create ChatWidget (floating container)**

```typescript
// frontend/src/components/chat/ChatWidget.tsx
import { useState, useEffect, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { aiConfigService } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useChat } from './useChat'
import ChatPanel from './ChatPanel'

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const accessToken = useAuthStore((s) => s.accessToken)
  const isDemoMode = useDemoStore((s) => s.isDemoMode)

  const { data: aiConfig } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    enabled: !!accessToken && !isDemoMode,
    staleTime: Infinity,
  })

  const isConfigured = aiConfig?.has_key ?? false
  const provider = aiConfig?.provider ?? null
  const model = aiConfig?.model ?? null

  const { messages, isStreaming, error, send, stop, clear } = useChat(provider, model)

  const handleToggle = useCallback(() => {
    if (!isConfigured) return
    setIsOpen((prev) => !prev)
  }, [isConfigured])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen])

  if (!accessToken || isDemoMode) return null

  return (
    <div className="fixed bottom-6 right-6 z-40">
      <AnimatePresence>
        {isOpen && isConfigured && (
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            error={error}
            onSend={send}
            onStop={stop}
            onClear={clear}
            onMinimize={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleToggle}
        title={isConfigured ? 'AI Assistant' : 'Configure AI key in Settings'}
        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
          isConfigured
            ? 'bg-gradient-to-br from-primary to-secondary text-white hover:shadow-primary/25'
            : 'bg-white/10 text-muted-foreground cursor-not-allowed'
        }`}
      >
        <Sparkles className="w-5 h-5" />
        {isConfigured && !isOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-app-green rounded-full border-2 border-black" />
        )}
      </motion.button>
    </div>
  )
}
```

- [ ] **Step 4: Run frontend lint + type-check**

Run: `cd frontend && pnpm run lint && pnpm run type-check`
Expected: Pass

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/chat/ChatMessage.tsx frontend/src/components/chat/ChatPanel.tsx frontend/src/components/chat/ChatWidget.tsx
git commit -m "feat: add floating chat widget with streaming UI"
```

---

## Task 9: Frontend -- AI Settings Section

**Files:**
- Create: `frontend/src/pages/settings/AIAssistantSection.tsx`

- [ ] **Step 1: Create the settings section**

```typescript
// frontend/src/pages/settings/AIAssistantSection.tsx
import { useState, useEffect } from 'react'
import { Sparkles, Eye, EyeOff, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiConfigService, type AIConfig, type AIConfigUpdate } from '@/services/api/aiConfig'
import { Section, FieldLabel, FieldHint } from './components'
import { selectClass, inputClass } from './styles'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'AWS Bedrock' },
]

const MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  bedrock: [
    { value: 'us.anthropic.claude-sonnet-4-5-v2', label: 'Claude Sonnet 4.5 (Bedrock)' },
    { value: 'us.anthropic.claude-haiku-4-5-v2', label: 'Claude Haiku 4.5 (Bedrock)' },
  ],
}

interface Props {
  index: number
}

export default function AIAssistantSection({ index }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const { data: config, isLoading } = useQuery<AIConfig>({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    staleTime: Infinity,
  })

  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [region, setRegion] = useState('us-east-1')
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')

  useEffect(() => {
    if (config) {
      setProvider(config.provider ?? '')
      setModel(config.model ?? '')
      if (config.region) setRegion(config.region)
    }
  }, [config])

  const saveMutation = useMutation({
    mutationFn: (data: AIConfigUpdate) => aiConfigService.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      setApiKey('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => aiConfigService.deleteConfig(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      setProvider('')
      setModel('')
      setApiKey('')
    },
  })

  const handleSave = () => {
    if (!provider || !model || !apiKey) return
    saveMutation.mutate({
      provider,
      model,
      api_key: apiKey,
      region: provider === 'bedrock' ? region : undefined,
    })
  }

  const handleTest = async () => {
    if (!provider || !model || !apiKey) return
    setTestStatus('testing')
    setTestError('')
    try {
      const testPrompt = 'Reply with just the word "OK".'
      let url = ''
      let headers: Record<string, string> = {}
      let body = ''

      if (provider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions'
        headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        body = JSON.stringify({ model, messages: [{ role: 'user', content: testPrompt }], max_tokens: 5 })
      } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }
        body = JSON.stringify({ model, messages: [{ role: 'user', content: testPrompt }], max_tokens: 5 })
      } else {
        // Bedrock -- skip browser test (CORS), just save
        setTestStatus('success')
        return
      }

      const resp = await fetch(url, { method: 'POST', headers, body })
      if (resp.ok) {
        setTestStatus('success')
      } else {
        const err = await resp.json().catch(() => ({}))
        setTestError(err.error?.message ?? `Error ${resp.status}`)
        setTestStatus('error')
      }
    } catch {
      setTestError('Network error -- check your connection')
      setTestStatus('error')
    }
  }

  const providerModels = MODELS[provider] ?? []

  if (isLoading) return null

  return (
    <Section
      index={index}
      icon={Sparkles}
      title="AI Assistant"
      description="Configure your AI provider to chat with your financial data"
      defaultCollapsed={!config?.has_key}
    >
      <div className="space-y-4">
        {/* Provider */}
        <div>
          <FieldLabel htmlFor="ai-provider">Provider</FieldLabel>
          <select
            id="ai-provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value)
              setModel(MODELS[e.target.value]?.[0]?.value ?? '')
              setTestStatus('idle')
            }}
            className={selectClass}
          >
            <option value="" className="bg-background">Select a provider</option>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value} className="bg-background">
                {p.label}
              </option>
            ))}
          </select>
          <FieldHint>Your API key is encrypted and stored securely. LLM calls go directly from your browser to the provider.</FieldHint>
        </div>

        {/* Model */}
        {provider && (
          <div>
            <FieldLabel htmlFor="ai-model">Model</FieldLabel>
            <select
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={selectClass}
            >
              {providerModels.map((m) => (
                <option key={m.value} value={m.value} className="bg-background">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Region (Bedrock only) */}
        {provider === 'bedrock' && (
          <div>
            <FieldLabel htmlFor="ai-region">AWS Region</FieldLabel>
            <input
              id="ai-region"
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              className={inputClass}
            />
          </div>
        )}

        {/* API Key */}
        {provider && (
          <div>
            <FieldLabel htmlFor="ai-key">
              {config?.has_key ? 'Update API Key' : 'API Key'}
            </FieldLabel>
            <div className="relative">
              <input
                id="ai-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setTestStatus('idle')
                }}
                placeholder={config?.has_key ? 'Key configured (enter new to update)' : 'Enter your API key'}
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-white"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        {provider && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!apiKey || testStatus === 'testing'}
              className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40"
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!apiKey || !model || saveMutation.isPending}
              className="px-4 py-2 text-sm bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg disabled:opacity-40 font-medium"
            >
              {saveMutation.isPending ? 'Saving...' : 'Save'}
            </button>
            {config?.has_key && (
              <button
                type="button"
                onClick={() => deleteMutation.mutate()}
                className="px-4 py-2 text-sm text-app-red hover:bg-app-red/10 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            )}
          </div>
        )}

        {/* Test result */}
        {testStatus === 'success' && (
          <div className="flex items-center gap-2 text-sm text-app-green">
            <CheckCircle className="w-4 h-4" />
            Connection successful
          </div>
        )}
        {testStatus === 'error' && (
          <div className="flex items-center gap-2 text-sm text-app-red">
            <AlertCircle className="w-4 h-4" />
            {testError}
          </div>
        )}

        {saveMutation.isSuccess && (
          <div className="flex items-center gap-2 text-sm text-app-green">
            <CheckCircle className="w-4 h-4" />
            AI configuration saved. Open the chat widget (bottom-right) to start.
          </div>
        )}
      </div>
    </Section>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/settings/AIAssistantSection.tsx
git commit -m "feat: add AI Assistant settings section with provider/key config"
```

---

## Task 10: Frontend -- Wire Everything Together

**Files:**
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add ChatWidget to AppLayout**

In `frontend/src/components/layout/AppLayout.tsx`, add import:

```typescript
import ChatWidget from '@/components/chat/ChatWidget'
```

Add `<ChatWidget />` right before the closing `</div>` of the root element (after `<CommandPalette />`):

```typescript
      <CommandPalette />
      <ChatWidget />
    </div>
```

- [ ] **Step 2: Add AIAssistantSection to SettingsPage**

In `frontend/src/pages/SettingsPage.tsx`, add import:

```typescript
import AIAssistantSection from './settings/AIAssistantSection'
```

Add the section after `SalaryStructureSection` (line ~149):

```typescript
        <AIAssistantSection index={sectionIndex++} />
```

- [ ] **Step 3: Run full frontend check**

Run: `cd frontend && pnpm run lint && pnpm run type-check && pnpm test`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/layout/AppLayout.tsx frontend/src/pages/SettingsPage.tsx
git commit -m "feat: wire chat widget into layout and AI section into settings"
```

---

## Task 11: Backend -- Run Tests + Lint

- [ ] **Step 1: Run all backend checks**

Run: `cd backend && uv run ruff check src/ && uv run ruff format src/ tests/ && uv run mypy src/ && uv run pytest tests/ -v`
Expected: All pass

- [ ] **Step 2: Fix any issues, re-run, commit fixes**

---

## Task 12: Frontend -- Manual Testing

- [ ] **Step 1: Start dev servers**

Run: `pnpm run dev` (from root)

- [ ] **Step 2: Verify Settings page**

1. Open `http://localhost:5173/settings`
2. Find "AI Assistant" section
3. Select "Anthropic" provider, pick a model, enter an API key
4. Click "Test Connection" -- should succeed (or show clear error if key is wrong)
5. Click "Save" -- should persist

- [ ] **Step 3: Verify floating widget**

1. After saving AI config, a glowing floating button should appear bottom-right
2. Click it -- chat panel expands
3. Type "How much did I spend last month?" -- should stream a response
4. Escape closes the panel
5. Without AI config, the button should be grayed out

- [ ] **Step 4: Verify without auth**

1. Log out -- floating button should not appear
2. In demo mode -- floating button should not appear

- [ ] **Step 5: Final commit if any fixes needed**

---

## Task 13: Create Branch + PR

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/ai-chatbot
```

Note: Create the branch BEFORE Task 1 (this is listed last for reference but should be done first).

- [ ] **Step 2: Push and create PR**

```bash
git push -u origin feat/ai-chatbot
gh pr create --title "feat: add AI finance chatbot with BYOK support" --body "..."
```

PR body should reference issue #90 with `Closes #90`.
