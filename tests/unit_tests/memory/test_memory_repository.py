# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

from relay_teams.memory.models import (
    MemoryContent,
    MemoryEntry,
    MemoryEntryKind,
    MemoryEntryStatus,
    MemoryQuery,
    MemoryScope,
    MemorySourceKind,
    MemoryTier,
)
from relay_teams.memory.repository import MemoryBankRepository, generate_memory_id
from relay_teams.persistence.sqlite_repository import async_fetchall, async_fetchone

pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_entry(**overrides: object) -> MemoryEntry:
    now = datetime.now(tz=timezone.utc)
    base: dict[str, object] = {
        "id": generate_memory_id(),
        "tier": MemoryTier.PERSISTENT,
        "scope": MemoryScope.WORKSPACE,
        "workspace_id": "ws-test",
        "kind": MemoryEntryKind.FACT,
        "content": MemoryContent(title="Test entry", body="Body content here"),
        "source": MemorySourceKind.MANUAL,
        "created_at": now,
        "updated_at": now,
    }
    base.update(overrides)
    return MemoryEntry(**base)  # type: ignore[arg-type]


@pytest.fixture
def repo(tmp_path: Path) -> MemoryBankRepository:
    db_file = tmp_path / "test_memory.db"
    return MemoryBankRepository(db_file)


# ---------------------------------------------------------------------------
# AC-5: Table created on first use
# ---------------------------------------------------------------------------


