# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import time
from collections.abc import Mapping, Sequence
from typing import Protocol

from pydantic import JsonValue
import pydantic

from relay_teams.logger import get_logger
from relay_teams.memory.models import (
    MemoryConsolidationRequest,
    MemoryConsolidationResult,
    MemoryEntryKind,
)
from relay_teams.memory.repository import generate_memory_id
from relay_teams.memory.semantic_consolidation_prompts import (
    _SEMANTIC_CONSOLIDATION_SYSTEM_PROMPT,
    _build_extraction_instructions,
)
from relay_teams.providers.provider_contracts import LLMProvider, LLMRequest

LOGGER = get_logger(__name__)

# ---------------------------------------------------------------------------
# Intermediate models
# ---------------------------------------------------------------------------


class SemanticExtractionInput(pydantic.BaseModel):
    """Semantic extraction LLM call input structure."""

    model_config = pydantic.ConfigDict(extra="forbid")

    conversation_messages: tuple[str, ...]
    task_objective: str
    role_id: str
    entry_kinds: tuple[MemoryEntryKind, ...]


class _ExtractedMemoryEntry(pydantic.BaseModel):
    """A single memory entry extracted by the LLM."""

    model_config = pydantic.ConfigDict(extra="forbid")

    kind: MemoryEntryKind
    title: str
    body: str
    context: str = ""
    outcome: str = ""
    confidence_score: float = pydantic.Field(default=0.7, ge=0.0, le=1.0)
    tags: tuple[str, ...] = ()


class SemanticExtractionOutput(pydantic.BaseModel):
    """LLM structured response parse model."""

    model_config = pydantic.ConfigDict(extra="forbid")

    extractions: tuple[_ExtractedMemoryEntry, ...]


class SemanticConsolidationExtraction(pydantic.BaseModel):
    """Parsed semantic consolidation payload ready for persistence."""

    model_config = pydantic.ConfigDict(extra="forbid")

    source_entry_count: int = pydantic.Field(ge=0)
    entries: tuple[_ExtractedMemoryEntry, ...] = ()
    extraction_tokens_used: int = pydantic.Field(default=0, ge=0)
    extraction_duration_ms: int = pydantic.Field(default=0, ge=0)
    fallback_to_structural: bool = False


# ---------------------------------------------------------------------------
# Protocol for runtime dependencies
# ---------------------------------------------------------------------------


class SemanticMessageRepository(Protocol):
    """Protocol for the message repository dependency."""

    async def get_messages_by_session_run_ids_async(
        self,
        session_id: str,
        run_ids: tuple[str, ...],
        *,
        include_cleared: bool = False,
        include_hidden_from_context: bool = False,
    ) -> list[dict[str, JsonValue]]:
        raise NotImplementedError


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_DEFAULT_MAX_CONVERSATION_TOKENS: int = 32000


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _format_conversation_messages(
    raw_messages: Sequence[Mapping[str, object]],
    *,
    max_tokens: int = _DEFAULT_MAX_CONVERSATION_TOKENS,
) -> tuple[str, ...]:
    """Format raw message rows into conversation text lines.

    Truncates from the tail if the estimated token count exceeds *max_tokens*.
    """
    lines: list[str] = []
    for msg in raw_messages:
        role = str(msg.get("role", "unknown"))
        message_json = msg.get("message_json")
        if isinstance(message_json, str):
            text = message_json
        elif isinstance(message_json, dict):
            content = message_json.get("content")
            text = str(content) if content is not None else ""
        else:
            text = str(message_json) if message_json is not None else ""
        lines.append(f"[{role}]: {text}")

    # Crude token estimate: ~4 chars per token
    if max_tokens > 0:
        total_chars = sum(len(line) for line in lines)
        estimated_tokens = total_chars // 4
        if estimated_tokens > max_tokens:
            # Truncate from the end (oldest messages first)
            target_chars = max_tokens * 4
            accumulated = 0
            keep_from = len(lines)
            for i in range(len(lines) - 1, -1, -1):
                accumulated += len(lines[i])
                if accumulated >= target_chars:
                    keep_from = i
                    break
            lines = lines[keep_from:]

    return tuple(lines)


