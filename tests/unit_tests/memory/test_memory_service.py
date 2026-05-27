# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import JsonValue

from relay_teams.memory.models import (
    CreateMemoryEntryRequest,
    GlobalMemorySearchRequest,
    MemoryContent,
    MemoryConsolidationRequest,
    MemoryEntryKind,
    MemoryEntryStatus,
    MemoryQuery,
    MemoryScope,
    MemorySearchRequest,
    MemorySearchResult,
    MemorySourceKind,
    MemoryTier,
    UpdateMemoryEntryRequest,
)
from relay_teams.memory.repository import MemoryBankRepository
from relay_teams.memory.service import (
    MemoryBankService,
    _jaccard_similarity,
    _merge_semantic_confidence,
    _merge_semantic_source_run_ids,
    _merge_semantic_text,
    _sanitize_semantic_tags,
    _trim_metadata,
)
from relay_teams.retrieval.retrieval_models import RetrievalHit, RetrievalQuery

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


@pytest.fixture
def service(tmp_path: Path) -> MemoryBankService:
    db_file = tmp_path / "test_memory.db"
    repo = MemoryBankRepository(db_file)
    return MemoryBankService(repository=repo)


def _create_request(**overrides: object) -> CreateMemoryEntryRequest:
    base: dict[str, object] = {
        "tier": MemoryTier.WORKING,
        "scope": MemoryScope.SESSION,
        "workspace_id": "ws-test",
        "session_id": "sess-1",
        "run_id": "run-1",
        "kind": MemoryEntryKind.INSIGHT,
        "content": MemoryContent(title="Discovery", body="Found a useful pattern"),
        "source": MemorySourceKind.TASK_RESULT,
    }
    base.update(overrides)
    return CreateMemoryEntryRequest(**base)  # type: ignore[arg-type]


class _MessageRoleRepo:
    def __init__(self, messages: tuple[dict[str, JsonValue], ...]) -> None:
        self._messages = messages

    async def get_messages_by_session_run_ids_async(
        self,
        session_id: str,
        run_ids: tuple[str, ...],
        *,
        include_cleared: bool = False,
        include_hidden_from_context: bool = False,
    ) -> list[dict[str, JsonValue]]:
        _ = (session_id, run_ids, include_cleared, include_hidden_from_context)
        return list(self._messages)


# ---------------------------------------------------------------------------
# AC-14: Service create
# ---------------------------------------------------------------------------


class TestSemanticHelpers:
    async def test_sanitize_semantic_tags_skips_empty_and_duplicates(self) -> None:
        assert _sanitize_semantic_tags((" API ", "", "api", "Memory")) == (
            "API",
            "Memory",
        )

    async def test_jaccard_similarity_handles_empty_sets(self) -> None:
        assert _jaccard_similarity(frozenset(), frozenset()) == 1.0
        assert _jaccard_similarity(frozenset({"a"}), frozenset()) == 0.0

    async def test_merge_semantic_source_run_ids_preserves_order_and_trims(
        self,
    ) -> None:
        metadata = {
            "semantic_source_run_ids": "run-1, run-2",
            "semantic_source_run_id": "run-3",
        }

        result = _merge_semantic_source_run_ids(
            metadata=metadata,
            source_run_id="run-4",
            existing_source_refs=("run-0", "run-2"),
        )

        assert result == ("run-0", "run-2", "run-1", "run-3", "run-4")

    async def test_merge_semantic_text_handles_empty_and_duplicate_incoming(
        self,
    ) -> None:
        assert _merge_semantic_text("existing", "  ") == "existing"
        assert _merge_semantic_text("  ", "incoming") == "incoming"
        assert _merge_semantic_text("Existing text", "existing") == "Existing text"

    async def test_merge_semantic_confidence_rewards_new_source(self) -> None:
        assert (
            _merge_semantic_confidence(
                existing=0.6,
                extracted=0.7,
                source_run_id="run-2",
                source_run_ids=("run-1", "run-2"),
            )
            == 0.72
        )

    async def test_trim_metadata_preserves_protected_keys_when_full(self) -> None:
        metadata = {f"k{index}": "v" for index in range(30)}
        metadata["semantic_key"] = "protected"

        result = _trim_metadata(metadata)

        assert len(result) == 20
        assert result["semantic_key"] == "protected"