class TestSchemaInit:
    async def test_table_created_on_init(self, repo: MemoryBankRepository) -> None:
        row = await repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='memory_entries'",
            )
        )
        assert row is not None

    async def test_indexes_created(self, repo: MemoryBankRepository) -> None:
        rows = await repo._run_async_read(
            lambda conn: async_fetchall(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='index' AND name LIKE 'idx_memory_entries_%'",
            )
        )
        index_names = {str(row["name"]) for row in rows}
        expected = {
            "idx_memory_entries_workspace_tier",
            "idx_memory_entries_workspace_scope",
            "idx_memory_entries_session",
            "idx_memory_entries_role",
            "idx_memory_entries_run",
            "idx_memory_entries_expires",
            "idx_memory_entries_source_ref",
        }
        assert expected == index_names

    async def test_tag_index_table_created(self, repo: MemoryBankRepository) -> None:
        table_row = await repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='memory_entry_tags'",
            )
        )
        index_row = await repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='index' AND name='idx_memory_entry_tags_tag'",
            )
        )

        assert table_row is not None
        assert index_row is not None

    async def test_source_and_index_state_tables_created(
        self, repo: MemoryBankRepository
    ) -> None:
        source_table = await repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='memory_entry_sources'",
            )
        )
        index_state_table = await repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='memory_entry_index_state'",
            )
        )

        assert source_table is not None
        assert index_state_table is not None

    async def test_legacy_role_memories_are_migrated_and_dropped(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "legacy_memory.db"
        with sqlite3.connect(db_file) as conn:
            conn.execute(
                """CREATE TABLE role_memories (
                    role_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    performance_json TEXT NOT NULL DEFAULT '',
                    assessment_state_json TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                )"""
            )
            conn.execute(
                """INSERT INTO role_memories (
                    role_id,
                    workspace_id,
                    content_markdown,
                    performance_json,
                    assessment_state_json,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    "writer",
                    "ws-legacy",
                    "Prefer concise summaries.",
                    '{"total_tasks": 4}',
                    '{"needs": "examples"}',
                    "2026-03-15T08:30:00+00:00",
                ),
            )
            conn.commit()

        migrated_repo = MemoryBankRepository(db_file)
        result = await migrated_repo.query_entries_async(
            MemoryQuery(
                workspace_id="ws-legacy",
                scope=MemoryScope.ROLE,
                role_id="writer",
                limit=10,
            )
        )
        table_row = await migrated_repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='role_memories'",
            )
        )

        assert table_row is None
        assert result.total_count == 3
        assert {item.kind for item in result.items} == {
            MemoryEntryKind.SUMMARY,
            MemoryEntryKind.INSIGHT,
        }
        assert {item.source for item in result.items} == {
            MemorySourceKind.CONSOLIDATION
        }
        assert all(item.tier == MemoryTier.PERSISTENT for item in result.items)
        assert all(item.scope == MemoryScope.ROLE for item in result.items)
        assert all(item.confidence_score == 0.8 for item in result.items)
        assert {tag for item in result.items for tag in item.tags} >= {
            "legacy",
            "role-memory",
            "role-performance",
            "role-assessment",
        }

    async def test_unsupported_legacy_role_memories_table_is_dropped(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "unsupported_legacy_memory.db"
        with sqlite3.connect(db_file) as conn:
            conn.execute(
                """CREATE TABLE role_memories (
                    role_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL
                )"""
            )
            conn.commit()

        migrated_repo = MemoryBankRepository(db_file)
        table_row = await migrated_repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT name FROM sqlite_master "
                "WHERE type='table' AND name='role_memories'",
            )
        )
        result = await migrated_repo.query_entries_async(
            MemoryQuery(workspace_id="ws-legacy", limit=10)
        )

        assert table_row is None
        assert result.total_count == 0

    async def test_legacy_role_memories_skip_blank_ids_and_default_bad_timestamp(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "legacy_memory_bad_timestamp.db"
        with sqlite3.connect(db_file) as conn:
            conn.execute(
                """CREATE TABLE role_memories (
                    role_id TEXT NOT NULL,
                    workspace_id TEXT NOT NULL,
                    content_markdown TEXT NOT NULL,
                    performance_json TEXT NOT NULL DEFAULT '',
                    assessment_state_json TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                )"""
            )
            conn.executemany(
                """INSERT INTO role_memories (
                    role_id,
                    workspace_id,
                    content_markdown,
                    performance_json,
                    assessment_state_json,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    (
                        "",
                        "ws-legacy",
                        "Skip blank role.",
                        "",
                        "",
                        "2026-03-15T08:30:00+00:00",
                    ),
                    (
                        "writer",
                        "ws-legacy",
                        "Use default timestamp.",
                        "",
                        "",
                        "not-a-timestamp",
                    ),
                ),
            )
            conn.commit()

        migrated_repo = MemoryBankRepository(db_file)
        result = await migrated_repo.query_entries_async(
            MemoryQuery(
                workspace_id="ws-legacy",
                scope=MemoryScope.ROLE,
                role_id="writer",
                limit=10,
            )
        )
        loaded = await migrated_repo.get_by_id_async(result.items[0].id)

        assert result.total_count == 1
        assert loaded is not None
        assert loaded.content.body == "Use default timestamp."
        assert loaded.created_at.tzinfo is not None

    async def test_legacy_reflection_source_is_normalized(self, tmp_path: Path) -> None:
        db_file = tmp_path / "legacy_reflection_source.db"
        initial_repo = MemoryBankRepository(db_file)
        entry = _make_entry(id="mem-legacy-source", workspace_id="ws-legacy-source")
        await initial_repo.create_entry_async(entry=entry)
        await initial_repo.close_async()

        with sqlite3.connect(db_file) as conn:
            conn.execute(
                "UPDATE memory_entries SET source='reflection' WHERE memory_id=?",
                (entry.id,),
            )
            conn.commit()

        migrated_repo = MemoryBankRepository(db_file)
        loaded = await migrated_repo.get_by_id_async(entry.id)
        row = await migrated_repo._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT source FROM memory_entries WHERE memory_id=?",
                (entry.id,),
            )
        )

        assert loaded is not None
        assert loaded.source == MemorySourceKind.CONSOLIDATION
        assert row is not None
        assert str(row["source"]) == MemorySourceKind.CONSOLIDATION.value


# ---------------------------------------------------------------------------
# AC-6: CRUD operations
# ---------------------------------------------------------------------------


class TestCRUD:
    async def test_create_and_read(self, repo: MemoryBankRepository) -> None:
        entry = _make_entry()
        await repo.create_entry_async(entry=entry)
        loaded = await repo.get_by_id_async(entry.id)
        assert loaded is not None
        assert loaded.id == entry.id
        assert loaded.content.title == "Test entry"
        assert loaded.tier == MemoryTier.PERSISTENT

    async def test_read_nonexistent_returns_none(
        self, repo: MemoryBankRepository
    ) -> None:
        assert await repo.get_by_id_async("mem-nonexistent") is None

    async def test_update(self, repo: MemoryBankRepository) -> None:
        entry = _make_entry()
        await repo.create_entry_async(entry=entry)
        updated = entry.model_copy(
            update={
                "content": MemoryContent(title="Updated", body="New body"),
                "version": 2,
            }
        )
        result = await repo.update_entry_async(entry.id, entry=updated)
        assert result.content.title == "Updated"
        assert result.version == 2

        reloaded = await repo.get_by_id_async(entry.id)
        assert reloaded is not None
        assert reloaded.content.title == "Updated"

    async def test_delete(self, repo: MemoryBankRepository) -> None:
        entry = _make_entry()
        await repo.create_entry_async(entry=entry)
        assert await repo.delete_entry_async(entry.id) is True
        assert await repo.get_by_id_async(entry.id) is None

    async def test_delete_nonexistent(self, repo: MemoryBankRepository) -> None:
        assert await repo.delete_entry_async("mem-nonexistent") is False


