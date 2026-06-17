# -*- coding: utf-8 -*-
from __future__ import annotations

import re
import sqlite3
from collections.abc import Callable, Iterable
from datetime import datetime, timezone

from pydantic import JsonValue

from relay_teams.logger import get_logger
from relay_teams.memory import memory_defaults
from relay_teams.memory.memory_defaults import (
    MIN_CONFIDENCE_ACTIVE,
    MIN_CONFIDENCE_CONSOLIDATION,
)
from relay_teams.memory.models import (
    ConsolidationMode,
    CreateMemoryEntryRequest,
    GlobalMemorySearchRequest,
    MemoryConsolidationRequest,
    MemoryConsolidationResult,
    MemoryContent,
    MemoryEntry,
    MemoryEntryKind,
    MemoryEntryStatus,
    MemoryIndexRebuildRequest,
    MemoryIndexRebuildResult,
    MemoryQuery,
    MemoryQueryResult,
    MemoryScope,
    MemorySearchHit,
    MemorySearchRequest,
    MemorySearchResult,
    MemorySourceKind,
    MemoryTier,
    UpdateMemoryEntryRequest,
    _UNSET,
    _entry_to_summary,
    default_ttl_for_tier,
)
from relay_teams.memory.repository import MemoryBankRepository, generate_memory_id
from relay_teams.memory.semantic_consolidation import (
    SemanticMessageRepository,
    extract_semantic_memory_entries_async,
)
from relay_teams.providers.provider_contracts import LLMProvider
from relay_teams.retrieval.retrieval_models import (
    RetrievalDocument,
    RetrievalQuery,
    RetrievalScopeConfig,
    RetrievalScopeKind,
)
from relay_teams.retrieval.retrieval_service import RetrievalService

LOGGER = get_logger(__name__)
GLOBAL_SEARCH_BATCH_SIZE = 100
INDEX_BACKFILL_BATCH_SIZE = 100
FTS_SEARCH_BATCH_SIZE = 100
_MAX_MEMORY_METADATA_KEYS = 20
_RETRIEVAL_INDEX_KIND = "retrieval"
_SEMANTIC_SOURCE_KIND = "semantic_run"
_SEMANTIC_SOURCE_RUN_IDS_METADATA_KEY = "semantic_source_run_ids"
_SEMANTIC_OBSERVATION_COUNT_METADATA_KEY = "semantic_observation_count"
_SEMANTIC_LATEST_SOURCE_RUN_ID_METADATA_KEY = "semantic_latest_source_run_id"
_SEMANTIC_KEY_METADATA_KEY = "semantic_key"
_MAX_SEMANTIC_SOURCE_RUN_IDS = 10
_DEDUP_TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_]+")


def _sanitize_semantic_tags(tags: tuple[str, ...]) -> tuple[str, ...]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        normalized = tag.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        cleaned.append(normalized)
    return tuple(cleaned)


def _normalize_dedup_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _dedup_tokens(value: str) -> frozenset[str]:
    return frozenset(
        match.group(0).casefold() for match in _DEDUP_TOKEN_PATTERN.finditer(value)
    )


def _semantic_key(*, kind: MemoryEntryKind, title: str, body: str) -> str:
    return "|".join(
        (
            kind.value,
            _normalize_dedup_text(title),
            _normalize_dedup_text(body),
        )
    )


def _jaccard_similarity(left: frozenset[str], right: frozenset[str]) -> float:
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    return len(left & right) / len(left | right)


def _merge_semantic_source_run_ids(
    *,
    metadata: dict[str, str],
    source_run_id: str | None,
    existing_source_refs: tuple[str, ...] = (),
) -> tuple[str, ...]:
    ordered: list[str] = []
    for source_ref in existing_source_refs:
        cleaned_ref = source_ref.strip()
        if cleaned_ref and cleaned_ref not in ordered:
            ordered.append(cleaned_ref)
    for candidate in (
        metadata.get(_SEMANTIC_SOURCE_RUN_IDS_METADATA_KEY, ""),
        metadata.get("semantic_source_run_id", ""),
    ):
        for run_id in candidate.split(","):
            cleaned = run_id.strip()
            if cleaned and cleaned not in ordered:
                ordered.append(cleaned)
    if source_run_id is not None:
        cleaned_source = source_run_id.strip()
        if cleaned_source and cleaned_source not in ordered:
            ordered.append(cleaned_source)
    return tuple(ordered[-_MAX_SEMANTIC_SOURCE_RUN_IDS:])


def _merge_semantic_text(existing: str, incoming: str) -> str:
    cleaned_existing = existing.strip()
    cleaned_incoming = incoming.strip()
    if not cleaned_incoming:
        return existing
    if not cleaned_existing:
        return cleaned_incoming
    if cleaned_incoming.casefold() in cleaned_existing.casefold():
        return existing
    return f"{cleaned_existing}\n\n{cleaned_incoming}"


def _merge_semantic_tags(
    existing: tuple[str, ...],
    incoming: tuple[str, ...],
) -> tuple[str, ...]:
    return _sanitize_semantic_tags((*existing, *incoming))


def _merge_semantic_confidence(
    *,
    existing: float,
    extracted: float,
    source_run_id: str | None,
    source_run_ids: tuple[str, ...],
) -> float:
    baseline = max(existing, extracted)
    if source_run_id is None or len(source_run_ids) <= 1:
        return baseline
    return min(1.0, baseline + 0.02)


def _trim_metadata(metadata: dict[str, str]) -> dict[str, str]:
    trimmed = metadata.copy()
    protected = {
        "semantic_source_run_id",
        "semantic_consolidation",
        "consolidated_from_memory_id",
        "original_source",
        "original_source_ref",
        _SEMANTIC_SOURCE_RUN_IDS_METADATA_KEY,
        _SEMANTIC_OBSERVATION_COUNT_METADATA_KEY,
        _SEMANTIC_LATEST_SOURCE_RUN_ID_METADATA_KEY,
        _SEMANTIC_KEY_METADATA_KEY,
    }
    while len(trimmed) > _MAX_MEMORY_METADATA_KEYS:
        removable = sorted(key for key in trimmed if key not in protected)
        if not removable:
            break
        del trimmed[removable[0]]
    return trimmed


