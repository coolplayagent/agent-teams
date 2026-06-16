from __future__ import annotations

import json
import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import NamedTuple

import aiosqlite
from pydantic import JsonValue, ValidationError

from relay_teams.logger import get_logger, log_event
from relay_teams.persistence import async_fetchall, async_fetchone
from relay_teams.persistence.sqlite_repository import SharedSqliteRepository
from relay_teams.sessions.session_models import ProjectKind, SessionMode, SessionRecord
from relay_teams.validation import (
    normalize_persisted_text,
    parse_persisted_datetime_or_none,
    require_persisted_identifier,
)

LOGGER = get_logger(__name__)
_SQLITE_SAFE_VARIABLE_LIMIT = 900


def _sqlite_datetime_sort_expression(column: str) -> str:
    return f"CASE WHEN {column} GLOB '????-??-??T??:*' THEN {column} ELSE NULL END"


def _sidebar_session_sort_expression() -> str:
    return (
        "COALESCE("
        f"{_sqlite_datetime_sort_expression('updated_at')}, "
        f"{_sqlite_datetime_sort_expression('created_at')}, "
        "''"
        ")"
    )


def _sidebar_session_sort_value(row: sqlite3.Row) -> str:
    return str(row["sidebar_sort_at"] or "")


class SessionPageRecord(NamedTuple):
    record: SessionRecord
    sort_at: str


