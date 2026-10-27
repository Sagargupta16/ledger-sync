"""Thinking settings for Claude models behind the Bedrock chat proxy.

The chat wire format carries only text, tool_use and tool_result blocks, so a
reasoning block Claude returns in one tool round never reaches the next round.
Thinking also bills as output, shares the 1024-token ``max_tokens`` the chat
sends, and adds latency under the 8 s read timeout. Claude 5.x models think by
default, so the proxy turns thinking off where the model allows it and asks for
the lowest effort where it does not. Models that think only when asked (Haiku
4.5, Sonnet 4.6, Opus 4.8 and older) get no extra fields.

Support per model, from Anthropic's thinking guide and Bedrock's adaptive
thinking page (read 2026-10-27): ``thinking.type: "disabled"`` works on Haiku
5.5 (at high effort or below), Sonnet 5 and Opus 5, and returns 400 on Sonnet
5.5, Opus 5.5 and Fable. ``output_config.effort`` goes in
``additionalModelRequestFields`` on Converse.

Live probe, Converse on us-east-1, 2026-10-27, two tool rounds per model:
Bedrock accepted the fields below for every family in the table. With default
thinking, Haiku 5.5, Fable 5 and Fable 5.1 returned a reasoning block before a
tool call and Bedrock accepted the next round without it, so dropping the block
does not fail a request. With these fields none of those three, nor Sonnet 5.5
or Opus 5.5, reasoned before a tool call.
"""

from __future__ import annotations

import copy
import re
from typing import Any

_THINKING_OFF: dict[str, Any] = {"thinking": {"type": "disabled"}}
_LOW_EFFORT: dict[str, Any] = {"output_config": {"effort": "low"}}

_FIELDS_BY_FAMILY: dict[str, dict[str, Any]] = {
    "haiku-5-5": _THINKING_OFF,
    "sonnet-5": _THINKING_OFF,
    "opus-5": _THINKING_OFF,
    "sonnet-5-5": _LOW_EFFORT,
    "opus-5-5": _LOW_EFFORT,
    "fable-5": _LOW_EFFORT,
    "fable-5-1": _LOW_EFFORT,
}

# Matches the bare ID and every profile prefix (us., global., eu.). A date or
# "-v1" suffix ends the family: "claude-haiku-4-5-20251001-v1:0" is "haiku-4-5".
_FAMILY = re.compile(r"anthropic\.claude-([a-z]+-\d+(?:-\d)?)(?!\d)")


def thinking_request_fields(model_id: str) -> dict[str, Any] | None:
    """Converse ``additionalModelRequestFields`` that keep a model's thinking off or low."""
    match = _FAMILY.search(model_id)
    fields = _FIELDS_BY_FAMILY.get(match.group(1)) if match else None
    return copy.deepcopy(fields) if fields else None