def _structural_consolidation_metadata(entry: MemoryEntry) -> dict[str, str]:
    metadata = entry.metadata.copy()
    metadata["consolidated_from_memory_id"] = entry.id
    if "original_source" not in metadata:
        metadata["original_source"] = entry.source.value
    if entry.source_ref and "original_source_ref" not in metadata:
        metadata["original_source_ref"] = entry.source_ref
    return _trim_metadata(metadata)


def _structural_consolidation_role_id(
    *,
    request: MemoryConsolidationRequest,
    source_entry: MemoryEntry,
) -> str | None:
    if request.role_id is not None:
        return request.role_id
    if request.target_scope == MemoryScope.WORKSPACE:
        return None
    return source_entry.role_id


def _retrieval_keywords(entry: MemoryEntry) -> tuple[str, ...]:
    return tuple(dict.fromkeys(entry.tags))


def _single_role_id(values: Iterable[object]) -> str | None:
    role_ids = tuple(
        dict.fromkeys(
            value.strip()
            for value in values
            if isinstance(value, str) and value.strip()
        )
    )
    if len(role_ids) == 1:
        return role_ids[0]
    return None


def _message_role_id(message: dict[str, JsonValue]) -> str:
    for key in ("agent_role_id", "role_id", "sender_role_id"):
        value = message.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    nested = message.get("message")
    if isinstance(nested, dict):
        for key in ("role_id", "agent_role_id", "sender_role_id"):
            value = nested.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
    return ""


def _merge_semantic_metadata_preserving_existing(
    *,
    existing: dict[str, str],
    source_run_id: str | None,
    source_run_ids: tuple[str, ...],
    semantic_key: str,
) -> dict[str, str]:
    merged = existing.copy()
    semantic_updates: list[tuple[str, str]] = []
    if source_run_id is not None:
        semantic_updates.extend(
            (
                ("semantic_source_run_id", source_run_id),
                (_SEMANTIC_LATEST_SOURCE_RUN_ID_METADATA_KEY, source_run_id),
            )
        )
    semantic_updates.extend(
        (
            (_SEMANTIC_SOURCE_RUN_IDS_METADATA_KEY, ",".join(source_run_ids)),
            (_SEMANTIC_OBSERVATION_COUNT_METADATA_KEY, str(len(source_run_ids))),
            (_SEMANTIC_KEY_METADATA_KEY, semantic_key),
            ("semantic_consolidation", "true"),
        )
    )
    for key, value in semantic_updates:
        if key in merged or len(merged) < _MAX_MEMORY_METADATA_KEYS:
            merged[key] = value
    return merged