class SessionRepository(SharedSqliteRepository):
    def __init__(self, db_path: Path) -> None:
        super().__init__(db_path)
        self._init_tables()

    def _init_tables(self) -> None:
        def operation() -> None:
            self._conn.execute(
                """
                CREATE TABLE IF NOT EXISTS sessions (
                    session_id TEXT PRIMARY KEY,
                    workspace_id TEXT NOT NULL DEFAULT '',
                    project_kind TEXT NOT NULL DEFAULT 'workspace',
                    project_id TEXT NOT NULL DEFAULT '',
                    metadata   TEXT NOT NULL,
                    session_mode TEXT NOT NULL DEFAULT 'normal',
                    normal_root_role_id TEXT,
                    normal_model_profile TEXT,
                    orchestration_preset_id TEXT,
                    started_at TEXT,
                    last_viewed_terminal_run_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            columns = [
                str(row["name"])
                for row in self._conn.execute("PRAGMA table_info(sessions)").fetchall()
            ]
            if "workspace_id" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''"
                )
            if "project_kind" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN project_kind TEXT NOT NULL DEFAULT 'workspace'"
                )
            if "project_id" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN project_id TEXT NOT NULL DEFAULT ''"
                )
                self._conn.execute(
                    "UPDATE sessions SET project_id=workspace_id WHERE project_id=''"
                )
            if "session_mode" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN session_mode TEXT NOT NULL DEFAULT 'normal'"
                )
            if "normal_root_role_id" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN normal_root_role_id TEXT"
                )
            if "normal_model_profile" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN normal_model_profile TEXT"
                )
            if "orchestration_preset_id" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN orchestration_preset_id TEXT"
                )
            if "started_at" not in columns:
                self._conn.execute("ALTER TABLE sessions ADD COLUMN started_at TEXT")
            if "last_viewed_terminal_run_id" not in columns:
                self._conn.execute(
                    "ALTER TABLE sessions ADD COLUMN last_viewed_terminal_run_id TEXT"
                )
            self._conn.execute(
                """
                UPDATE sessions
                SET started_at=NULL
                WHERE LOWER(TRIM(COALESCE(started_at, ''))) IN ('', 'none', 'null')
                """
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_workspace_created_session
                ON sessions(workspace_id, created_at DESC, session_id DESC)
                """
            )
            self._conn.execute(
                """
                CREATE INDEX IF NOT EXISTS idx_sessions_workspace_updated_session
                ON sessions(workspace_id, updated_at DESC, session_id DESC)
                """
            )
            sidebar_sort_expression = _sidebar_session_sort_expression()
            self._conn.execute(
                f"""
                CREATE INDEX IF NOT EXISTS idx_sessions_workspace_sidebar_sort
                ON sessions(
                    workspace_id,
                    {sidebar_sort_expression} DESC,
                    session_id DESC
                )
                """
            )

        self._run_write(operation_name="init_tables", operation=operation)

    def create(
        self,
        *,
        session_id: str,
        workspace_id: str,
        metadata: dict[str, str] | None = None,
        project_kind: ProjectKind = ProjectKind.WORKSPACE,
        project_id: str | None = None,
        session_mode: SessionMode = SessionMode.NORMAL,
        normal_root_role_id: str | None = None,
        normal_model_profile: str | None = None,
        orchestration_preset_id: str | None = None,
    ) -> SessionRecord:
        now = datetime.now(tz=timezone.utc).isoformat()
        metadata_dict = metadata or {}
        resolved_project_id = (project_id or workspace_id).strip()
        record = SessionRecord(
            session_id=session_id,
            workspace_id=workspace_id,
            project_kind=project_kind,
            project_id=resolved_project_id,
            metadata=metadata_dict,
            session_mode=session_mode,
            normal_root_role_id=normal_root_role_id,
            normal_model_profile=normal_model_profile,
            orchestration_preset_id=orchestration_preset_id,
            created_at=datetime.fromisoformat(now),
            updated_at=datetime.fromisoformat(now),
        )

        self._run_write(
            operation_name="create",
            operation=lambda: self._conn.execute(
                """
                INSERT INTO sessions(
                    session_id,
                    workspace_id,
                    project_kind,
                    project_id,
                    metadata,
                    session_mode,
                    normal_root_role_id,
                    normal_model_profile,
                    orchestration_preset_id,
                    started_at,
                    last_viewed_terminal_run_id,
                    created_at,
                    updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.session_id,
                    record.workspace_id,
                    record.project_kind.value,
                    record.project_id,
                    json.dumps(record.metadata),
                    record.session_mode.value,
                    record.normal_root_role_id,
                    record.normal_model_profile,
                    record.orchestration_preset_id,
                    None,
                    record.last_viewed_terminal_run_id,
                    now,
                    now,
                ),
            ),
        )
        return record

    async def create_async(
        self,
        *,
        session_id: str,
        workspace_id: str,
        metadata: dict[str, str] | None = None,
        project_kind: ProjectKind = ProjectKind.WORKSPACE,
        project_id: str | None = None,
        session_mode: SessionMode = SessionMode.NORMAL,
        normal_root_role_id: str | None = None,
        normal_model_profile: str | None = None,
        orchestration_preset_id: str | None = None,
    ) -> SessionRecord:
        now = datetime.now(tz=timezone.utc).isoformat()
        metadata_dict = metadata or {}
        resolved_project_id = (project_id or workspace_id).strip()
        record = SessionRecord(
            session_id=session_id,
            workspace_id=workspace_id,
            project_kind=project_kind,
            project_id=resolved_project_id,
            metadata=metadata_dict,
            session_mode=session_mode,
            normal_root_role_id=normal_root_role_id,
            normal_model_profile=normal_model_profile,
            orchestration_preset_id=orchestration_preset_id,
            created_at=datetime.fromisoformat(now),
            updated_at=datetime.fromisoformat(now),
        )

        async def operation() -> None:
            conn = await self._get_async_conn()
            cursor = await conn.execute(
                """
                INSERT INTO sessions(
                    session_id,
                    workspace_id,
                    project_kind,
                    project_id,
                    metadata,
                    session_mode,
                    normal_root_role_id,
                    normal_model_profile,
                    orchestration_preset_id,
                    started_at,
                    last_viewed_terminal_run_id,
                    created_at,
                    updated_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    record.session_id,
                    record.workspace_id,
                    record.project_kind.value,
                    record.project_id,
                    json.dumps(record.metadata),
                    record.session_mode.value,
                    record.normal_root_role_id,
                    record.normal_model_profile,
                    record.orchestration_preset_id,
                    None,
                    record.last_viewed_terminal_run_id,
                    now,
                    now,
                ),
            )
            await cursor.close()

        await self._run_async_write(
            operation_name="create_async",
            operation=lambda _conn: operation(),
        )
        return record

    def update_topology(
        self,
        session_id: str,
        *,
        session_mode: SessionMode,
        normal_root_role_id: str | None,
        orchestration_preset_id: str | None,
    ) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()
        rowcount = self._run_write(
            operation_name="update_topology",
            operation=lambda: (
                self._conn.execute(
                    """
                UPDATE sessions
                SET session_mode=?, normal_root_role_id=?, orchestration_preset_id=?, updated_at=?
                WHERE session_id=? AND started_at IS NULL
                """,
                    (
                        session_mode.value,
                        normal_root_role_id,
                        orchestration_preset_id,
                        now,
                        session_id,
                    ),
                ).rowcount
            ),
        )
        if rowcount == 0:
            existing = self.get(session_id)
            if existing.started_at is not None:
                raise RuntimeError("Session mode can no longer be changed")
            raise KeyError(f"Unknown session_id: {session_id}")

    async def update_topology_async(
        self,
        session_id: str,
        *,
        session_mode: SessionMode,
        normal_root_role_id: str | None,
        orchestration_preset_id: str | None,
    ) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()

        async def operation() -> int:
            conn = await self._get_async_conn()
            cursor = await conn.execute(
                """
                UPDATE sessions
                SET session_mode=?, normal_root_role_id=?, orchestration_preset_id=?, updated_at=?
                WHERE session_id=? AND started_at IS NULL
                """,
                (
                    session_mode.value,
                    normal_root_role_id,
                    orchestration_preset_id,
                    now,
                    session_id,
                ),
            )
            affected_rows = cursor.rowcount
            await cursor.close()
            return affected_rows

        updated_count = await self._run_async_write(
            operation_name="update_topology_async",
            operation=lambda _conn: operation(),
        )
        if updated_count == 0:
            existing = await self.get_async(session_id)
            if existing.started_at is not None:
                raise RuntimeError("Session mode can no longer be changed")
            raise KeyError(f"Unknown session_id: {session_id}")

    async def update_normal_model_profile_async(
        self,
        session_id: str,
        *,
        normal_model_profile: str | None,
    ) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()

        async def operation() -> int:
            conn = await self._get_async_conn()
            cursor = await conn.execute(
                """
                UPDATE sessions
                SET normal_model_profile=?, updated_at=?
                WHERE session_id=?
                """,
                (normal_model_profile, now, session_id),
            )
            affected_rows = cursor.rowcount
            await cursor.close()
            return affected_rows

        updated_count = await self._run_async_write(
            operation_name="update_normal_model_profile_async",
            operation=lambda _conn: operation(),
        )
        if updated_count == 0:
            raise KeyError(f"Unknown session_id: {session_id}")

    def update_metadata(self, session_id: str, metadata: dict[str, str]) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()
        rowcount = self._run_write(
            operation_name="update_metadata",
            operation=lambda: (
                self._conn.execute(
                    """
                UPDATE sessions
                SET metadata=?, updated_at=?
                WHERE session_id=?
                """,
                    (json.dumps(metadata), now, session_id),
                ).rowcount
            ),
        )
        if rowcount == 0:
            raise KeyError(f"Unknown session_id: {session_id}")

    async def update_metadata_async(
        self, session_id: str, metadata: dict[str, str]
    ) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()

        async def operation() -> int:
            conn = await self._get_async_conn()
            cursor = await conn.execute(
                """
                UPDATE sessions
                SET metadata=?, updated_at=?
                WHERE session_id=?
                """,
                (json.dumps(metadata), now, session_id),
            )
            affected_rows = cursor.rowcount
            await cursor.close()
            return affected_rows

        updated_count = await self._run_async_write(
            operation_name="update_metadata_async",
            operation=lambda _conn: operation(),
        )
        if updated_count == 0:
            raise KeyError(f"Unknown session_id: {session_id}")

    def mark_terminal_run_viewed(self, session_id: str, run_id: str) -> None:
        rowcount = self._run_write(
            operation_name="mark_terminal_run_viewed",
            operation=lambda: (
                self._conn.execute(
                    """
                UPDATE sessions
                SET last_viewed_terminal_run_id=?
                WHERE session_id=?
                """,
                    (run_id, session_id),
                ).rowcount
            ),
        )
        if rowcount == 0:
            raise KeyError(f"Unknown session_id: {session_id}")

    async def mark_terminal_run_viewed_async(
        self, session_id: str, run_id: str
    ) -> None:
        async def operation(conn: aiosqlite.Connection) -> int:
            cursor = await conn.execute(
                """
                UPDATE sessions
                SET last_viewed_terminal_run_id=?
                WHERE session_id=?
                """,
                (run_id, session_id),
            )
            affected_rows = cursor.rowcount
            await cursor.close()
            return affected_rows

        updated_count = await self._run_async_write(
            operation_name="mark_terminal_run_viewed_async",
            operation=operation,
        )
        if updated_count == 0:
            raise KeyError(f"Unknown session_id: {session_id}")

    def update_workspace(
        self,
        session_id: str,
        *,
        workspace_id: str,
        project_id: str,
    ) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()
        rowcount = self._run_write(
            operation_name="update_workspace",
            operation=lambda: (
                self._conn.execute(
                    """
                UPDATE sessions
                SET workspace_id=?, project_id=?, updated_at=?
                WHERE session_id=?
                """,
                    (workspace_id, project_id, now, session_id),
                ).rowcount
            ),
        )
        if rowcount == 0:
            raise KeyError(f"Unknown session_id: {session_id}")

    async def update_workspace_async(
        self, session_id: str, *, workspace_id: str, project_id: str
    ) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()

        async def operation() -> int:
            conn = await self._get_async_conn()
            cursor = await conn.execute(
                """
                UPDATE sessions
                SET workspace_id=?, project_id=?, updated_at=?
                WHERE session_id=?
                """,
                (workspace_id, project_id, now, session_id),
            )
            affected_rows = cursor.rowcount
            await cursor.close()
            return affected_rows

        updated_count = await self._run_async_write(
            operation_name="update_workspace_async",
            operation=lambda _conn: operation(),
        )
        if updated_count == 0:
            raise KeyError(f"Unknown session_id: {session_id}")

    def mark_started(self, session_id: str) -> SessionRecord:
        now = datetime.now(tz=timezone.utc).isoformat()
        rowcount = self._run_write(
            operation_name="mark_started",
            operation=lambda: (
                self._conn.execute(
                    """
                UPDATE sessions
                SET started_at=COALESCE(started_at, ?), updated_at=?
                WHERE session_id=?
                """,
                    (now, now, session_id),
                ).rowcount
            ),
        )
        if rowcount == 0:
            raise KeyError(f"Unknown session_id: {session_id}")
        return self.get(session_id)

    async def mark_started_async(self, session_id: str) -> SessionRecord:
        now = datetime.now(tz=timezone.utc).isoformat()

        async def operation() -> int:
            conn = await self._get_async_conn()
            cursor = await conn.execute(
                """
                UPDATE sessions
                SET started_at=COALESCE(started_at, ?), updated_at=?
                WHERE session_id=?
                """,
                (now, now, session_id),
            )
            affected_rows = cursor.rowcount
            await cursor.close()
            return affected_rows

        updated_count = await self._run_async_write(
            operation_name="mark_started_async",
            operation=lambda _conn: operation(),
        )
        if updated_count == 0:
            raise KeyError(f"Unknown session_id: {session_id}")
        return await self.get_async(session_id)

    def reconcile_orchestration_presets(
        self,
        *,
        valid_preset_ids: tuple[str, ...],
        default_preset_id: str | None,
    ) -> None:
        valid_ids = set(valid_preset_ids)
        rows = self._run_read(
            lambda: self._conn.execute(
                """
                SELECT session_id, session_mode, orchestration_preset_id, started_at
                     , normal_root_role_id
                FROM sessions
                """
            ).fetchall()
        )
        for row in rows:
            try:
                started_at = normalize_persisted_text(row["started_at"])
                if started_at is not None:
                    continue
                session_id = require_persisted_identifier(
                    row["session_id"],
                    field_name="session_id",
                )
                session_mode = SessionMode(str(row["session_mode"] or "normal"))
                normal_root_role_id = normalize_persisted_text(
                    row["normal_root_role_id"]
                )
                preset_id = normalize_persisted_text(row["orchestration_preset_id"])
            except (ValidationError, ValueError) as exc:
                _log_invalid_session_row(row=row, error=exc)
                continue
            next_mode = session_mode
            next_normal_root_role_id = normal_root_role_id
            next_preset_id = preset_id
            if preset_id and preset_id not in valid_ids:
                next_preset_id = default_preset_id
            if next_mode == SessionMode.ORCHESTRATION and next_preset_id is None:
                next_mode = SessionMode.NORMAL
            if (
                next_mode != session_mode
                or next_normal_root_role_id != normal_root_role_id
                or next_preset_id != preset_id
            ):
                self.update_topology(
                    session_id,
                    session_mode=next_mode,
                    normal_root_role_id=next_normal_root_role_id,
                    orchestration_preset_id=next_preset_id,
                )

    async def reconcile_orchestration_presets_async(
        self, *, valid_preset_ids: tuple[str, ...], default_preset_id: str | None
    ) -> None:
        valid_ids = set(valid_preset_ids)
        rows = await self._run_async_read(
            lambda conn: async_fetchall(
                conn,
                """
                SELECT session_id, session_mode, orchestration_preset_id, started_at
                     , normal_root_role_id
                FROM sessions
                """,
            )
        )
        for row in rows:
            try:
                started_at = normalize_persisted_text(row["started_at"])
                if started_at is not None:
                    continue
                session_id = require_persisted_identifier(
                    row["session_id"],
                    field_name="session_id",
                )
                session_mode = SessionMode(str(row["session_mode"] or "normal"))
                normal_root_role_id = normalize_persisted_text(
                    row["normal_root_role_id"]
                )
                preset_id = normalize_persisted_text(row["orchestration_preset_id"])
            except (ValidationError, ValueError) as exc:
                _log_invalid_session_row(row=row, error=exc)
                continue
            next_mode = session_mode
            next_normal_root_role_id = normal_root_role_id
            next_preset_id = preset_id
            if preset_id and preset_id not in valid_ids:
                next_preset_id = default_preset_id
            if next_mode == SessionMode.ORCHESTRATION and next_preset_id is None:
                next_mode = SessionMode.NORMAL
            if (
                next_mode != session_mode
                or next_normal_root_role_id != normal_root_role_id
                or next_preset_id != preset_id
            ):
                await self.update_topology_async(
                    session_id,
                    session_mode=next_mode,
                    normal_root_role_id=next_normal_root_role_id,
                    orchestration_preset_id=next_preset_id,
                )

    def get(self, session_id: str) -> SessionRecord:
        row = self._run_read(
            lambda: self._conn.execute(
                "SELECT * FROM sessions WHERE session_id=?", (session_id,)
            ).fetchone()
        )
        if row is None:
            raise KeyError(f"Unknown session_id: {session_id}")
        try:
            return self._to_record(row)
        except (ValidationError, ValueError) as exc:
            _log_invalid_session_row(row=row, error=exc)
            raise KeyError(f"Unknown session_id: {session_id}") from exc

    async def get_async(self, session_id: str) -> SessionRecord:
        row = await self._run_async_read(
            lambda conn: async_fetchone(
                conn,
                "SELECT * FROM sessions WHERE session_id=?",
                (session_id,),
            )
        )
        if row is None:
            raise KeyError(f"Unknown session_id: {session_id}")
        try:
            return self._to_record(row)
        except (ValidationError, ValueError) as exc:
            _log_invalid_session_row(row=row, error=exc)
            raise KeyError(f"Unknown session_id: {session_id}") from exc

    def list_all(self) -> tuple[SessionRecord, ...]:
        rows = self._run_read(
            lambda: self._conn.execute(
                "SELECT * FROM sessions ORDER BY created_at DESC, session_id DESC"
            ).fetchall()
        )
        return self._records_from_rows(rows)

    def list_by_workspace(self, workspace_id: str) -> tuple[SessionRecord, ...]:
        rows = self._run_read(
            lambda: self._conn.execute(
                """
                SELECT *
                FROM sessions
                WHERE workspace_id=?
                ORDER BY created_at DESC, session_id DESC
                """,
                (workspace_id,),
            ).fetchall()
        )
        return self._records_from_rows(rows)

    async def list_by_workspace_async(
        self, workspace_id: str
    ) -> tuple[SessionRecord, ...]:
        rows = await self._run_async_read(
            lambda conn: async_fetchall(
                conn,
                """
                SELECT *
                FROM sessions
                WHERE workspace_id=?
                ORDER BY created_at DESC, session_id DESC
                """,
                (workspace_id,),
            )
        )
        return self._records_from_rows(rows)

    async def list_by_workspace_page_async(
        self,
        workspace_id: str,
        *,
        limit: int,
        before_updated_at: datetime | None = None,
        before_session_id: str | None = None,
    ) -> tuple[SessionRecord, ...]:
        entries = await self.list_by_workspace_page_entries_async(
            workspace_id,
            limit=limit,
            before_sort_at=(
                before_updated_at.isoformat() if before_updated_at is not None else None
            ),
            before_session_id=before_session_id,
        )
        return tuple(entry.record for entry in entries)

    async def list_by_workspace_page_entries_async(
        self,
        workspace_id: str,
        *,
        limit: int,
        before_sort_at: str | None = None,
        before_session_id: str | None = None,
    ) -> tuple[SessionPageRecord, ...]:
        if limit <= 0:
            return ()
        if (before_sort_at is None) != (before_session_id is None):
            raise ValueError(
                "Both before_sort_at and before_session_id are required "
                "for paged session queries"
            )
        entries: list[SessionPageRecord] = []
        cursor_sort_at = before_sort_at
        cursor_session_id = before_session_id
        while len(entries) < limit:
            requested = limit - len(entries)
            rows = await self._list_by_workspace_page_rows_async(
                workspace_id,
                limit=requested,
                before_sort_at=cursor_sort_at,
                before_session_id=cursor_session_id,
            )
            if not rows:
                break
            for row in rows:
                try:
                    entries.append(
                        SessionPageRecord(
                            record=self._to_record(row),
                            sort_at=_sidebar_session_sort_value(row),
                        )
                    )
                except (ValidationError, ValueError, json.JSONDecodeError) as exc:
                    _log_invalid_session_row(row=row, error=exc)
            if len(rows) < requested:
                break
            last_row = rows[-1]
            cursor_sort_at = _sidebar_session_sort_value(last_row)
            cursor_session_id = str(last_row["session_id"])
        return tuple(entries[:limit])

    async def _list_by_workspace_page_rows_async(
        self,
        workspace_id: str,
        *,
        limit: int,
        before_sort_at: str | None,
        before_session_id: str | None,
    ) -> tuple[sqlite3.Row, ...]:
        safe_limit = max(1, int(limit))
        sidebar_sort_expression = _sidebar_session_sort_expression()
        if before_sort_at is None or before_session_id is None:
            rows = await self._run_async_read(
                lambda conn: async_fetchall(
                    conn,
                    f"""
                    SELECT *,
                        {sidebar_sort_expression} AS sidebar_sort_at
                    FROM sessions
                    WHERE workspace_id=?
                    ORDER BY sidebar_sort_at DESC, session_id DESC
                    LIMIT ?
                    """,
                    (workspace_id, safe_limit),
                )
            )
            return tuple(rows)
        rows = await self._run_async_read(
            lambda conn: async_fetchall(
                conn,
                f"""
                SELECT *,
                    {sidebar_sort_expression} AS sidebar_sort_at
                FROM sessions
                WHERE workspace_id=?
                  AND (
                    {sidebar_sort_expression} < ?
                    OR (
                        {sidebar_sort_expression} = ?
                        AND session_id < ?
                    )
                  )
                ORDER BY sidebar_sort_at DESC, session_id DESC
                LIMIT ?
                """,
                (
                    workspace_id,
                    before_sort_at,
                    before_sort_at,
                    before_session_id,
                    safe_limit,
                ),
            )
        )
        return tuple(rows)

    async def list_by_ids_async(
        self,
        session_ids: tuple[str, ...],
    ) -> tuple[SessionRecord, ...]:
        normalized_ids = _normalize_identifier_tuple(session_ids)
        if not normalized_ids:
            return ()
        rows: list[sqlite3.Row] = []
        for chunk in _chunked_identifiers(normalized_ids):
            placeholders = ", ".join("?" for _ in chunk)
            query = f"""
                SELECT *
                FROM sessions
                WHERE session_id IN ({placeholders})
                ORDER BY created_at DESC, session_id DESC
                """
            fetched = await self._run_async_read(
                lambda conn, query_text=query, query_params=chunk: async_fetchall(
                    conn,
                    query_text,
                    query_params,
                )
            )
            rows.extend(fetched)
        rows.sort(
            key=lambda row: (
                str(row["created_at"] or ""),
                str(row["session_id"] or ""),
            ),
            reverse=True,
        )
        return self._records_from_rows(rows)

    async def list_by_project_refs_async(
        self,
        *,
        project_kind: ProjectKind,
        project_ids: tuple[str, ...],
    ) -> tuple[SessionRecord, ...]:
        normalized_ids = _normalize_identifier_tuple(project_ids)
        if not normalized_ids:
            return ()
        rows: list[sqlite3.Row] = []
        for chunk in _chunked_identifiers(normalized_ids):
            placeholders = ", ".join("?" for _ in chunk)
            query = f"""
                SELECT *
                FROM sessions
                WHERE project_kind=? AND project_id IN ({placeholders})
                ORDER BY created_at DESC, session_id DESC
                """
            params = (project_kind.value, *chunk)
            fetched = await self._run_async_read(
                lambda conn, query_text=query, query_params=params: async_fetchall(
                    conn,
                    query_text,
                    query_params,
                )
            )
            rows.extend(fetched)
        rows.sort(
            key=lambda row: (
                str(row["created_at"] or ""),
                str(row["session_id"] or ""),
            ),
            reverse=True,
        )
        return self._records_from_rows(rows)

    async def list_all_async(self) -> tuple[SessionRecord, ...]:
        rows = await self._run_async_read(
            lambda conn: async_fetchall(
                conn,
                "SELECT * FROM sessions ORDER BY created_at DESC, session_id DESC",
            )
        )
        return self._records_from_rows(rows)

    def _records_from_rows(
        self,
        rows: list[sqlite3.Row] | tuple[sqlite3.Row, ...],
    ) -> tuple[SessionRecord, ...]:
        records: list[SessionRecord] = []
        for row in rows:
            try:
                records.append(self._to_record(row))
            except (ValidationError, ValueError) as exc:
                _log_invalid_session_row(row=row, error=exc)
        return tuple(records)

    def delete(self, session_id: str) -> None:
        self._run_write(
            operation_name="delete",
            operation=lambda: self._conn.execute(
                "DELETE FROM sessions WHERE session_id=?", (session_id,)
            ),
        )

    async def delete_async(self, session_id: str) -> None:
        async def operation() -> None:
            conn = await self._get_async_conn()
            cursor = await conn.execute(
                "DELETE FROM sessions WHERE session_id=?",
                (session_id,),
            )
            await cursor.close()

        await self._run_async_write(
            operation_name="delete_async",
            operation=lambda _conn: operation(),
        )

    @staticmethod
    def _to_record(row: sqlite3.Row) -> SessionRecord:
        session_id = require_persisted_identifier(
            row["session_id"],
            field_name="session_id",
        )
        workspace_id = require_persisted_identifier(
            row["workspace_id"],
            field_name="workspace_id",
        )
        project_id = normalize_persisted_text(row["project_id"]) or workspace_id
        started_at_raw = normalize_persisted_text(row["started_at"])
        started_at = parse_persisted_datetime_or_none(started_at_raw)
        if started_at_raw is not None and started_at is None:
            _log_invalid_session_timestamp(
                session_id=session_id,
                field_name="started_at",
                raw_preview=_persisted_value_preview(row["started_at"]),
                fallback_iso=None,
            )
        created_at = parse_persisted_datetime_or_none(row["created_at"])
        updated_at = parse_persisted_datetime_or_none(row["updated_at"])
        fallback_now = datetime.now(tz=timezone.utc)
        if created_at is None:
            created_at = updated_at or fallback_now
            _log_invalid_session_timestamp(
                session_id=session_id,
                field_name="created_at",
                raw_preview=_persisted_value_preview(row["created_at"]),
                fallback_iso=created_at.isoformat(),
            )
        if updated_at is None:
            updated_at = created_at
            _log_invalid_session_timestamp(
                session_id=session_id,
                field_name="updated_at",
                raw_preview=_persisted_value_preview(row["updated_at"]),
                fallback_iso=updated_at.isoformat(),
            )
        return SessionRecord(
            session_id=session_id,
            workspace_id=workspace_id,
            project_kind=ProjectKind(str(row["project_kind"] or "workspace")),
            project_id=project_id,
            metadata=_metadata_from_json(row["metadata"], session_id=session_id),
            session_mode=SessionMode(str(row["session_mode"] or "normal")),
            normal_root_role_id=normalize_persisted_text(row["normal_root_role_id"]),
            normal_model_profile=normalize_persisted_text(row["normal_model_profile"]),
            orchestration_preset_id=normalize_persisted_text(
                row["orchestration_preset_id"]
            ),
            started_at=started_at,
            last_viewed_terminal_run_id=normalize_persisted_text(
                row["last_viewed_terminal_run_id"]
            ),
            can_switch_mode=started_at is None,
            created_at=created_at,
            updated_at=updated_at,
        )


def _metadata_from_json(value: object, *, session_id: str) -> dict[str, str]:
    raw = str(value or "").strip()
    if not raw:
        _log_invalid_metadata(
            session_id=session_id,
            reason="blank_metadata_json",
            raw_preview="",
        )
        return {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        _log_invalid_metadata(
            session_id=session_id,
            reason="invalid_metadata_json",
            raw_preview=raw[:200],
        )
        return {}
    if not isinstance(parsed, dict):
        _log_invalid_metadata(
            session_id=session_id,
            reason="metadata_not_object",
            raw_preview=raw[:200],
        )
        return {}
    normalized: dict[str, str] = {}
    dropped_keys: list[str] = []
    for key, item in parsed.items():
        key_name = str(key).strip()
        if not key_name:
            dropped_keys.append(str(key))
            continue
        if isinstance(item, str):
            normalized[key_name] = item
            continue
        if isinstance(item, bool | int | float):
            normalized[key_name] = str(item)
            continue
        dropped_keys.append(key_name)
    if dropped_keys:
        ignored_keys: list[JsonValue] = [key for key in sorted(dropped_keys)]
        payload: dict[str, JsonValue] = {
            "session_id": session_id,
            "ignored_keys": ignored_keys,
        }
        log_event(
            LOGGER,
            logging.WARNING,
            event="sessions.repository.metadata_entries_ignored",
            message="Ignored non-string session metadata values from persisted row",
            payload=payload,
        )
    return normalized


def _normalize_identifier_tuple(values: tuple[str, ...]) -> tuple[str, ...]:
    return tuple(
        dict.fromkeys(
            value for value in (str(item or "").strip() for item in values) if value
        )
    )


def _chunked_identifiers(values: tuple[str, ...]) -> tuple[tuple[str, ...], ...]:
    return tuple(
        values[index : index + _SQLITE_SAFE_VARIABLE_LIMIT]
        for index in range(0, len(values), _SQLITE_SAFE_VARIABLE_LIMIT)
    )


def _persisted_value_preview(value: object) -> str:
    if value is None:
        return "<null>"
    return str(value)[:200]


def _log_invalid_metadata(
    *,
    session_id: str,
    reason: str,
    raw_preview: str,
) -> None:
    payload: dict[str, JsonValue] = {
        "session_id": session_id,
        "reason": reason,
        "raw_preview": raw_preview,
    }
    log_event(
        LOGGER,
        logging.WARNING,
        event="sessions.repository.metadata_invalid",
        message="Ignoring invalid session metadata from persisted row",
        payload=payload,
    )


def _log_invalid_session_timestamp(
    *,
    session_id: str,
    field_name: str,
    raw_preview: str,
    fallback_iso: str | None,
) -> None:
    payload: dict[str, JsonValue] = {
        "session_id": session_id,
        "field_name": field_name,
        "raw_preview": raw_preview,
        "fallback_iso": fallback_iso,
    }
    log_event(
        LOGGER,
        logging.WARNING,
        event="sessions.repository.timestamp_invalid",
        message="Using fallback for invalid persisted session timestamp",
        payload=payload,
    )


def _log_invalid_session_row(*, row: sqlite3.Row, error: Exception) -> None:
    payload: dict[str, JsonValue] = {
        "session_id": _persisted_value_preview(_row_value(row, "session_id")),
        "workspace_id": _persisted_value_preview(_row_value(row, "workspace_id")),
        "started_at": _persisted_value_preview(_row_value(row, "started_at")),
        "created_at": _persisted_value_preview(_row_value(row, "created_at")),
        "updated_at": _persisted_value_preview(_row_value(row, "updated_at")),
        "error_type": type(error).__name__,
        "error": str(error),
    }
    log_event(
        LOGGER,
        logging.WARNING,
        event="sessions.repository.row_invalid",
        message="Skipping invalid persisted session row",
        payload=payload,
    )


def _row_value(row: sqlite3.Row, key: str) -> object | None:
    if key not in row.keys():
        return None
    return row[key]