# ---------------------------------------------------------------------------
# AC-14: Structured query with filtering
# ---------------------------------------------------------------------------


class TestQuery:
    async def _seed_entries(self, repo: MemoryBankRepository) -> list[MemoryEntry]:
        entries = [
            _make_entry(
                id="mem-p1",
                tier=MemoryTier.PERSISTENT,
                scope=MemoryScope.WORKSPACE,
                kind=MemoryEntryKind.CONSTRAINT,
                tags=("python", "pydantic"),
            ),
            _make_entry(
                id="mem-w1",
                tier=MemoryTier.WORKING,
                scope=MemoryScope.SESSION,
                session_id="sess-1",
                run_id="run-1",
                kind=MemoryEntryKind.INSIGHT,
                tags=("pattern",),
            ),
            _make_entry(
                id="mem-m1",
                tier=MemoryTier.MEDIUM_TERM,
                scope=MemoryScope.ROLE,
                role_id="role-crafter",
                kind=MemoryEntryKind.DECISION,
                tags=("architecture",),
                confidence_score=0.5,
            ),
        ]
        for e in entries:
            await repo.create_entry_async(entry=e)
        return entries

    async def test_filter_by_tier(self, repo: MemoryBankRepository) -> None:
        await self._seed_entries(repo)
        result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", tier=MemoryTier.PERSISTENT)
        )
        assert result.total_count >= 1
        assert all(s.tier == MemoryTier.PERSISTENT for s in result.items)

    async def test_filter_by_kind(self, repo: MemoryBankRepository) -> None:
        await self._seed_entries(repo)
        result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", kind=MemoryEntryKind.INSIGHT)
        )
        assert result.total_count >= 1
        assert all(s.kind == MemoryEntryKind.INSIGHT for s in result.items)

    async def test_filter_by_min_confidence(self, repo: MemoryBankRepository) -> None:
        await self._seed_entries(repo)
        result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", min_confidence=0.8)
        )
        assert all(s.confidence_score >= 0.8 for s in result.items)

    async def test_filter_by_tag_uses_exact_match(
        self, repo: MemoryBankRepository
    ) -> None:
        await repo.create_entry_async(entry=_make_entry(id="mem-go", tags=("go",)))
        await repo.create_entry_async(
            entry=_make_entry(id="mem-golang", tags=("golang",))
        )

        result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", tags=("go",), limit=10)
        )

        assert {summary.id for summary in result.items} == {"mem-go"}

    async def test_filter_by_tag_is_case_insensitive(
        self, repo: MemoryBankRepository
    ) -> None:
        await repo.create_entry_async(
            entry=_make_entry(id="mem-security", tags=("Security",))
        )
        await repo.create_entry_async(
            entry=_make_entry(id="mem-security-audit", tags=("security-audit",))
        )

        result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", tags=("security",), limit=10)
        )

        assert {summary.id for summary in result.items} == {"mem-security"}

    async def test_filter_by_tag_supports_legacy_space_storage(
        self, tmp_path: Path
    ) -> None:
        db_file = tmp_path / "legacy_tags.db"
        initial_repo = MemoryBankRepository(db_file)
        entry = _make_entry(id="mem-legacy-tags", tags=("legacy", "tag"))
        await initial_repo.create_entry_async(entry=entry)
        await initial_repo.close_async()

        with sqlite3.connect(db_file) as conn:
            conn.execute(
                "UPDATE memory_entries SET tags=? WHERE memory_id=?",
                ("manual legacy", entry.id),
            )
            conn.execute("DELETE FROM memory_entry_tags WHERE memory_id=?", (entry.id,))
            conn.commit()

        migrated_repo = MemoryBankRepository(db_file)
        result = await migrated_repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", tags=("manual",), limit=10)
        )
        loaded = await migrated_repo.get_by_id_async(entry.id)

        assert {summary.id for summary in result.items} == {entry.id}
        assert loaded is not None
        assert loaded.tags == ("manual", "legacy")

    async def test_tag_index_tracks_updates_and_deletes(
        self, repo: MemoryBankRepository
    ) -> None:
        entry = _make_entry(id="mem-tag-index", tags=("old",))
        await repo.create_entry_async(entry=entry)
        await repo.update_entry_async(
            entry.id,
            entry=entry.model_copy(update={"tags": ("new",)}),
        )

        old_result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", tags=("old",), limit=10)
        )
        new_result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", tags=("new",), limit=10)
        )
        deleted = await repo.delete_entry_async(entry.id)
        deleted_result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", tags=("new",), limit=10)
        )

        assert old_result.total_count == 0
        assert {summary.id for summary in new_result.items} == {entry.id}
        assert deleted is True
        assert deleted_result.total_count == 0

    async def test_records_and_lists_entry_sources(
        self, repo: MemoryBankRepository
    ) -> None:
        entry = _make_entry(id="mem-source-index")
        await repo.create_entry_async(entry=entry)
        observed_at = datetime.now(tz=timezone.utc)

        recorded = await repo.record_entry_source_async(
            memory_id=entry.id,
            source_kind="semantic_run",
            source_ref="run-1",
            confidence_score=0.9,
            observed_at=observed_at,
        )
        refs = await repo.list_entry_source_refs_async(
            memory_id=entry.id,
            source_kind="semantic_run",
        )

        assert recorded is True
        assert refs == ("run-1",)

    async def test_source_backfill_scans_only_semantic_source_metadata(
        self,
        repo: MemoryBankRepository,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        await repo.create_entry_async(
            entry=_make_entry(id="mem-no-source", metadata={"note": "keep"})
        )
        await repo.create_entry_async(
            entry=_make_entry(
                id="mem-source",
                metadata={"semantic_source_run_ids": "run-1, run-2"},
            )
        )
        sync_calls: list[tuple[str, tuple[str, ...]]] = []

        def record_sync_sources(
            *,
            memory_id: str,
            source_kind: str,
            source_refs: tuple[str, ...],
            confidence_score: float,
            observed_at: datetime,
        ) -> None:
            assert source_kind == "semantic_run"
            assert confidence_score == 1.0
            assert observed_at.tzinfo is not None
            sync_calls.append((memory_id, source_refs))

        monkeypatch.setattr(repo, "_sync_entry_sources", record_sync_sources)

        repo._backfill_entry_sources()

        assert sync_calls == [("mem-source", ("run-1", "run-2"))]

    async def test_index_cleanup_query_uses_index_state(
        self, repo: MemoryBankRepository
    ) -> None:
        entry = _make_entry(id="mem-index-state", status=MemoryEntryStatus.EXPIRED)
        await repo.create_entry_async(entry=entry)

        before = await repo.query_entries_needing_index_cleanup_async(
            status=MemoryEntryStatus.EXPIRED,
            limit=10,
        )
        marked = await repo.mark_entry_index_removed_async(
            memory_id=entry.id,
            index_kind="retrieval",
            removed_at=datetime.now(tz=timezone.utc),
        )
        after = await repo.query_entries_needing_index_cleanup_async(
            status=MemoryEntryStatus.EXPIRED,
            limit=10,
        )

        assert marked is True
        assert {summary.id for summary in before} == {entry.id}
        assert after == ()

    async def test_index_cleanup_query_honors_index_present_reset(
        self, repo: MemoryBankRepository
    ) -> None:
        entry = _make_entry(id="mem-index-present", status=MemoryEntryStatus.EXPIRED)
        await repo.create_entry_async(entry=entry)
        removed_at = datetime.now(tz=timezone.utc)

        marked_removed = await repo.mark_entry_index_removed_async(
            memory_id=entry.id,
            index_kind="retrieval",
            removed_at=removed_at,
        )
        marked_present = await repo.mark_entry_index_present_async(
            memory_id=entry.id,
            index_kind="retrieval",
            updated_at=removed_at,
        )
        after = await repo.query_entries_needing_index_cleanup_async(
            status=MemoryEntryStatus.EXPIRED,
            limit=10,
        )

        assert marked_removed is True
        assert marked_present is True
        assert {summary.id for summary in after} == {entry.id}

    async def test_index_rebuild_query_finds_active_entries_with_stale_state(
        self, repo: MemoryBankRepository
    ) -> None:
        missing_state = _make_entry(id="mem-rebuild-missing")
        removed_state = _make_entry(id="mem-rebuild-removed")
        present_state = _make_entry(id="mem-rebuild-present")
        await repo.create_entry_async(entry=missing_state)
        await repo.create_entry_async(entry=removed_state)
        await repo.create_entry_async(entry=present_state)
        now = datetime.now(tz=timezone.utc)
        await repo.mark_entry_index_removed_async(
            memory_id=removed_state.id,
            index_kind="retrieval",
            removed_at=now,
        )
        await repo.mark_entry_index_present_async(
            memory_id=present_state.id,
            index_kind="retrieval",
            updated_at=now,
        )

        result = await repo.query_entries_needing_index_rebuild_async(limit=10)

        assert {summary.id for summary in result} == {
            missing_state.id,
            removed_state.id,
        }

    async def test_pagination(self, repo: MemoryBankRepository) -> None:
        await self._seed_entries(repo)
        result = await repo.query_entries_async(
            MemoryQuery(workspace_id="ws-test", limit=2, offset=0)
        )
        assert len(result.items) <= 2
        assert result.limit == 2
        assert result.offset == 0


# ---------------------------------------------------------------------------
# AC-12: TTL expiry
# ---------------------------------------------------------------------------


class TestExpiry:
    async def test_expire_entries(self, repo: MemoryBankRepository) -> None:
        past = datetime.now(tz=timezone.utc) - timedelta(hours=1)
        entry = _make_entry(
            status=MemoryEntryStatus.ACTIVE,
            expires_at=past,
        )
        await repo.create_entry_async(entry=entry)

        expired_count = await repo.expire_entries_async()
        assert expired_count >= 1

        loaded = await repo.get_by_id_async(entry.id)
        assert loaded is not None
        assert loaded.status == MemoryEntryStatus.EXPIRED

    async def test_no_expire_future(self, repo: MemoryBankRepository) -> None:
        future = datetime.now(tz=timezone.utc) + timedelta(hours=10)
        entry = _make_entry(
            status=MemoryEntryStatus.ACTIVE,
            expires_at=future,
        )
        await repo.create_entry_async(entry=entry)

        expired_count = await repo.expire_entries_async()
        assert expired_count == 0

        loaded = await repo.get_by_id_async(entry.id)
        assert loaded is not None
        assert loaded.status == MemoryEntryStatus.ACTIVE


# ---------------------------------------------------------------------------
# AC-13: Confidence decay
# ---------------------------------------------------------------------------


class TestConfidenceDecay:
    async def test_decay_and_expire(self, repo: MemoryBankRepository) -> None:
        entry = _make_entry(
            tier=MemoryTier.MEDIUM_TERM,
            confidence_score=0.21,
        )
        await repo.create_entry_async(entry=entry)

        # With min_confidence=0.2, 0.21*0.98 = 0.2058 which is still >= 0.2
        # So we need min_confidence to be above that
        count = await repo.apply_confidence_decay_async(min_confidence=0.21)
        # After decay: 0.21 * 0.98 = 0.2058, which is < 0.21 threshold
        assert count >= 1

        loaded = await repo.get_by_id_async(entry.id)
        assert loaded is not None
        assert loaded.status == MemoryEntryStatus.EXPIRED

    async def test_no_decay_working_tier(self, repo: MemoryBankRepository) -> None:
        entry = _make_entry(
            tier=MemoryTier.WORKING,
            run_id="run-1",
            confidence_score=0.5,
        )
        await repo.create_entry_async(entry=entry)

        # Working tier doesn't decay, but min_confidence check still applies
        await repo.apply_confidence_decay_async(min_confidence=0.4)

        loaded = await repo.get_by_id_async(entry.id)
        assert loaded is not None
        assert loaded.confidence_score == 0.5  # unchanged -- working tier


# ---------------------------------------------------------------------------
# generate_memory_id helper
# ---------------------------------------------------------------------------


class TestGenerateId:
    async def test_generates_mem_prefix(self) -> None:
        mid = generate_memory_id()
        assert mid.startswith("mem-")
        assert len(mid) > 4