class MemoryBankService:
    def __init__(
        self,
        *,
        repository: MemoryBankRepository,
        retrieval_service: RetrievalService | None = None,
        llm_provider: LLMProvider | None = None,
        llm_provider_resolver: Callable[[], LLMProvider | None] | None = None,
        message_repo: SemanticMessageRepository | None = None,
        event_log: object | None = None,
    ) -> None:
        self._repo = repository
        self._retrieval_service = retrieval_service
        self._llm_provider_resolver = llm_provider_resolver or (lambda: llm_provider)
        self._message_repo = message_repo
        self._event_log = event_log

    def semantic_consolidation_available(self) -> bool:
        return (
            self._message_repo is not None and self._llm_provider_resolver() is not None
        )

    # ------------------------------------------------------------------
    # 1. Create
    # ------------------------------------------------------------------

    async def create_entry_async(
        self, request: CreateMemoryEntryRequest
    ) -> MemoryEntry:
        now = datetime.now(tz=timezone.utc)
        memory_id = generate_memory_id()
        expires_at = request.expires_at
        if expires_at is None:
            expires_at = default_ttl_for_tier(request.tier)

        entry = MemoryEntry(
            id=memory_id,
            tier=request.tier,
            scope=request.scope,
            workspace_id=request.workspace_id,
            session_id=request.session_id,
            run_id=request.run_id,
            role_id=request.role_id,
            kind=request.kind,
            status=MemoryEntryStatus.ACTIVE,
            content=request.content,
            tags=request.tags,
            confidence_score=request.confidence_score,
            source=request.source,
            source_ref=request.source_ref,
            expires_at=expires_at,
            created_at=now,
            updated_at=now,
            metadata=request.metadata,
        )
        await self.enforce_capacity_async(
            workspace_id=request.workspace_id,
            tier=request.tier,
            scope=request.scope,
            session_id=request.session_id,
            role_id=request.role_id,
            run_id=request.run_id,
        )
        created = await self._repo.create_entry_async(entry=entry)
        await self._index_entry_async(created)
        return created

    # ------------------------------------------------------------------
    # 2. Get / List
    # ------------------------------------------------------------------

    async def get_entry_async(self, memory_id: str) -> MemoryEntry | None:
        return await self._repo.get_by_id_async(memory_id)

    async def list_entries_async(self, query: MemoryQuery) -> MemoryQueryResult:
        return await self._repo.query_entries_async(query)

    async def infer_single_run_role_id_async(
        self,
        *,
        workspace_id: str,
        session_id: str,
        run_id: str,
    ) -> str | None:
        role_id = await self._infer_single_run_role_id_from_memory_async(
            workspace_id=workspace_id,
            session_id=session_id,
            run_id=run_id,
        )
        if role_id is not None:
            return role_id
        return await self._infer_single_run_role_id_from_messages_async(
            session_id=session_id,
            run_id=run_id,
        )

    async def _infer_single_run_role_id_from_memory_async(
        self,
        *,
        workspace_id: str,
        session_id: str,
        run_id: str,
    ) -> str | None:
        page_size = 100
        offset = 0
        role_ids: list[str | None] = []
        while True:
            result = await self._repo.query_entries_async(
                MemoryQuery(
                    workspace_id=workspace_id,
                    session_id=session_id,
                    run_id=run_id,
                    tier=MemoryTier.WORKING,
                    status=MemoryEntryStatus.ACTIVE,
                    limit=page_size,
                    offset=offset,
                )
            )
            role_ids.extend(entry.role_id for entry in result.items)
            offset += len(result.items)
            if offset >= result.total_count or not result.items:
                break
        return _single_role_id(role_ids)

    async def _infer_single_run_role_id_from_messages_async(
        self,
        *,
        session_id: str,
        run_id: str,
    ) -> str | None:
        if self._message_repo is None:
            return None
        messages = await self._message_repo.get_messages_by_session_run_ids_async(
            session_id,
            (run_id,),
            include_cleared=False,
            include_hidden_from_context=True,
        )
        return _single_role_id(_message_role_id(message) for message in messages)

    async def reindex_active_entries_async(self) -> int:
        if self._retrieval_service is None:
            return 0

        indexed_count = 0
        offset = 0
        while True:
            result = await self._repo.query_entries_async(
                MemoryQuery(
                    status=MemoryEntryStatus.ACTIVE,
                    limit=INDEX_BACKFILL_BATCH_SIZE,
                    offset=offset,
                )
            )
            if not result.items:
                break

            for summary in result.items:
                entry = await self._repo.get_by_id_async(summary.id)
                if entry is None:
                    continue
                if await self._index_entry_async(entry):
                    indexed_count += 1

            offset += INDEX_BACKFILL_BATCH_SIZE
            if offset >= result.total_count:
                break

        if indexed_count > 0:
            LOGGER.info(
                "Reindexed %d active Memory Bank entries into retrieval",
                indexed_count,
            )
        return indexed_count

    async def rebuild_stale_index_entries_async(self) -> int:
        """Rebuild retrieval documents for active entries with stale index state."""
        if self._retrieval_service is None:
            return 0

        indexed_count = 0
        while True:
            items = await self._repo.query_entries_needing_index_rebuild_async(
                workspace_id=None,
                limit=INDEX_BACKFILL_BATCH_SIZE,
            )
            if not items:
                break

            batch_indexed = 0
            for summary in items:
                entry = await self._repo.get_by_id_async(summary.id)
                if entry is None:
                    continue
                if await self._index_entry_async(entry):
                    indexed_count += 1
                    batch_indexed += 1

            if batch_indexed == 0 or len(items) < INDEX_BACKFILL_BATCH_SIZE:
                break

        if indexed_count > 0:
            LOGGER.info(
                "Rebuilt retrieval index for %d stale Memory Bank entries",
                indexed_count,
            )
        return indexed_count

    async def rebuild_stale_index_entries_result_async(
        self,
        request: MemoryIndexRebuildRequest,
    ) -> MemoryIndexRebuildResult:
        items = await self._repo.query_entries_needing_index_rebuild_async(
            workspace_id=request.workspace_id,
            limit=request.limit,
        )
        if request.dry_run:
            LOGGER.info(
                "Dry-run Memory Bank index rebuild scanned=%d workspace=%s",
                len(items),
                request.workspace_id or "*",
            )
            return MemoryIndexRebuildResult(
                scanned_count=len(items),
                rebuilt_count=0,
                skipped_count=len(items),
                failed_count=0,
            )
        if self._retrieval_service is None:
            LOGGER.info(
                "Skipped Memory Bank index rebuild because retrieval is unavailable "
                "scanned=%d workspace=%s",
                len(items),
                request.workspace_id or "*",
            )
            return MemoryIndexRebuildResult(
                scanned_count=len(items),
                rebuilt_count=0,
                skipped_count=len(items),
                failed_count=0,
            )

        scanned_count = 0
        rebuilt_count = 0
        skipped_count = 0
        failed_count = 0
        offset = 0
        while True:
            items = await self._repo.query_entries_needing_index_rebuild_async(
                workspace_id=request.workspace_id,
                limit=request.limit,
                offset=offset,
            )
            if not items:
                break
            batch_rebuilt = 0
            batch_skipped = 0
            batch_failed = 0
            for summary in items:
                entry = await self._repo.get_by_id_async(summary.id)
                if entry is None:
                    batch_skipped += 1
                    continue
                if await self._index_entry_async(entry):
                    batch_rebuilt += 1
                else:
                    batch_failed += 1
            scanned_count += len(items)
            rebuilt_count += batch_rebuilt
            skipped_count += batch_skipped
            failed_count += batch_failed
            if batch_rebuilt > 0 or batch_skipped > 0 or len(items) < request.limit:
                break
            offset += request.limit

        result = MemoryIndexRebuildResult(
            scanned_count=scanned_count,
            rebuilt_count=rebuilt_count,
            skipped_count=skipped_count,
            failed_count=failed_count,
        )
        LOGGER.info(
            "Memory Bank index rebuild completed workspace=%s scanned=%d rebuilt=%d "
            "skipped=%d failed=%d",
            request.workspace_id or "*",
            result.scanned_count,
            result.rebuilt_count,
            result.skipped_count,
            result.failed_count,
        )
        return result

    # ------------------------------------------------------------------
    # 3. Update
    # ------------------------------------------------------------------

    async def update_entry_async(
        self, memory_id: str, request: UpdateMemoryEntryRequest
    ) -> MemoryEntry | None:
        entry = await self._repo.get_by_id_async(memory_id)
        if entry is None:
            return None
        updated = self._apply_update(entry, request)
        result = await self._repo.update_entry_async(memory_id, entry=updated)
        if result is not None:
            await self._sync_index_entry_async(result)
        return result

    @staticmethod
    def _apply_update(
        entry: MemoryEntry, request: UpdateMemoryEntryRequest
    ) -> MemoryEntry:
        now = datetime.now(tz=timezone.utc)
        update_data: dict[str, object] = {
            "version": entry.version + 1,
            "updated_at": now,
        }

        if request.content is not None:
            update_data["content"] = request.content
        if request.tags is not None:
            update_data["tags"] = request.tags
        if request.confidence_score is not None:
            update_data["confidence_score"] = request.confidence_score
        if request.status is not None:
            update_data["status"] = request.status
        if request.expires_at is not _UNSET:
            update_data["expires_at"] = request.expires_at
        if request.metadata is not None:
            update_data["metadata"] = request.metadata

        updated = entry.model_copy(update=update_data)

        # Auto-expire if confidence falls below threshold
        if (
            updated.confidence_score < MIN_CONFIDENCE_ACTIVE
            and updated.status == MemoryEntryStatus.ACTIVE
        ):
            updated = updated.model_copy(update={"status": MemoryEntryStatus.EXPIRED})

        return updated

    async def patch_entry_metadata_async(
        self,
        *,
        memory_id: str,
        workspace_id: str,
        metadata_patch: dict[str, str],
    ) -> MemoryEntry | None:
        if not metadata_patch:
            return await self._repo.get_by_id_async(memory_id)
        patched = await self._repo.patch_entry_metadata_async(
            memory_id=memory_id,
            workspace_id=workspace_id,
            metadata_patch=metadata_patch,
            metadata_limit=_MAX_MEMORY_METADATA_KEYS,
            updated_at=datetime.now(tz=timezone.utc),
        )
        if not patched:
            return None
        return await self._repo.get_by_id_async(memory_id)

    # ------------------------------------------------------------------
    # 4. Delete
    # ------------------------------------------------------------------

    async def delete_entry_async(self, memory_id: str) -> bool:
        entry = await self._repo.get_by_id_async(memory_id)
        if entry is None:
            return False
        deleted = await self._repo.delete_entry_async(memory_id)
        if deleted and self._retrieval_service is not None:
            await self._delete_index_entry_async(entry, mark_removed=False)
        return deleted

    # ------------------------------------------------------------------
    # 4b. Capacity enforcement
    # ------------------------------------------------------------------

    async def enforce_capacity_async(
        self,
        *,
        workspace_id: str,
        tier: MemoryTier,
        scope: MemoryScope,
        session_id: str | None = None,
        role_id: str | None = None,
        run_id: str | None = None,
    ) -> int:
        """Check capacity limits and prune oldest/lowest-confidence entries.

        Returns the number of entries pruned.  Called automatically before
        ``create_entry`` so the capacity cap is never exceeded.
        """
        limit: int
        filter_scope: MemoryScope | None = None
        count_run_id: str | None = None
        count_session_id: str | None = None
        count_role_id: str | None = None
        if tier == MemoryTier.WORKING and run_id is not None:
            limit = memory_defaults.MAX_WORKING_PER_RUN
            count_run_id = run_id
        elif tier == MemoryTier.MEDIUM_TERM:
            limit = memory_defaults.MAX_MEDIUM_TERM_PER_SESSION_ROLE
            count_session_id = session_id
            count_role_id = role_id
        elif tier == MemoryTier.PERSISTENT:
            limit = memory_defaults.MAX_PERSISTENT_PER_WORKSPACE
        else:
            return 0

        current_count = await self._repo.count_entries_async(
            workspace_id=workspace_id,
            tier=tier,
            scope=filter_scope,
            session_id=count_session_id,
            role_id=count_role_id,
            run_id=count_run_id,
            status=MemoryEntryStatus.ACTIVE,
        )
        if current_count < limit:
            return 0

        overflow = current_count - limit + 1
        expired_ids = await self._repo.oldest_entry_ids_async(
            workspace_id=workspace_id,
            tier=tier,
            scope=filter_scope,
            session_id=count_session_id,
            role_id=count_role_id,
            run_id=count_run_id,
            status=MemoryEntryStatus.ACTIVE,
            count=overflow,
        )
        expired_entry_ids = await self._repo.expire_entry_ids_returning_async(
            memory_ids=expired_ids
        )
        expired_count = len(expired_entry_ids)
        if expired_entry_ids:
            await self._delete_index_entry_ids_async(
                workspace_id=workspace_id,
                memory_ids=expired_entry_ids,
            )
            LOGGER.info(
                "Pruned %d Memory Bank entries for capacity workspace=%s tier=%s scope=%s",
                expired_count,
                workspace_id,
                tier.value,
                scope.value,
            )
        return expired_count

    # ------------------------------------------------------------------
    # 5. Consolidation
    # ------------------------------------------------------------------

    async def consolidate_async(
        self, request: MemoryConsolidationRequest
    ) -> MemoryConsolidationResult:
        if request.consolidation_mode == ConsolidationMode.SEMANTIC:
            return await self._consolidate_semantic_async(request)
        return await self._consolidate_structural_async(request)

    async def _consolidate_structural_async(
        self, request: MemoryConsolidationRequest
    ) -> MemoryConsolidationResult:
        source_tier = self._source_tier_for(request.target_tier)

        query = MemoryQuery(
            workspace_id=request.workspace_id,
            tier=source_tier,
            status=MemoryEntryStatus.ACTIVE,
            min_confidence=MIN_CONFIDENCE_CONSOLIDATION,
        )
        if (
            source_tier == MemoryTier.MEDIUM_TERM
            and request.target_scope == MemoryScope.WORKSPACE
            and request.role_id is None
        ):
            query = query.model_copy(
                update={
                    "scope": MemoryScope.WORKSPACE,
                    "role_id_is_null": True,
                }
            )
        if request.session_id is not None:
            query = query.model_copy(update={"session_id": request.session_id})
        if source_tier == MemoryTier.WORKING and request.source_run_id is not None:
            query = query.model_copy(update={"run_id": request.source_run_id})
        if request.role_id is not None:
            query = query.model_copy(update={"role_id": request.role_id})
        if request.filter_kind is not None:
            query = query.model_copy(update={"kind": request.filter_kind})
        if request.filter_tags:
            query = query.model_copy(update={"tags": request.filter_tags})

        result = await self._repo.query_entries_async(query)
        source_entries: list[MemoryEntry] = []
        for summary in result.items:
            entry = await self._repo.get_by_id_async(summary.id)
            if entry is not None:
                source_entries.append(entry)

        new_ids: list[str] = []
        superseded_ids: list[str] = []

        now = datetime.now(tz=timezone.utc)
        for src in source_entries:
            new_id = generate_memory_id()
            new_entry = MemoryEntry(
                id=new_id,
                tier=request.target_tier,
                scope=request.target_scope,
                workspace_id=request.workspace_id,
                session_id=request.session_id,
                run_id=None,
                role_id=_structural_consolidation_role_id(
                    request=request,
                    source_entry=src,
                ),
                kind=src.kind,
                status=MemoryEntryStatus.ACTIVE,
                content=src.content.model_copy(),
                tags=src.tags,
                confidence_score=src.confidence_score,
                source=MemorySourceKind.CONSOLIDATION,
                source_ref=src.source_ref,
                parent_entry_id=src.id,
                created_at=now,
                updated_at=now,
                expires_at=default_ttl_for_tier(request.target_tier),
                metadata=_structural_consolidation_metadata(src),
            )
            await self.enforce_capacity_async(
                workspace_id=new_entry.workspace_id,
                tier=new_entry.tier,
                scope=new_entry.scope,
                session_id=new_entry.session_id,
                role_id=new_entry.role_id,
                run_id=new_entry.run_id,
            )
            await self._repo.create_entry_async(entry=new_entry)
            new_ids.append(new_id)

            updated_src = src.model_copy(
                update={
                    "status": MemoryEntryStatus.SUPERSEDED,
                    "superseded_by_id": new_id,
                    "updated_at": now,
                }
            )
            await self._repo.update_entry_async(src.id, entry=updated_src)
            await self._delete_index_entry_async(src)
            superseded_ids.append(src.id)

        return MemoryConsolidationResult(
            source_entry_count=result.total_count,
            consolidated_entry_count=len(new_ids),
            superseded_entry_ids=tuple(superseded_ids),
            new_entry_ids=tuple(new_ids),
        )

    async def _consolidate_semantic_async(
        self, request: MemoryConsolidationRequest
    ) -> MemoryConsolidationResult:
        """Run semantic (LLM-driven) consolidation.

        Extracts structured memory entries from the conversation history
        of the source run.  Falls back to structural consolidation when
        the LLM provider is not available or the extraction fails.
        """
        llm_provider = self._llm_provider_resolver()
        if llm_provider is None:
            LOGGER.warning(
                "SEMANTIC consolidation requested but no llm_provider configured;"
                " falling back to STRUCTURAL"
            )
            return await self._consolidate_structural_async(request)
        if self._message_repo is None:
            LOGGER.warning(
                "SEMANTIC consolidation requires message_repo but none is"
                " configured; falling back to STRUCTURAL"
            )
            return await self._consolidate_structural_async(request)

        extraction = await extract_semantic_memory_entries_async(
            request=request,
            llm_provider=llm_provider,
            message_repo=self._message_repo,
            event_log=self._event_log,
        )
        if extraction.fallback_to_structural:
            return await self._consolidate_structural_async(request)

        now = datetime.now(tz=timezone.utc)
        new_ids: list[str] = []
        source_ref = f"semantic:{request.source_run_id}"
        for extracted in extraction.entries:
            semantic_key = _semantic_key(
                kind=extracted.kind,
                title=extracted.title,
                body=extracted.body,
            )
            duplicate = await self._find_semantic_duplicate_async(
                workspace_id=request.workspace_id,
                tier=request.target_tier,
                scope=request.target_scope,
                session_id=request.session_id,
                role_id=request.role_id,
                kind=extracted.kind,
                title=extracted.title,
                body=extracted.body,
                semantic_key=semantic_key,
            )
            if duplicate is not None:
                await self._merge_semantic_duplicate_async(
                    duplicate=duplicate,
                    source_run_id=request.source_run_id,
                    semantic_key=semantic_key,
                    context=extracted.context,
                    outcome=extracted.outcome,
                    tags=extracted.tags,
                    confidence_score=extracted.confidence_score,
                )
                LOGGER.info(
                    "Merged duplicate semantic memory workspace=%s run=%s kind=%s",
                    request.workspace_id,
                    request.source_run_id,
                    extracted.kind.value,
                )
                continue

            memory_id = generate_memory_id()
            entry = MemoryEntry(
                id=memory_id,
                tier=request.target_tier,
                scope=request.target_scope,
                workspace_id=request.workspace_id,
                session_id=request.session_id,
                run_id=None,
                role_id=request.role_id,
                kind=extracted.kind,
                status=MemoryEntryStatus.ACTIVE,
                content=MemoryContent(
                    title=extracted.title,
                    body=extracted.body,
                    context=extracted.context,
                    outcome=extracted.outcome,
                ),
                tags=_sanitize_semantic_tags(extracted.tags),
                confidence_score=extracted.confidence_score,
                source=MemorySourceKind.CONSOLIDATION,
                source_ref=source_ref,
                created_at=now,
                updated_at=now,
                expires_at=default_ttl_for_tier(request.target_tier),
                metadata={
                    "semantic_source_run_id": request.source_run_id or "",
                    _SEMANTIC_SOURCE_RUN_IDS_METADATA_KEY: request.source_run_id or "",
                    _SEMANTIC_OBSERVATION_COUNT_METADATA_KEY: "1",
                    _SEMANTIC_LATEST_SOURCE_RUN_ID_METADATA_KEY: request.source_run_id
                    or "",
                    _SEMANTIC_KEY_METADATA_KEY: semantic_key,
                    "semantic_consolidation": "true",
                },
            )
            await self.enforce_capacity_async(
                workspace_id=entry.workspace_id,
                tier=entry.tier,
                scope=entry.scope,
                session_id=entry.session_id,
                role_id=entry.role_id,
                run_id=entry.run_id,
            )
            await self._repo.create_entry_async(entry=entry)
            await self._record_semantic_source_async(
                memory_id=entry.id,
                source_run_id=request.source_run_id,
                confidence_score=entry.confidence_score,
            )
            await self._index_entry_async(entry)
            new_ids.append(memory_id)

        LOGGER.info(
            "Semantic memory consolidation completed workspace=%s run=%s "
            "source_entries=%d created=%d tokens=%d duration_ms=%d",
            request.workspace_id,
            request.source_run_id,
            extraction.source_entry_count,
            len(new_ids),
            extraction.extraction_tokens_used,
            extraction.extraction_duration_ms,
        )
        return MemoryConsolidationResult(
            source_entry_count=extraction.source_entry_count,
            consolidated_entry_count=len(new_ids),
            superseded_entry_ids=(),
            new_entry_ids=tuple(new_ids),
            extraction_tokens_used=extraction.extraction_tokens_used,
            extraction_duration_ms=extraction.extraction_duration_ms,
        )

    @staticmethod
    def _source_tier_for(target_tier: MemoryTier) -> MemoryTier:
        if target_tier == MemoryTier.PERSISTENT:
            return MemoryTier.MEDIUM_TERM
        return MemoryTier.WORKING

    # ------------------------------------------------------------------
    # 6. Forgetting
    # ------------------------------------------------------------------

    async def forget_expired_async(self, now: datetime | None = None) -> int:
        ttl_expired = await self._repo.expire_entries_async(now)
        decay_expired = await self._repo.apply_confidence_decay_async(
            min_confidence=MIN_CONFIDENCE_ACTIVE, now=now
        )
        total_expired = ttl_expired + decay_expired
        await self._delete_index_entries_by_status_async(MemoryEntryStatus.EXPIRED)
        await self._delete_index_entries_by_status_async(MemoryEntryStatus.SUPERSEDED)
        return total_expired

    # ------------------------------------------------------------------
    # 7. Search (FTS5-backed)
    # ------------------------------------------------------------------

    async def search_async(self, request: MemorySearchRequest) -> MemorySearchResult:
        if (
            self._retrieval_service is not None
            and request.status == MemoryEntryStatus.ACTIVE
        ):
            return await self._search_fts_async(request)
        return await self._search_fallback_async(request)

    async def search_global_async(
        self, request: GlobalMemorySearchRequest
    ) -> MemorySearchResult:
        if request.workspace_id is not None:
            return await self.search_async(
                MemorySearchRequest(
                    workspace_id=request.workspace_id,
                    text_query=request.text_query,
                    tier=request.tier,
                    scope=request.scope,
                    session_id=request.session_id,
                    role_id=request.role_id,
                    role_id_is_null=request.role_id_is_null,
                    kind=request.kind,
                    status=request.status,
                    tags=request.tags,
                    min_confidence=request.min_confidence,
                    limit=request.limit,
                )
            )

        text_lower = request.text_query.lower()
        items: list[MemorySearchHit] = []
        total_matches = 0
        rank = 1
        offset = 0
        while True:
            query = MemoryQuery(
                tier=request.tier,
                scope=request.scope,
                session_id=request.session_id,
                role_id=request.role_id,
                role_id_is_null=request.role_id_is_null,
                kind=request.kind,
                status=request.status,
                tags=request.tags,
                min_confidence=request.min_confidence,
                limit=GLOBAL_SEARCH_BATCH_SIZE,
                offset=offset,
            )
            result = await self._repo.query_entries_async(query)
            if not result.items:
                break

            for summary in result.items:
                entry = await self._repo.get_by_id_async(summary.id)
                if entry is None:
                    continue
                searchable_text = "\n".join(
                    (
                        entry.content.title,
                        entry.content.body,
                        entry.content.context,
                        entry.content.outcome,
                    )
                )
                if text_lower not in searchable_text.lower():
                    continue
                total_matches += 1
                if len(items) < request.limit:
                    items.append(
                        MemorySearchHit(
                            entry=summary,
                            score=1.0,
                            rank=rank,
                            snippet=self._build_snippet(
                                entry.content.body,
                                text_lower,
                            ),
                        )
                    )
                rank += 1
            offset += GLOBAL_SEARCH_BATCH_SIZE
            if offset >= result.total_count:
                break
        return MemorySearchResult(items=tuple(items), total_count=total_matches)

    async def _search_fts_async(
        self, request: MemorySearchRequest
    ) -> MemorySearchResult:
        """Query the FTS5 retrieval index and cross-reference with the memory table."""
        assert self._retrieval_service is not None
        items: list[MemorySearchHit] = []
        total_matches = 0
        offset = 0
        seen_document_ids: set[str] = set()
        while True:
            fts_hits = await self._retrieval_service.search_async(
                query=RetrievalQuery(
                    scope_kind=RetrievalScopeKind.MEMORY,
                    scope_id=request.workspace_id,
                    text=request.text_query,
                    limit=FTS_SEARCH_BATCH_SIZE,
                    offset=offset,
                ),
            )
            if not fts_hits:
                break

            new_hit_seen = False
            for hit in fts_hits:
                if hit.document_id in seen_document_ids:
                    continue
                seen_document_ids.add(hit.document_id)
                new_hit_seen = True

                entry = await self._repo.get_by_id_async(hit.document_id)
                if entry is None or not self._entry_matches_search_request(
                    entry, request
                ):
                    continue
                total_matches += 1
                if len(items) >= request.limit:
                    continue

                summary = _entry_to_summary(entry)
                items.append(
                    MemorySearchHit(
                        entry=summary,
                        score=hit.score,
                        rank=hit.rank,
                        snippet=hit.snippet
                        or self._build_snippet(
                            summary.content_body_preview, request.text_query.lower()
                        ),
                    )
                )

            offset += len(fts_hits)
            if len(fts_hits) < FTS_SEARCH_BATCH_SIZE or not new_hit_seen:
                break

        return MemorySearchResult(
            items=tuple(items),
            total_count=total_matches,
        )

    async def _search_fallback_async(
        self, request: MemorySearchRequest
    ) -> MemorySearchResult:
        """Fallback text search when no FTS5 retrieval service is available."""
        items: list[MemorySearchHit] = []
        total_matches = 0
        rank = 1
        offset = 0
        text_lower = request.text_query.lower()
        while True:
            query = MemoryQuery(
                workspace_id=request.workspace_id,
                tier=request.tier,
                scope=request.scope,
                session_id=request.session_id,
                role_id=request.role_id,
                role_id_is_null=request.role_id_is_null,
                kind=request.kind,
                status=request.status,
                tags=request.tags,
                min_confidence=request.min_confidence,
                limit=GLOBAL_SEARCH_BATCH_SIZE,
                offset=offset,
            )
            result = await self._repo.query_entries_async(query)
            if not result.items:
                break

            for summary in result.items:
                entry = await self._repo.get_by_id_async(summary.id)
                if entry is None:
                    continue
                searchable_text = "\n".join(
                    (
                        entry.content.title,
                        entry.content.body,
                        entry.content.context,
                        entry.content.outcome,
                    )
                )
                if text_lower not in searchable_text.lower():
                    continue
                total_matches += 1
                if len(items) < request.limit:
                    items.append(
                        MemorySearchHit(
                            entry=summary,
                            score=1.0,
                            rank=rank,
                            snippet=self._build_snippet(searchable_text, text_lower),
                        )
                    )
                rank += 1

            offset += GLOBAL_SEARCH_BATCH_SIZE
            if offset >= result.total_count:
                break

        return MemorySearchResult(
            items=tuple(items),
            total_count=total_matches,
        )

    @staticmethod
    def _build_snippet(body_preview: str, query_text: str) -> str:
        lower_body = body_preview.lower()
        idx = lower_body.find(query_text)
        if idx == -1:
            return body_preview[:200]
        start = max(0, idx - 50)
        end = min(len(body_preview), idx + len(query_text) + 50)
        prefix = "..." if start > 0 else ""
        suffix = "..." if end < len(body_preview) else ""
        return f"{prefix}{body_preview[start:end]}{suffix}"

    @staticmethod
    def _entry_matches_search_request(
        entry: MemoryEntry,
        request: MemorySearchRequest,
    ) -> bool:
        if entry.workspace_id != request.workspace_id:
            return False
        if request.tier is not None and entry.tier != request.tier:
            return False
        if request.scope is not None and entry.scope != request.scope:
            return False
        if request.session_id is not None and entry.session_id != request.session_id:
            return False
        if request.role_id is not None and entry.role_id != request.role_id:
            return False
        if (
            request.role_id is None
            and request.role_id_is_null
            and entry.role_id is not None
        ):
            return False
        if request.kind is not None and entry.kind != request.kind:
            return False
        if request.status is not None and entry.status != request.status:
            return False
        if entry.confidence_score < request.min_confidence:
            return False
        if request.tags and not all(tag in entry.tags for tag in request.tags):
            return False
        return True

    # ------------------------------------------------------------------
    # FTS5 indexing integration
    # ------------------------------------------------------------------

    async def _index_entry_async(self, entry: MemoryEntry) -> bool:
        """Index a memory entry into the FTS5 retrieval store.

        Silently skips indexing if no retrieval_service is configured or if
        the entry should not be indexed (e.g. non-ACTIVE status).
        """
        if self._retrieval_service is None:
            return False
        if entry.status != MemoryEntryStatus.ACTIVE:
            return False

        scope_id = entry.workspace_id
        config = RetrievalScopeConfig(
            scope_kind=RetrievalScopeKind.MEMORY,
            scope_id=scope_id,
        )
        body_parts = [entry.content.body]
        if entry.content.context:
            body_parts.append(entry.content.context)
        if entry.content.outcome:
            body_parts.append(entry.content.outcome)
        body = "\n".join(body_parts)

        doc = RetrievalDocument(
            scope_kind=RetrievalScopeKind.MEMORY,
            scope_id=scope_id,
            document_id=entry.id,
            title=entry.content.title,
            body=body,
            keywords=_retrieval_keywords(entry),
        )
        try:
            await self._retrieval_service.upsert_documents_async(
                config=config,
                documents=(doc,),
            )
            await self._mark_index_present_async(entry)
            return True
        except (ValueError, OSError, RuntimeError, sqlite3.Error):
            LOGGER.warning(
                "failed to index memory entry %s in FTS5",
                entry.id,
                exc_info=True,
            )
            return False

    async def _mark_index_present_async(self, entry: MemoryEntry) -> None:
        now = datetime.now(tz=timezone.utc)
        await self._repo.mark_entry_index_present_async(
            memory_id=entry.id,
            index_kind=_RETRIEVAL_INDEX_KIND,
            updated_at=now,
        )

    async def _sync_index_entry_async(self, entry: MemoryEntry) -> bool:
        if entry.status == MemoryEntryStatus.ACTIVE:
            return await self._index_entry_async(entry)
        return await self._delete_index_entry_async(entry)

    async def _delete_index_entry_async(
        self,
        entry: MemoryEntry,
        *,
        mark_removed: bool = True,
    ) -> bool:
        return await self._delete_index_entry_ids_async(
            workspace_id=entry.workspace_id,
            memory_ids=(entry.id,),
            mark_removed=mark_removed,
        )

    async def _delete_index_entry_ids_async(
        self,
        *,
        workspace_id: str,
        memory_ids: tuple[str, ...],
        mark_removed: bool = True,
    ) -> bool:
        if self._retrieval_service is None or not memory_ids:
            return False
        try:
            await self._retrieval_service.delete_documents_async(
                scope_kind=RetrievalScopeKind.MEMORY,
                scope_id=workspace_id,
                document_ids=memory_ids,
            )
            if mark_removed:
                await self._mark_index_removed_async(
                    memory_ids=memory_ids,
                )
            return True
        except (ValueError, OSError, RuntimeError, sqlite3.Error):
            LOGGER.warning(
                "failed to delete memory entries from FTS5 index",
                exc_info=True,
            )
            return False

    async def _mark_index_removed_async(
        self,
        *,
        memory_ids: tuple[str, ...],
    ) -> None:
        now = datetime.now(tz=timezone.utc)
        for memory_id in memory_ids:
            await self._repo.mark_entry_index_removed_async(
                memory_id=memory_id,
                index_kind=_RETRIEVAL_INDEX_KIND,
                removed_at=now,
            )

    async def _delete_index_entries_by_status_async(
        self,
        status: MemoryEntryStatus,
    ) -> int:
        if self._retrieval_service is None:
            return 0

        deleted_count = 0
        offset = 0
        while True:
            items = await self._repo.query_entries_needing_index_cleanup_async(
                status=status,
                limit=FTS_SEARCH_BATCH_SIZE,
                offset=offset,
            )
            if not items:
                break

            by_workspace: dict[str, list[str]] = {}
            for summary in items:
                by_workspace.setdefault(summary.workspace_id, []).append(summary.id)

            batch_deleted_count = 0
            for workspace_id, memory_ids in by_workspace.items():
                if await self._delete_index_entry_ids_async(
                    workspace_id=workspace_id,
                    memory_ids=tuple(memory_ids),
                ):
                    deleted_count += len(memory_ids)
                    batch_deleted_count += len(memory_ids)
                    continue
                LOGGER.warning(
                    "memory index cleanup made no progress workspace=%s status=%s",
                    workspace_id,
                    status.value,
                )
            if batch_deleted_count == 0:
                offset += len(items)
                if len(items) == FTS_SEARCH_BATCH_SIZE:
                    continue
                break

            if batch_deleted_count < len(items):
                offset = 0
                continue

            offset = 0
            if len(items) < FTS_SEARCH_BATCH_SIZE:
                break

        return deleted_count

    async def _record_semantic_source_async(
        self,
        *,
        memory_id: str,
        source_run_id: str | None,
        confidence_score: float,
    ) -> None:
        if source_run_id is None:
            return
        await self._repo.record_entry_source_async(
            memory_id=memory_id,
            source_kind=_SEMANTIC_SOURCE_KIND,
            source_ref=source_run_id,
            confidence_score=confidence_score,
            observed_at=datetime.now(tz=timezone.utc),
        )

    async def _find_semantic_duplicate_async(
        self,
        *,
        workspace_id: str,
        tier: MemoryTier,
        scope: MemoryScope,
        session_id: str | None,
        role_id: str | None,
        kind: MemoryEntryKind,
        title: str,
        body: str,
        semantic_key: str,
    ) -> MemoryEntry | None:
        title_key = _normalize_dedup_text(title)
        body_key = _normalize_dedup_text(body)
        body_tokens = _dedup_tokens(body)
        offset = 0
        while True:
            result = await self._repo.query_entries_async(
                MemoryQuery(
                    workspace_id=workspace_id,
                    tier=tier,
                    scope=scope,
                    session_id=session_id,
                    role_id=role_id,
                    kind=kind,
                    status=MemoryEntryStatus.ACTIVE,
                    limit=100,
                    offset=offset,
                )
            )
            for summary in result.items:
                entry = await self._repo.get_by_id_async(summary.id)
                if entry is None:
                    continue
                if entry.metadata.get(_SEMANTIC_KEY_METADATA_KEY) == semantic_key:
                    return entry
                if _normalize_dedup_text(entry.content.title) != title_key:
                    continue
                existing_body = _normalize_dedup_text(entry.content.body)
                if existing_body == body_key:
                    return entry
                if (
                    _jaccard_similarity(_dedup_tokens(entry.content.body), body_tokens)
                    >= 0.8
                ):
                    return entry
            if not result.items:
                break
            offset += len(result.items)
            if offset >= result.total_count:
                break
        return None

    async def _merge_semantic_duplicate_async(
        self,
        *,
        duplicate: MemoryEntry,
        source_run_id: str | None,
        semantic_key: str,
        context: str,
        outcome: str,
        tags: tuple[str, ...],
        confidence_score: float,
    ) -> None:
        existing_source_refs = await self._repo.list_entry_source_refs_async(
            memory_id=duplicate.id,
            source_kind=_SEMANTIC_SOURCE_KIND,
        )
        source_run_ids = _merge_semantic_source_run_ids(
            metadata=duplicate.metadata,
            source_run_id=source_run_id,
            existing_source_refs=existing_source_refs,
        )
        merged_metadata = _merge_semantic_metadata_preserving_existing(
            existing=duplicate.metadata,
            source_run_id=source_run_id,
            source_run_ids=source_run_ids,
            semantic_key=semantic_key,
        )

        now = datetime.now(tz=timezone.utc)
        updated = duplicate.model_copy(
            update={
                "content": MemoryContent(
                    title=duplicate.content.title,
                    body=duplicate.content.body,
                    context=_merge_semantic_text(duplicate.content.context, context),
                    outcome=_merge_semantic_text(duplicate.content.outcome, outcome),
                ),
                "tags": _merge_semantic_tags(duplicate.tags, tags),
                "confidence_score": _merge_semantic_confidence(
                    existing=duplicate.confidence_score,
                    extracted=confidence_score,
                    source_run_id=source_run_id,
                    source_run_ids=source_run_ids,
                ),
                "metadata": merged_metadata,
                "version": duplicate.version + 1,
                "updated_at": now,
            }
        )
        result = await self._repo.update_entry_async(duplicate.id, entry=updated)
        await self._record_semantic_source_async(
            memory_id=duplicate.id,
            source_run_id=source_run_id,
            confidence_score=confidence_score,
        )
        await self._sync_index_entry_async(result)

    # ------------------------------------------------------------------
    # 8. Condensation (placeholder)
    # ------------------------------------------------------------------

    # TODO: FE-2 -- Implement LLM-based condensation. The intended behaviour
    # is to cluster related entries within a workspace, use an LLM call to
    # produce a unified SUMMARY-kind entry, and supersede the source entries.

    def condense(self, workspace_id: str) -> None:
        """Condense verbose memory entries into concise SUMMARY entries.

        This method is reserved for FE-2 which will implement LLM-based
        summarization of related entries within *workspace_id*.  Until then,
        calling this method raises ``NotImplementedError`` to make the
        incomplete state explicit.
        """
        raise NotImplementedError(
            "LLM-based condensation is not yet implemented. "
            "Tracked by FE-2. "
            f"workspace_id={workspace_id}"
        )