def _build_prompt_json_schema() -> dict[str, object]:
    """Build the JSON schema for the expected extraction output."""
    return {
        "type": "object",
        "properties": {
            "extractions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "kind": {
                            "type": "string",
                            "enum": [k.value for k in tuple(MemoryEntryKind)],
                        },
                        "title": {"type": "string", "minLength": 1},
                        "body": {"type": "string", "minLength": 1},
                        "context": {"type": "string", "default": ""},
                        "outcome": {"type": "string", "default": ""},
                        "confidence_score": {
                            "type": "number",
                            "minimum": 0.0,
                            "maximum": 1.0,
                            "default": 0.7,
                        },
                        "tags": {
                            "type": "array",
                            "items": {"type": "string"},
                            "default": [],
                        },
                    },
                    "required": ["kind", "title", "body"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["extractions"],
        "additionalProperties": False,
    }


def _build_user_prompt(
    *,
    conversation_lines: tuple[str, ...],
    extraction_instructions: str,
    output_schema: dict[str, object],
) -> str:
    """Assemble the user-side prompt for the LLM extraction call."""
    schema_json = json.dumps(output_schema, indent=2)

    conversation_text = "\n".join(conversation_lines)
    return (
        "Analyze the following agent conversation and extract structured"
        " memory entries.\n\n"
        f"{extraction_instructions}\n\n"
        "## Conversation\n\n"
        f"{conversation_text}\n\n"
        "## Output Schema\n\n"
        "Respond with ONLY valid JSON matching this schema:\n\n"
        f"```json\n{schema_json}\n```"
    )


# ---------------------------------------------------------------------------
# Main semantic consolidation logic
# ---------------------------------------------------------------------------


async def _semantic_consolidate_async(
    request: MemoryConsolidationRequest,
    *,
    llm_provider: LLMProvider,
    message_repo: SemanticMessageRepository,
    event_log: object | None = None,
) -> MemoryConsolidationResult:
    """LLM-driven semantic memory extraction from a completed Run.

    Reads the full conversation history from *message_repo*, constructs a
    structured prompt, calls *llm_provider* with streaming, parses the JSON
    response into ``SemanticExtractionOutput``, and creates ``MemoryEntry``
    records at the target tier.

    If JSON parsing fails, falls back to STRUCTURAL consolidation.
    Raises ``ValueError`` if ``source_run_id`` is missing or invalid.
    """
    extraction = await extract_semantic_memory_entries_async(
        request=request,
        llm_provider=llm_provider,
        message_repo=message_repo,
        event_log=event_log,
    )
    if extraction.fallback_to_structural:
        return await _fallback_structural(request)

    new_ids = tuple(generate_memory_id() for _ in extraction.entries)
    return MemoryConsolidationResult(
        source_entry_count=extraction.source_entry_count,
        consolidated_entry_count=len(new_ids),
        superseded_entry_ids=(),
        new_entry_ids=new_ids,
        extraction_tokens_used=extraction.extraction_tokens_used,
        extraction_duration_ms=extraction.extraction_duration_ms,
    )


