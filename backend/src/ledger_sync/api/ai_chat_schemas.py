"""Request/response models for the Bedrock chat proxy (``api/ai_chat.py``).

Strict, bounded Pydantic models: every string, list and nesting level has a
cap, and the whole request is size-checked once more after validation.
"""

from __future__ import annotations

import json
from typing import Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator

MAX_CHAT_BYTES = 262_144
MAX_JSON_DEPTH = 12
TOOL_IDENTIFIER_PATTERN = r"^[a-zA-Z0-9_-]+$"


class ChatModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class ToolResultContent(ChatModel):
    text: str | None = Field(default=None, min_length=1, max_length=65_536)
    json_data: JsonValue = Field(default=None, alias="json")

    @model_validator(mode="after")
    def validate_content(self) -> Self:
        if (self.text is not None) == ("json_data" in self.model_fields_set):
            raise ValueError("Tool result must contain exactly one of text or json")
        return self


class ContentBlock(ChatModel):
    """A bounded text, tool-use, or tool-result block."""

    type: Literal["text", "tool_use", "tool_result"]
    text: str | None = Field(default=None, min_length=1, max_length=65_536)
    tool_use_id: str | None = Field(
        default=None, min_length=1, max_length=64, pattern=TOOL_IDENTIFIER_PATTERN
    )
    name: str | None = Field(
        default=None, min_length=1, max_length=64, pattern=TOOL_IDENTIFIER_PATTERN
    )
    input: dict[str, JsonValue] | None = Field(default=None, max_length=20)
    content: list[ToolResultContent] | None = Field(default=None, min_length=1, max_length=16)

    @model_validator(mode="after")
    def validate_shape(self) -> Self:
        present = {
            name
            for name in ("text", "tool_use_id", "name", "input", "content")
            if getattr(self, name) is not None
        }
        required = {
            "text": {"text"},
            "tool_use": {"tool_use_id", "name", "input"},
            "tool_result": {"tool_use_id", "content"},
        }
        if present != required[self.type]:
            raise ValueError(f"Invalid fields for {self.type} block")
        return self


class StructuredMessage(ChatModel):
    role: Literal["user", "assistant"]
    content: str | None = Field(default=None, min_length=1, max_length=65_536)
    blocks: list[ContentBlock] | None = Field(default=None, min_length=1, max_length=32)

    @model_validator(mode="after")
    def validate_message(self) -> Self:
        if (self.content is None) == (self.blocks is None):
            raise ValueError("Message must contain exactly one of content or blocks")
        for block in self.blocks or []:
            if block.type == "tool_use" and self.role != "assistant":
                raise ValueError("Only assistant messages may contain tool_use")
            if block.type == "tool_result" and self.role != "user":
                raise ValueError("Only user messages may contain tool_result")
        return self


class ToolSpec(ChatModel):
    name: str = Field(min_length=1, max_length=64, pattern=TOOL_IDENTIFIER_PATTERN)
    description: str = Field(min_length=1, max_length=4096)
    parameters: dict[str, JsonValue] = Field(max_length=32)

    @model_validator(mode="after")
    def validate_schema(self) -> Self:
        if self.parameters.get("type") != "object":
            raise ValueError("Tool parameters must be an object schema")
        return self


def _check_json_depth(value: Any, depth: int = 0) -> None:
    if depth > MAX_JSON_DEPTH:
        raise ValueError("Chat JSON nesting is too deep")
    if isinstance(value, dict):
        for child in value.values():
            _check_json_depth(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            _check_json_depth(child, depth + 1)


class BedrockChatRequest(ChatModel):
    messages: list[StructuredMessage] = Field(min_length=1, max_length=100)
    system_prompt: str = Field(default="", max_length=32_768)
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    tools: list[ToolSpec] | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def validate_size(self) -> Self:
        value = self.model_dump(by_alias=True, exclude_none=True)
        _check_json_depth(value)
        if len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode()) > MAX_CHAT_BYTES:
            raise ValueError("Chat history is too large; start a new conversation")
        return self


class BedrockChatResponse(BaseModel):
    """Response envelope compatible with tool-calling.

    `blocks` mirrors the Bedrock Converse output: a list of content blocks
    that may mix text and tool_use. The frontend inspects them to decide
    whether to execute tools or display the reply.
    """

    blocks: list[dict[str, Any]]
    stop_reason: str | None = None