class TestRunRoleInference:
    async def test_infers_role_from_working_memory(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(_create_request(role_id="role-1"))

        role_id = await service.infer_single_run_role_id_async(
            workspace_id="ws-test",
            session_id="sess-1",
            run_id="run-1",
        )

        assert role_id == "role-1"

    async def test_infers_role_from_all_working_memory_pages(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(_create_request(role_id="role-2"))
        for index in range(100):
            await service.create_entry_async(
                _create_request(
                    role_id="role-1",
                    content=MemoryContent(
                        title=f"Discovery {index}",
                        body="Found a useful pattern",
                    ),
                )
            )

        role_id = await service.infer_single_run_role_id_async(
            workspace_id="ws-test",
            session_id="sess-1",
            run_id="run-1",
        )

        assert role_id is None

    async def test_infers_role_from_messages_when_working_memory_missing(
        self, tmp_path: Path
    ) -> None:
        service = MemoryBankService(
            repository=MemoryBankRepository(tmp_path / "messages.db"),
            message_repo=_MessageRoleRepo(
                ({"agent_role_id": "role-from-message"},),
            ),
        )

        role_id = await service.infer_single_run_role_id_async(
            workspace_id="ws-test",
            session_id="sess-1",
            run_id="run-1",
        )

        assert role_id == "role-from-message"

    async def test_infers_role_from_nested_message_when_working_memory_missing(
        self, tmp_path: Path
    ) -> None:
        service = MemoryBankService(
            repository=MemoryBankRepository(tmp_path / "nested-messages.db"),
            message_repo=_MessageRoleRepo(
                ({"message": {"sender_role_id": " nested-role "}},),
            ),
        )

        role_id = await service.infer_single_run_role_id_async(
            workspace_id="ws-test",
            session_id="sess-1",
            run_id="run-1",
        )

        assert role_id == "nested-role"

    async def test_ignores_blank_message_roles(self, tmp_path: Path) -> None:
        service = MemoryBankService(
            repository=MemoryBankRepository(tmp_path / "blank-messages.db"),
            message_repo=_MessageRoleRepo(
                (
                    {"agent_role_id": "   "},
                    {"message": {"role_id": "   "}},
                    {"content": "no role id"},
                ),
            ),
        )

        role_id = await service.infer_single_run_role_id_async(
            workspace_id="ws-test",
            session_id="sess-1",
            run_id="run-1",
        )

        assert role_id is None

    async def test_returns_none_for_ambiguous_message_roles(
        self, tmp_path: Path
    ) -> None:
        service = MemoryBankService(
            repository=MemoryBankRepository(tmp_path / "ambiguous.db"),
            message_repo=_MessageRoleRepo(
                (
                    {"agent_role_id": "role-1"},
                    {"agent_role_id": "role-2"},
                ),
            ),
        )

        role_id = await service.infer_single_run_role_id_async(
            workspace_id="ws-test",
            session_id="sess-1",
            run_id="run-1",
        )

        assert role_id is None


class TestCreateEntry:
    async def test_create_persistent(self, service: MemoryBankService) -> None:
        req = _create_request(
            tier=MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
        )
        entry = await service.create_entry_async(req)
        assert entry.id.startswith("mem-")
        assert entry.tier == MemoryTier.PERSISTENT
        assert entry.confidence_score == 1.0
        assert entry.expires_at is None  # persistent has no TTL

    async def test_create_working_has_ttl(self, service: MemoryBankService) -> None:
        req = _create_request()
        entry = await service.create_entry_async(req)
        assert entry.expires_at is not None
        assert entry.expires_at > datetime.now(tz=timezone.utc)

    async def test_create_with_tags(self, service: MemoryBankService) -> None:
        req = _create_request(tags=("python", "pydantic"))
        entry = await service.create_entry_async(req)
        assert entry.tags == ("python", "pydantic")


# ---------------------------------------------------------------------------
# AC-10: Updating
# ---------------------------------------------------------------------------


class TestUpdateEntry:
    async def test_update_increments_version(self, service: MemoryBankService) -> None:
        req = _create_request()
        entry = await service.create_entry_async(req)
        original_updated_at = entry.updated_at

        update = UpdateMemoryEntryRequest(
            content=MemoryContent(title="Updated title", body="Updated body")
        )
        updated = await service.update_entry_async(entry.id, update)
        assert updated is not None
        assert updated.version == 2
        assert updated.content.title == "Updated title"
        assert updated.updated_at >= original_updated_at

    async def test_update_nonexistent_returns_none(
        self, service: MemoryBankService
    ) -> None:
        update = UpdateMemoryEntryRequest(content=MemoryContent(title="X", body="Y"))
        assert await service.update_entry_async("mem-nonexistent", update) is None

    async def test_update_auto_expires_low_confidence(
        self, service: MemoryBankService
    ) -> None:
        req = _create_request()
        entry = await service.create_entry_async(req)

        update = UpdateMemoryEntryRequest(confidence_score=0.1)
        updated = await service.update_entry_async(entry.id, update)
        assert updated is not None
        assert updated.status == MemoryEntryStatus.EXPIRED


# ---------------------------------------------------------------------------
# AC-9: Consolidation
# ---------------------------------------------------------------------------


class TestConsolidation:
    async def test_consolidate_working_to_medium_term(
        self, service: MemoryBankService
    ) -> None:
        req = _create_request()
        await service.create_entry_async(req)

        result = await service.consolidate_async(
            MemoryConsolidationRequest(
                workspace_id="ws-test",
                session_id="sess-1",
                target_tier=MemoryTier.MEDIUM_TERM,
                target_scope=MemoryScope.SESSION,
            )
        )
        assert result.source_entry_count >= 1
        assert result.consolidated_entry_count >= 1
        assert len(result.new_entry_ids) >= 1
        assert len(result.superseded_entry_ids) >= 1

    async def test_consolidate_working_to_medium_term_filters_source_run(
        self, service: MemoryBankService
    ) -> None:
        first = await service.create_entry_async(_create_request(run_id="run-1"))
        second = await service.create_entry_async(
            _create_request(
                run_id="run-2",
                content=MemoryContent(title="Second run", body="Keep separate"),
            )
        )

        result = await service.consolidate_async(
            MemoryConsolidationRequest(
                workspace_id="ws-test",
                session_id="sess-1",
                source_run_id="run-1",
                target_tier=MemoryTier.MEDIUM_TERM,
                target_scope=MemoryScope.SESSION,
            )
        )
        first_after = await service.get_entry_async(first.id)
        second_after = await service.get_entry_async(second.id)

        assert result.consolidated_entry_count == 1
        assert result.superseded_entry_ids == (first.id,)
        assert first_after is not None
        assert first_after.status == MemoryEntryStatus.SUPERSEDED
        assert second_after is not None
        assert second_after.status == MemoryEntryStatus.ACTIVE

    async def test_structural_consolidation_preserves_session_role_id(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(role_id="role-1", source_ref="task-ref")
        )

        result = await service.consolidate_async(
            MemoryConsolidationRequest(
                workspace_id="ws-test",
                session_id="sess-1",
                target_tier=MemoryTier.MEDIUM_TERM,
                target_scope=MemoryScope.SESSION,
            )
        )
        promoted = await service.get_entry_async(result.new_entry_ids[0])

        assert promoted is not None
        assert promoted.role_id == "role-1"
        assert promoted.source == MemorySourceKind.CONSOLIDATION
        assert (
            promoted.metadata["original_source"] == MemorySourceKind.TASK_RESULT.value
        )
        assert promoted.metadata["original_source_ref"] == "task-ref"
        assert promoted.metadata["consolidated_from_memory_id"]

    async def test_structural_consolidation_preserves_root_source_metadata(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(role_id="role-1", source_ref="task-ref")
        )
        medium_result = await service.consolidate_async(
            MemoryConsolidationRequest(
                workspace_id="ws-test",
                session_id="sess-1",
                target_tier=MemoryTier.MEDIUM_TERM,
                target_scope=MemoryScope.SESSION,
            )
        )

        persistent_result = await service.consolidate_async(
            MemoryConsolidationRequest(
                workspace_id="ws-test",
                session_id="sess-1",
                target_tier=MemoryTier.PERSISTENT,
                target_scope=MemoryScope.SESSION,
            )
        )
        medium_entry = await service.get_entry_async(medium_result.new_entry_ids[0])
        persistent_entry = await service.get_entry_async(
            persistent_result.new_entry_ids[0]
        )

        assert medium_entry is not None
        assert persistent_entry is not None
        assert (
            persistent_entry.metadata["original_source"]
            == MemorySourceKind.TASK_RESULT.value
        )
        assert persistent_entry.metadata["original_source_ref"] == "task-ref"
        assert (
            persistent_entry.metadata["consolidated_from_memory_id"] == medium_entry.id
        )

    async def test_structural_consolidation_filters_tags(
        self, service: MemoryBankService
    ) -> None:
        tagged = await service.create_entry_async(
            _create_request(
                tags=("keep",), content=MemoryContent(title="Keep", body="A")
            )
        )
        other = await service.create_entry_async(
            _create_request(
                tags=("skip",), content=MemoryContent(title="Skip", body="B")
            )
        )

        result = await service.consolidate_async(
            MemoryConsolidationRequest(
                workspace_id="ws-test",
                session_id="sess-1",
                target_tier=MemoryTier.MEDIUM_TERM,
                target_scope=MemoryScope.SESSION,
                filter_tags=("keep",),
            )
        )
        tagged_after = await service.get_entry_async(tagged.id)
        other_after = await service.get_entry_async(other.id)

        assert result.superseded_entry_ids == (tagged.id,)
        assert tagged_after is not None
        assert tagged_after.status == MemoryEntryStatus.SUPERSEDED
        assert other_after is not None
        assert other_after.status == MemoryEntryStatus.ACTIVE

    async def test_consolidate_target_cannot_be_working(
        self, service: MemoryBankService
    ) -> None:
        with pytest.raises(Exception):
            await service.consolidate_async(
                MemoryConsolidationRequest(
                    workspace_id="ws-test",
                    target_tier=MemoryTier.WORKING,
                    target_scope=MemoryScope.WORKSPACE,
                )
            )


# ---------------------------------------------------------------------------
# Forgetting
# ---------------------------------------------------------------------------


class TestForgetting:
    async def test_forget_expired(self, service: MemoryBankService) -> None:
        req = _create_request()
        entry = await service.create_entry_async(req)

        # Manually set expires_at to past
        past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        update = UpdateMemoryEntryRequest(expires_at=past)
        await service.update_entry_async(entry.id, update)

        count = await service.forget_expired_async()
        assert count >= 1

        loaded = await service.get_entry_async(entry.id)
        assert loaded is not None
        assert loaded.status == MemoryEntryStatus.EXPIRED


# ---------------------------------------------------------------------------
# Search (stub)
# ---------------------------------------------------------------------------


class TestSearch:
    async def test_search_finds_match(self, service: MemoryBankService) -> None:
        req = _create_request(
            content=MemoryContent(
                title="Pydantic validation", body="Uses Pydantic v2 models"
            )
        )
        await service.create_entry_async(req)
        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-test",
                text_query="pydantic",
            )
        )
        assert result.total_count >= 1
        assert "pydantic" in result.items[0].entry.content_title.lower()

    async def test_search_no_match(self, service: MemoryBankService) -> None:
        req = _create_request()
        await service.create_entry_async(req)
        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-test",
                text_query="xyznonexistent",
            )
        )
        assert result.total_count == 0

    async def test_global_search_finds_entries_across_workspaces(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(
                workspace_id="ws-alpha",
                content=MemoryContent(
                    title="Shared constraint",
                    body="Prefer explicit Pydantic models for contracts",
                ),
            )
        )
        await service.create_entry_async(
            _create_request(
                workspace_id="ws-beta",
                content=MemoryContent(
                    title="Runtime note",
                    body="Pydantic validation should stay strict",
                ),
            )
        )

        result = await service.search_global_async(
            GlobalMemorySearchRequest(text_query="pydantic", limit=10)
        )

        assert result.total_count == 2
        assert {hit.entry.workspace_id for hit in result.items} == {
            "ws-alpha",
            "ws-beta",
        }

    async def test_global_search_delegates_when_workspace_is_supplied(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(
                workspace_id="ws-alpha",
                content=MemoryContent(title="Alpha note", body="Alpha Pydantic rule"),
            )
        )
        await service.create_entry_async(
            _create_request(
                workspace_id="ws-beta",
                content=MemoryContent(title="Beta note", body="Beta Pydantic rule"),
            )
        )

        result = await service.search_global_async(
            GlobalMemorySearchRequest(
                workspace_id="ws-alpha",
                text_query="pydantic",
                limit=10,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.workspace_id == "ws-alpha"

    async def test_global_search_preserves_workspace_global_filter(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(
                workspace_id="ws-alpha",
                role_id="role-specific",
                content=MemoryContent(
                    title="Role Pydantic note",
                    body="Pydantic role-specific rule",
                ),
            )
        )
        global_entry = await service.create_entry_async(
            _create_request(
                workspace_id="ws-alpha",
                role_id=None,
                content=MemoryContent(
                    title="Global Pydantic note",
                    body="Pydantic workspace-global rule",
                ),
            )
        )

        result = await service.search_global_async(
            GlobalMemorySearchRequest(
                workspace_id="ws-alpha",
                text_query="pydantic",
                role_id_is_null=True,
                limit=10,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.id == global_entry.id

    async def test_fallback_search_applies_workspace_global_filter(
        self, service: MemoryBankService
    ) -> None:
        for index in range(3):
            await service.create_entry_async(
                _create_request(
                    workspace_id="ws-alpha",
                    role_id=f"role-{index}",
                    content=MemoryContent(
                        title=f"Role Pydantic note {index}",
                        body="Pydantic role-specific rule",
                    ),
                )
            )
        global_entry = await service.create_entry_async(
            _create_request(
                workspace_id="ws-alpha",
                role_id=None,
                content=MemoryContent(
                    title="Global Pydantic note",
                    body="Pydantic workspace-global rule",
                ),
            )
        )

        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-alpha",
                text_query="pydantic",
                role_id_is_null=True,
                limit=10,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.id == global_entry.id

    async def test_global_search_scans_full_body_beyond_preview(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                session_id=None,
                run_id=None,
                content=MemoryContent(
                    title="Deep body note",
                    body=f"{'x' * 240} pydantic-contract-tail",
                ),
            )
        )

        result = await service.search_global_async(
            GlobalMemorySearchRequest(text_query="pydantic-contract-tail", limit=10)
        )

        assert result.total_count == 1
        assert result.items[0].entry.content_title == "Deep body note"
        assert "pydantic-contract-tail" in result.items[0].snippet

    async def test_global_search_scans_past_first_page(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                workspace_id="ws-old-match",
                session_id=None,
                run_id=None,
                content=MemoryContent(
                    title="Older global match",
                    body="global-memory-needle",
                ),
            )
        )
        for index in range(105):
            await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    workspace_id=f"ws-newer-{index}",
                    session_id=None,
                    run_id=None,
                    content=MemoryContent(
                        title=f"Newer note {index}",
                        body="unrelated memory body",
                    ),
                )
            )

        result = await service.search_global_async(
            GlobalMemorySearchRequest(text_query="global-memory-needle", limit=10)
        )

        assert result.total_count == 1
        assert result.items[0].entry.workspace_id == "ws-old-match"

    async def test_global_search_honors_non_active_status(
        self, service: MemoryBankService
    ) -> None:
        entry = await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                session_id=None,
                run_id=None,
                content=MemoryContent(
                    title="Retired memory",
                    body="retired-memory-needle",
                ),
            )
        )
        await service.update_entry_async(
            entry.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )

        active_result = await service.search_global_async(
            GlobalMemorySearchRequest(text_query="retired-memory-needle", limit=10)
        )
        expired_result = await service.search_global_async(
            GlobalMemorySearchRequest(
                text_query="retired-memory-needle",
                status=MemoryEntryStatus.EXPIRED,
                limit=10,
            )
        )

        assert active_result.total_count == 0
        assert expired_result.total_count == 1
        assert expired_result.items[0].entry.status == MemoryEntryStatus.EXPIRED

    async def test_workspace_search_non_active_status_scans_full_body(
        self, service: MemoryBankService
    ) -> None:
        needle = "workspace-expired-memory-needle"
        entry = await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                session_id=None,
                run_id=None,
                content=MemoryContent(
                    title="Retired workspace memory",
                    body=f"{'x' * 240} {needle}",
                ),
            )
        )
        await service.update_entry_async(
            entry.id,
            UpdateMemoryEntryRequest(status=MemoryEntryStatus.EXPIRED),
        )

        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-test",
                text_query=needle,
                status=MemoryEntryStatus.EXPIRED,
                limit=10,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.id == entry.id
        assert needle in result.items[0].snippet

    async def test_workspace_search_fallback_honors_tags(
        self, service: MemoryBankService
    ) -> None:
        await service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Tagged", body="shared tagged body"),
                tags=("keep",),
            )
        )
        await service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Untagged", body="shared tagged body"),
                tags=("skip",),
            )
        )

        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-test",
                text_query="shared tagged body",
                tags=("keep",),
                limit=10,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.tags == ("keep",)


