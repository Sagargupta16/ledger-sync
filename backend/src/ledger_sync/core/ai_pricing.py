"""Provider cost-per-1M-token reference table.

Numbers reflect public list prices as of 2026-04-27. USD per 1M tokens.
Refresh when vendors change their rates. Unknown models fall back to a
conservative "we'll overestimate" entry so users aren't surprised by
larger bills than we reported.
"""

from __future__ import annotations

# provider -> model_prefix -> (input_per_1m_usd, output_per_1m_usd)
# We match by prefix so fine-grained version suffixes (e.g. 4-7-20251001-v1:0)
# share the same price row as their base model.
_PRICING: dict[str, dict[str, tuple[float, float]]] = {
    "openai": {
        "o3": (2.00, 8.00),
        "o4-mini": (1.10, 4.40),
        "gpt-4.1": (3.00, 12.00),
        "gpt-4.1-mini": (0.40, 1.60),
        "gpt-4.1-nano": (0.10, 0.40),
        "gpt-4o": (2.50, 10.00),
        "gpt-4o-mini": (0.15, 0.60),
    },
    "anthropic": {
        "claude-opus-4-7": (15.00, 75.00),
        "claude-opus-4": (15.00, 75.00),
        "claude-sonnet-4": (3.00, 15.00),
        "claude-haiku-4": (1.00, 5.00),
    },
    # Bedrock mirrors Anthropic pricing (AWS passes it through) plus a small
    # AWS markup. We use Anthropic list prices as a near-enough estimate.
    "bedrock": {
        "us.anthropic.claude-opus-4": (15.00, 75.00),
        "us.anthropic.claude-sonnet-4": (3.00, 15.00),
        "us.anthropic.claude-haiku-4": (1.00, 5.00),
    },
}

# Fallback applied when neither provider nor model prefix matches. Tuned to
# be on the high side so we never under-report cost.
_FALLBACK_PER_1M: tuple[float, float] = (10.00, 40.00)


def _match_prefix(model: str, table: dict[str, tuple[float, float]]) -> tuple[float, float]:
    # Longest-prefix match so more specific keys win.
    best: tuple[float, float] | None = None
    best_len = -1
    for prefix, rate in table.items():
        if model.startswith(prefix) and len(prefix) > best_len:
            best = rate
            best_len = len(prefix)
    return best if best is not None else _FALLBACK_PER_1M


def estimate_cost_usd(provider: str, model: str, input_tokens: int, output_tokens: int) -> float:
    """Return USD cost for a single call. Never negative; rounds to 6dp."""
    table = _PRICING.get(provider.lower())
    if table is None:
        rate_in, rate_out = _FALLBACK_PER_1M
    else:
        rate_in, rate_out = _match_prefix(model, table)
    cost = (input_tokens * rate_in + output_tokens * rate_out) / 1_000_000
    return round(max(cost, 0.0), 6)