async def extract_semantic_memory_entries_async(
    *,
    request: MemoryConsolidationRequest,
    llm_provider: LLMProvider,
    message_repo: SemanticMessageRepository,
    event_log: object | None = None,
) -> SemanticConsolidationExtraction:
    """Extract structured memory entries from a completed run conversation."""

    if request.source_run_id is None:
        raise ValueError("source_run_id is required for SEMANTIC consolidation mode")

    start_time = time.monotonic()
    if event_log is not None:
        LOGGER.debug(
            "semantic consolidation using event_log=%s", type(event_log).__name__
        )

    # ---- 1. Fetch conversation history ----
    session_id = request.session_id or ""
    raw_msgs = await message_repo.get_messages_by_session_run_ids_async(
        session_id=session_id,
        run_ids=(request.source_run_id,),
        include_cleared=False,
        include_hidden_from_context=False,
    )
    conversation_lines = _format_conversation_messages(raw_msgs)
    if not conversation_lines:
        LOGGER.warning(
            "no conversation messages found for run_id=%s;"
            " falling back to STRUCTURAL consolidation",
            request.source_run_id,
        )
        return _semantic_fallback_extraction()

    # ---- 2. Build prompts ----
    entry_kinds = request.extraction_kinds
    extraction_instructions = _build_extraction_instructions(entry_kinds)
    output_schema = _build_prompt_json_schema()
    user_prompt = _build_user_prompt(
        conversation_lines=conversation_lines,
        extraction_instructions=extraction_instructions,
        output_schema=output_schema,
    )

    # ---- 3. Call LLM ----
    llm_request = LLMRequest(
        run_id=request.source_run_id,
        trace_id=request.source_run_id,
        task_id="",
        session_id=session_id,
        workspace_id=request.workspace_id,
        instance_id="memory-consolidation",
        role_id=request.role_id or "",
        system_prompt=_SEMANTIC_CONSOLIDATION_SYSTEM_PROMPT,
        user_prompt=user_prompt,
    )

    try:
        raw_response = await llm_provider.generate(llm_request)
    except (ValueError, OSError, RuntimeError) as exc:
        LOGGER.warning(
            "LLM call for semantic consolidation failed: %s;"
            " falling back to STRUCTURAL",
            exc,
        )
        return _semantic_fallback_extraction()

    tokens_used = _estimate_tokens(
        _SEMANTIC_CONSOLIDATION_SYSTEM_PROMPT + user_prompt
    ) + _estimate_tokens(raw_response)

    # ---- 4. Parse JSON response ----
    try:
        # Strip markdown code fences if present
        clean = _strip_json_code_fences(raw_response)
        extraction_output = SemanticExtractionOutput.model_validate_json(clean)
    except (ValueError, pydantic.ValidationError) as exc:
        LOGGER.warning(
            "failed to parse semantic consolidation JSON: %s;"
            " falling back to STRUCTURAL",
            exc,
        )
        return _semantic_fallback_extraction()

    # ---- 5. Apply max_extracted_entries ----
    allowed_kinds = set(request.extraction_kinds)
    entries = tuple(
        entry
        for entry in extraction_output.extractions
        if not allowed_kinds or entry.kind in allowed_kinds
    )
    max_count = request.max_extracted_entries
    if max_count is not None and max_count > 0:
        if len(entries) > max_count:
            entries = entries[:max_count]

    duration_ms = int((time.monotonic() - start_time) * 1000)
    return SemanticConsolidationExtraction(
        source_entry_count=len(conversation_lines),
        entries=entries,
        extraction_tokens_used=tokens_used,
        extraction_duration_ms=duration_ms,
    )


def _semantic_fallback_extraction() -> SemanticConsolidationExtraction:
    return SemanticConsolidationExtraction(
        source_entry_count=0,
        entries=(),
        extraction_tokens_used=0,
        extraction_duration_ms=0,
        fallback_to_structural=True,
    )


# ---------------------------------------------------------------------------
# Fallback helpers
# ---------------------------------------------------------------------------


async def _fallback_structural(
    request: MemoryConsolidationRequest,
) -> MemoryConsolidationResult:
    """Fallback: perform structural consolidation when semantic fails."""

    # The service handles structural internally; we signal this via
    # the result with zero extractions.
    LOGGER.debug(
        "falling back to structural consolidation for workspace=%s run=%s",
        request.workspace_id,
        request.source_run_id,
    )
    return MemoryConsolidationResult(
        source_entry_count=0,
        consolidated_entry_count=0,
        superseded_entry_ids=(),
        new_entry_ids=(),
        extraction_tokens_used=0,
        extraction_duration_ms=0,
    )


def _strip_json_code_fences(raw: str) -> str:
    """Strip optional markdown ```json / ``` fences from a response string."""
    text = raw.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if len(lines) >= 2:
            # Remove opening fence (may be ```json or just ```)
            lines = lines[1:]
            # Remove closing fence if present
            if lines and lines[-1].strip() == "```":
                lines = lines[:-1]
        text = "\n".join(lines)
    return text.strip()


def _estimate_tokens(text: str) -> int:
    """Rough token estimate: ~4 characters per token."""
    if not text:
        return 0
    return max(1, len(text) // 4)