# ---------------------------------------------------------------------------
# Get / List / Delete
# ---------------------------------------------------------------------------


class TestGetListDelete:
    async def test_get_existing(self, service: MemoryBankService) -> None:
        req = _create_request()
        entry = await service.create_entry_async(req)
        loaded = await service.get_entry_async(entry.id)
        assert loaded is not None
        assert loaded.id == entry.id

    async def test_get_nonexistent(self, service: MemoryBankService) -> None:
        assert await service.get_entry_async("mem-none") is None

    async def test_list_entries(self, service: MemoryBankService) -> None:
        await service.create_entry_async(_create_request())
        result = await service.list_entries_async(MemoryQuery(workspace_id="ws-test"))
        assert result.total_count >= 1

    async def test_delete_entry(self, service: MemoryBankService) -> None:
        req = _create_request()
        entry = await service.create_entry_async(req)
        assert await service.delete_entry_async(entry.id) is True
        assert await service.get_entry_async(entry.id) is None


# ---------------------------------------------------------------------------
# FTS5 search
# ---------------------------------------------------------------------------


class TestSearchFTS5:
    """Tests for the search method covering both FTS5-backed and fallback paths."""

    async def test_search_method_exists(self, service: MemoryBankService) -> None:
        """The search method must be callable and return MemorySearchResult."""
        req = _create_request()
        await service.create_entry_async(req)
        result = await service.search_async(
            MemorySearchRequest(workspace_id="ws-test", text_query="pattern")
        )
        assert isinstance(result, MemorySearchResult)
        assert result.total_count >= 0

    async def test_search_without_retrieval_service_uses_fallback(
        self, service: MemoryBankService
    ) -> None:
        """When no retrieval_service is configured, fallback LIKE search is used."""
        assert service._retrieval_service is None
        req = _create_request(
            content=MemoryContent(
                title="Pydantic patterns", body="Advanced Pydantic v2 usage"
            )
        )
        await service.create_entry_async(req)
        result = await service.search_async(
            MemorySearchRequest(workspace_id="ws-test", text_query="pydantic")
        )
        assert result.total_count >= 1
        hit = result.items[0]
        assert hit.score == 1.0
        assert hit.rank >= 1
        assert "pydantic" in hit.entry.content_title.lower()

    async def test_index_entry_uses_tags_as_keywords(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "indexed.db")
        mock_retrieval = MagicMock()
        mock_retrieval.upsert_documents_async = AsyncMock()
        service = MemoryBankService(
            repository=repo,
            retrieval_service=mock_retrieval,
        )

        await service.create_entry_async(
            _create_request(
                tags=("api",),
                source=MemorySourceKind.MANUAL,
                content=MemoryContent(title="Indexed memory", body="Body"),
            )
        )
        document = mock_retrieval.upsert_documents_async.call_args.kwargs["documents"][
            0
        ]

        assert document.keywords == ("api",)

    async def test_search_with_retrieval_service_uses_fts(
        self, service: MemoryBankService
    ) -> None:
        """When a retrieval_service IS configured, the FTS5 path is used."""
        # Create entry first so summary data exists
        req = _create_request(
            content=MemoryContent(title="FastAPI tips", body="Use dependency injection")
        )
        entry = await service.create_entry_async(req)

        # Build a mock retrieval service
        mock_retrieval = MagicMock()
        mock_retrieval.search_async = AsyncMock(
            return_value=[
                RetrievalHit(
                    document_id=entry.id,
                    title="FastAPI tips",
                    snippet="...FastAPI...",
                    score=0.85,
                    rank=1,
                )
            ]
        )
        service._retrieval_service = mock_retrieval

        result = await service.search_async(
            MemorySearchRequest(workspace_id="ws-test", text_query="fastapi")
        )
        assert result.total_count >= 1
        assert result.items[0].entry.id == entry.id
        assert result.items[0].score == 0.85

    async def test_search_fts_loads_hits_by_document_id(
        self, service: MemoryBankService
    ) -> None:
        older = await service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Older match", body="needle in older row"),
            )
        )
        await service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Newer miss", body="unrelated newest row"),
            )
        )
        mock_retrieval = MagicMock()
        mock_retrieval.search_async = AsyncMock(
            return_value=[
                RetrievalHit(
                    document_id=older.id,
                    title="Older match",
                    snippet="needle",
                    score=0.9,
                    rank=1,
                )
            ]
        )
        service._retrieval_service = mock_retrieval

        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-test",
                text_query="needle",
                limit=1,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.id == older.id

    async def test_search_fts_honors_tags(self, service: MemoryBankService) -> None:
        keep = await service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Keep", body="shared retrieval body"),
                tags=("keep",),
            )
        )
        skip = await service.create_entry_async(
            _create_request(
                content=MemoryContent(title="Skip", body="shared retrieval body"),
                tags=("skip",),
            )
        )
        mock_retrieval = MagicMock()
        mock_retrieval.search_async = AsyncMock(
            return_value=[
                RetrievalHit(
                    document_id=skip.id,
                    title="Skip",
                    snippet="shared",
                    score=0.95,
                    rank=1,
                ),
                RetrievalHit(
                    document_id=keep.id,
                    title="Keep",
                    snippet="shared",
                    score=0.9,
                    rank=2,
                ),
            ]
        )
        service._retrieval_service = mock_retrieval

        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-test",
                text_query="shared",
                tags=("keep",),
                limit=10,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.id == keep.id

    async def test_search_fts_pages_before_applying_filters(
        self, service: MemoryBankService
    ) -> None:
        skip_entries = []
        for index in range(100):
            skip_entries.append(
                await service.create_entry_async(
                    _create_request(
                        tier=MemoryTier.PERSISTENT,
                        scope=MemoryScope.WORKSPACE,
                        session_id=None,
                        run_id=None,
                        content=MemoryContent(
                            title=f"Skip {index}",
                            body="shared retrieval body",
                        ),
                        tags=("skip",),
                    )
                )
            )
        keep = await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                session_id=None,
                run_id=None,
                content=MemoryContent(title="Keep", body="shared retrieval body"),
                tags=("keep",),
            )
        )
        raw_hits = tuple(
            RetrievalHit(
                document_id=entry.id,
                title=entry.content.title,
                snippet="shared",
                score=1.0 - (index * 0.001),
                rank=index + 1,
            )
            for index, entry in enumerate((*skip_entries, keep))
        )
        captured_queries: list[RetrievalQuery] = []

        async def search_async(
            *,
            query: RetrievalQuery,
        ) -> tuple[RetrievalHit, ...]:
            captured_queries.append(query)
            return raw_hits[query.offset : query.offset + query.limit]

        mock_retrieval = MagicMock()
        mock_retrieval.search_async = AsyncMock(side_effect=search_async)
        service._retrieval_service = mock_retrieval

        result = await service.search_async(
            MemorySearchRequest(
                workspace_id="ws-test",
                text_query="shared",
                tags=("keep",),
                limit=1,
            )
        )

        assert result.total_count == 1
        assert result.items[0].entry.id == keep.id
        assert [query.offset for query in captured_queries] == [0, 100]
        assert {query.limit for query in captured_queries} == {100}

    async def test_search_fts_no_hits_returns_empty(
        self, service: MemoryBankService
    ) -> None:
        """FTS5 path with zero hits returns empty result."""
        mock_retrieval = MagicMock()
        mock_retrieval.search_async = AsyncMock(return_value=[])
        service._retrieval_service = mock_retrieval

        result = await service.search_async(
            MemorySearchRequest(workspace_id="ws-test", text_query="nope")
        )
        assert result.total_count == 0
        assert len(result.items) == 0

    async def test_build_snippet_short_body(self) -> None:
        """_build_snippet returns body preview when query not found."""
        result = MemoryBankService._build_snippet("Short body text", "missing")
        assert result == "Short body text"

    async def test_build_snippet_highlights_match(self) -> None:
        """_build_snippet extracts context around the match."""
        body = "A" * 100 + "TARGET" + "B" * 100
        result = MemoryBankService._build_snippet(body, "target")
        assert "TARGET" in result


