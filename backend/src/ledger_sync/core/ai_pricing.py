"""Provider cost-per-1M-token reference table.

Numbers reflect public list prices as of 2026-04-27, USD per 1M tokens. The
Claude 5.x rows, the Sonnet 4.5 and 4.6 us. rows and the global. rows for
Haiku 4, Sonnet 4 and Opus 4 were added 2026-10-27: Anthropic rows from
Anthropic's pricing page, Bedrock rows from the AWS Price List
(AmazonBedrockFoundationModels, us-east-1, published 2026-10-12), where a us.
profile costs 10% more than global. Haiku 5.5 bills prompts over 100K tokens
at 5x; these rows assume the shorter tier, which the chat proxy's 256 KB
request cap normally keeps a call in. Refresh when vendors change their rates.
Unknown models fall back to a conservative "we'll overestimate" entry so users
aren't surprised by larger bills than we reported.
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
        "claude-fable-5": (10.00, 50.00),
        "claude-opus-5-5": (4.00, 20.00),
        "claude-opus-5": (5.00, 25.00),
        "claude-opus-4-7": (15.00, 75.00),
        "claude-opus-4": (15.00, 75.00),
        "claude-sonnet-5": (2.00, 10.00),
        "claude-sonnet-4": (3.00, 15.00),
        "claude-haiku-5": (0.10, 0.50),
        "claude-haiku-4": (1.00, 5.00),
    },
    # Each row is AWS's own price for that profile except the us. Opus 4 row,
    # which keeps the Opus 4 and 4.1 price (test_pricing_longest_prefix_wins
    # pins it), so Opus 4.5 to 4.8 over-report there, the safe side. Opus 4 and
    # 4.1 have no global. profile, so the global. Opus 4 row is the Opus 4.5 to
    # 4.8 price. Sonnet 4 costs the same on both profiles.
    "bedrock": {
        "us.anthropic.claude-fable-5": (11.00, 55.00),
        "us.anthropic.claude-opus-5-5": (4.40, 22.00),
        "us.anthropic.claude-opus-5": (5.50, 27.50),
        "us.anthropic.claude-opus-4": (15.00, 75.00),
        "us.anthropic.claude-sonnet-5": (2.20, 11.00),
        "us.anthropic.claude-sonnet-4-6": (3.30, 16.50),
        "us.anthropic.claude-sonnet-4-5": (3.30, 16.50),
        "us.anthropic.claude-sonnet-4": (3.00, 15.00),
        "us.anthropic.claude-haiku-5": (0.11, 0.55),
        "us.anthropic.claude-haiku-4": (1.10, 5.50),
        "global.anthropic.claude-fable-5": (10.00, 50.00),
        "global.anthropic.claude-opus-5-5": (4.00, 20.00),
        "global.anthropic.claude-opus-5": (5.00, 25.00),
        "global.anthropic.claude-opus-4": (5.00, 25.00),
        "global.anthropic.claude-sonnet-5": (2.00, 10.00),
        "global.anthropic.claude-sonnet-4": (3.00, 15.00),
        "global.anthropic.claude-haiku-5": (0.10, 0.50),
        "global.anthropic.claude-haiku-4": (1.00, 5.00),
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