# ---------------------------------------------------------------------------
# Capacity limit enforcement
# ---------------------------------------------------------------------------


class TestCapacityEnforcement:
    """Tests for enforce_capacity which prunes oldest entries when limits exceeded."""

    async def test_enforce_capacity_returns_zero_when_below_limit(
        self, service: MemoryBankService
    ) -> None:
        """No pruning when entry count is below the capacity limit."""
        pruned = await service.enforce_capacity_async(
            workspace_id="ws-test",
            tier=MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
        )
        # We have 0 persistent entries, well below 2000 limit
        assert pruned == 0

    async def test_enforce_capacity_prunes_working_entries(
        self, service: MemoryBankService
    ) -> None:
        """When WORKING entries exceed MAX_WORKING_PER_RUN limit, oldest are pruned."""
        from relay_teams.memory.memory_defaults import MAX_WORKING_PER_RUN

        # Create enough entries to hit the limit (using unique run_id)
        run_id = "run-cap-test"
        for i in range(MAX_WORKING_PER_RUN + 1):
            req = _create_request(run_id=run_id)
            await service.create_entry_async(req)

        # Verify capacity enforcement happened during create
        result = await service.list_entries_async(
            MemoryQuery(
                workspace_id="ws-test",
                tier=MemoryTier.WORKING,
                status=MemoryEntryStatus.ACTIVE,
                limit=100,
            )
        )
        active_count = result.total_count
        assert active_count <= MAX_WORKING_PER_RUN

    async def test_enforce_capacity_does_not_affect_different_tier(
        self, service: MemoryBankService
    ) -> None:
        """Creating many WORKING entries should not prune PERSISTENT entries."""
        # Create a persistent entry
        req_p = _create_request(
            tier=MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
        )
        persistent = await service.create_entry_async(req_p)

        # Create many working entries
        for i in range(10):
            req_w = _create_request(run_id=f"run-{i}")
            await service.create_entry_async(req_w)

        # Persistent entry should still exist and be active
        loaded = await service.get_entry_async(persistent.id)
        assert loaded is not None
        assert loaded.status == MemoryEntryStatus.ACTIVE
        assert loaded.tier == MemoryTier.PERSISTENT

    async def test_enforce_capacity_prunes_by_age(
        self, service: MemoryBankService
    ) -> None:
        """When PERSISTENT entries exceed capacity, oldest are expired first."""
        from relay_teams.memory import memory_defaults

        original_limit = memory_defaults.MAX_PERSISTENT_PER_WORKSPACE
        try:
            # Set a very low limit for testing
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = 3
            ids: list[str] = []
            for i in range(5):
                req = _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                )
                entry = await service.create_entry_async(req)
                ids.append(entry.id)

            # Count active entries -- should be <= 3
            result = await service.list_entries_async(
                MemoryQuery(
                    workspace_id="ws-test",
                    tier=MemoryTier.PERSISTENT,
                    status=MemoryEntryStatus.ACTIVE,
                    limit=100,
                )
            )
            assert result.total_count <= 3
        finally:
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = original_limit

    async def test_persistent_capacity_counts_all_scopes(
        self, service: MemoryBankService
    ) -> None:
        """Persistent capacity is workspace-wide, not scoped by role/workspace scope."""
        from relay_teams.memory import memory_defaults

        original_limit = memory_defaults.MAX_PERSISTENT_PER_WORKSPACE
        try:
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = 1
            workspace_entry = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    run_id=None,
                    role_id=None,
                )
            )
            role_entry = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.ROLE,
                    run_id=None,
                    role_id="role-1",
                )
            )

            loaded_workspace = await service.get_entry_async(workspace_entry.id)
            loaded_role = await service.get_entry_async(role_entry.id)
            result = await service.list_entries_async(
                MemoryQuery(
                    workspace_id="ws-test",
                    tier=MemoryTier.PERSISTENT,
                    status=MemoryEntryStatus.ACTIVE,
                    limit=10,
                )
            )

            assert loaded_workspace is not None
            assert loaded_workspace.status == MemoryEntryStatus.EXPIRED
            assert loaded_role is not None
            assert loaded_role.status == MemoryEntryStatus.ACTIVE
            assert result.total_count == 1
        finally:
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = original_limit

    async def test_working_capacity_counts_all_scopes_for_run(
        self, service: MemoryBankService
    ) -> None:
        from relay_teams.memory import memory_defaults

        original_limit = memory_defaults.MAX_WORKING_PER_RUN
        try:
            memory_defaults.MAX_WORKING_PER_RUN = 1
            workspace_entry = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.WORKING,
                    scope=MemoryScope.WORKSPACE,
                    run_id="run-cross-scope",
                    role_id=None,
                )
            )
            role_entry = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.WORKING,
                    scope=MemoryScope.ROLE,
                    run_id="run-cross-scope",
                    role_id="role-1",
                )
            )

            loaded_workspace = await service.get_entry_async(workspace_entry.id)
            loaded_role = await service.get_entry_async(role_entry.id)

            assert loaded_workspace is not None
            assert loaded_workspace.status == MemoryEntryStatus.EXPIRED
            assert loaded_role is not None
            assert loaded_role.status == MemoryEntryStatus.ACTIVE
        finally:
            memory_defaults.MAX_WORKING_PER_RUN = original_limit

    async def test_medium_term_capacity_counts_all_scopes_for_session_role(
        self, service: MemoryBankService
    ) -> None:
        from relay_teams.memory import memory_defaults

        original_limit = memory_defaults.MAX_MEDIUM_TERM_PER_SESSION_ROLE
        try:
            memory_defaults.MAX_MEDIUM_TERM_PER_SESSION_ROLE = 1
            session_entry = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.MEDIUM_TERM,
                    scope=MemoryScope.SESSION,
                    session_id="sess-cross-scope",
                    run_id=None,
                    role_id="role-1",
                )
            )
            role_entry = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.MEDIUM_TERM,
                    scope=MemoryScope.ROLE,
                    session_id="sess-cross-scope",
                    run_id=None,
                    role_id="role-1",
                )
            )

            loaded_session = await service.get_entry_async(session_entry.id)
            loaded_role = await service.get_entry_async(role_entry.id)

            assert loaded_session is not None
            assert loaded_session.status == MemoryEntryStatus.EXPIRED
            assert loaded_role is not None
            assert loaded_role.status == MemoryEntryStatus.ACTIVE
        finally:
            memory_defaults.MAX_MEDIUM_TERM_PER_SESSION_ROLE = original_limit

    async def test_enforce_capacity_deletes_index_only_for_expired_ids(
        self,
        service: MemoryBankService,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        from relay_teams.memory import memory_defaults

        for index in range(3):
            await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    content=MemoryContent(
                        title=f"Persistent {index}",
                        body="capacity pruning",
                    ),
                )
            )
        deleted_ids: tuple[str, ...] = ()

        async def expire_only_first(
            *,
            memory_ids: tuple[str, ...],
        ) -> tuple[str, ...]:
            return memory_ids[:1]

        async def record_deleted_ids(
            *,
            workspace_id: str,
            memory_ids: tuple[str, ...],
        ) -> int:
            nonlocal deleted_ids
            assert workspace_id == "ws-test"
            deleted_ids = memory_ids
            return len(memory_ids)

        monkeypatch.setattr(
            service._repo,
            "expire_entry_ids_returning_async",
            expire_only_first,
        )
        monkeypatch.setattr(
            service,
            "_delete_index_entry_ids_async",
            record_deleted_ids,
        )
        original_limit = memory_defaults.MAX_PERSISTENT_PER_WORKSPACE
        try:
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = 1

            pruned = await service.enforce_capacity_async(
                workspace_id="ws-test",
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
            )

            assert pruned == 1
            assert len(deleted_ids) == 1
        finally:
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = original_limit

    async def test_enforce_capacity_prunes_low_confidence_before_age(
        self, service: MemoryBankService
    ) -> None:
        """Capacity pruning prefers lower-confidence entries before older entries."""
        from relay_teams.memory import memory_defaults

        original_limit = memory_defaults.MAX_PERSISTENT_PER_WORKSPACE
        try:
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = 2
            high_conf_old = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    confidence_score=0.95,
                )
            )
            low_conf_old = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    confidence_score=0.4,
                )
            )
            await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    confidence_score=0.9,
                )
            )

            loaded_high = await service.get_entry_async(high_conf_old.id)
            loaded_low = await service.get_entry_async(low_conf_old.id)

            assert loaded_high is not None
            assert loaded_high.status == MemoryEntryStatus.ACTIVE
            assert loaded_low is not None
            assert loaded_low.status == MemoryEntryStatus.EXPIRED
        finally:
            memory_defaults.MAX_PERSISTENT_PER_WORKSPACE = original_limit

    async def test_medium_term_capacity_is_scoped_to_session(
        self, service: MemoryBankService
    ) -> None:
        """Medium-term capacity should not prune other sessions in a workspace."""
        from relay_teams.memory import memory_defaults

        original_limit = memory_defaults.MAX_MEDIUM_TERM_PER_SESSION_ROLE
        try:
            memory_defaults.MAX_MEDIUM_TERM_PER_SESSION_ROLE = 2
            other_session = await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.MEDIUM_TERM,
                    scope=MemoryScope.SESSION,
                    session_id="sess-other",
                    run_id=None,
                )
            )
            current_session_ids: list[str] = []
            for index in range(3):
                entry = await service.create_entry_async(
                    _create_request(
                        tier=MemoryTier.MEDIUM_TERM,
                        scope=MemoryScope.SESSION,
                        session_id="sess-current",
                        run_id=None,
                        content=MemoryContent(
                            title=f"Current {index}",
                            body="Session-scoped capacity",
                        ),
                    )
                )
                current_session_ids.append(entry.id)

            other_loaded = await service.get_entry_async(other_session.id)
            current_result = await service.list_entries_async(
                MemoryQuery(
                    workspace_id="ws-test",
                    tier=MemoryTier.MEDIUM_TERM,
                    scope=MemoryScope.SESSION,
                    session_id="sess-current",
                    status=MemoryEntryStatus.ACTIVE,
                    limit=10,
                )
            )

            assert other_loaded is not None
            assert other_loaded.status == MemoryEntryStatus.ACTIVE
            assert current_result.total_count == 2
            assert current_session_ids[0] not in {
                summary.id for summary in current_result.items
            }
        finally:
            memory_defaults.MAX_MEDIUM_TERM_PER_SESSION_ROLE = original_limit


class TestSemanticDuplicateScan:
    async def test_merge_semantic_duplicate_preserves_full_existing_metadata(
        self, service: MemoryBankService
    ) -> None:
        metadata = {f"user_key_{index:02d}": str(index) for index in range(20)}
        duplicate = await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                run_id=None,
                role_id=None,
                metadata=metadata,
            )
        )

        await service._merge_semantic_duplicate_async(
            duplicate=duplicate,
            source_run_id="run-1",
            semantic_key="decision|test|body",
            context="new context",
            outcome="new outcome",
            tags=("semantic",),
            confidence_score=0.8,
        )

        loaded = await service.get_entry_async(duplicate.id)

        assert loaded is not None
        assert loaded.metadata == metadata
        assert loaded.version == duplicate.version + 1

    async def test_scans_beyond_first_page_for_duplicate(
        self, service: MemoryBankService
    ) -> None:
        duplicate = await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                run_id=None,
                role_id=None,
                content=MemoryContent(
                    title="Stable contract",
                    body="Keep database and API docs updated together.",
                ),
            )
        )
        for index in range(101):
            await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    run_id=None,
                    role_id=None,
                    content=MemoryContent(
                        title=f"Later entry {index}",
                        body=f"Unique memory body {index}",
                    ),
                )
            )

        found = await service._find_semantic_duplicate_async(
            workspace_id="ws-test",
            tier=MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
            session_id="sess-1",
            role_id=None,
            kind=MemoryEntryKind.INSIGHT,
            title="Stable contract",
            body="Keep database and API docs updated together.",
            semantic_key="different-key",
        )

        assert found is not None
        assert found.id == duplicate.id

    async def test_detects_duplicate_by_token_similarity(
        self, service: MemoryBankService
    ) -> None:
        duplicate = await service.create_entry_async(
            _create_request(
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                run_id=None,
                role_id=None,
                content=MemoryContent(
                    title="Stable contract",
                    body="database api docs updated together",
                ),
            )
        )

        found = await service._find_semantic_duplicate_async(
            workspace_id="ws-test",
            tier=MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
            session_id="sess-1",
            role_id=None,
            kind=MemoryEntryKind.INSIGHT,
            title="Stable contract",
            body="database api docs updated together always",
            semantic_key="different-key",
        )

        assert found is not None
        assert found.id == duplicate.id

    async def test_returns_none_when_duplicate_scan_exhausts_pages(
        self, service: MemoryBankService
    ) -> None:
        for index in range(101):
            await service.create_entry_async(
                _create_request(
                    tier=MemoryTier.PERSISTENT,
                    scope=MemoryScope.WORKSPACE,
                    run_id=None,
                    role_id=None,
                    content=MemoryContent(
                        title=f"Unique entry {index}",
                        body=f"Unique body {index}",
                    ),
                )
            )

        found = await service._find_semantic_duplicate_async(
            workspace_id="ws-test",
            tier=MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
            session_id="sess-1",
            role_id=None,
            kind=MemoryEntryKind.INSIGHT,
            title="No match",
            body="No matching body",
            semantic_key="no-match",
        )

        assert found is None

    async def test_patch_entry_metadata_handles_empty_and_missing(
        self, service: MemoryBankService
    ) -> None:
        created = await service.create_entry_async(_create_request())

        unchanged = await service.patch_entry_metadata_async(
            memory_id=created.id,
            workspace_id=created.workspace_id,
            metadata_patch={},
        )
        missing = await service.patch_entry_metadata_async(
            memory_id="missing",
            workspace_id=created.workspace_id,
            metadata_patch={"k": "v"},
        )

        assert unchanged is not None
        assert unchanged.id == created.id
        assert missing is None


# ---------------------------------------------------------------------------
# Condensation (placeholder)
# ---------------------------------------------------------------------------


class TestCondensation:
    async def test_condense_raises_not_implemented(
        self, service: MemoryBankService
    ) -> None:
        """Condensation is a placeholder that raises NotImplementedError."""
        with pytest.raises(NotImplementedError, match="not yet implemented"):
            service.condense("ws-test")
