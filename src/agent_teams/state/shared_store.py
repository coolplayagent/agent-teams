from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from agent_teams.core.enums import ScopeType
from agent_teams.core.models import ScopeRef, StateMutation
from agent_teams.state.db import open_sqlite


class SharedStore:
    def __init__(self, db_path: Path) -> None:
        self._conn = open_sqlite(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self) -> None:
        self._conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS shared_state (
                scope_type  TEXT NOT NULL,
                scope_id    TEXT NOT NULL,
                state_key   TEXT NOT NULL,
                value_json  TEXT NOT NULL,
                updated_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                expires_at  TEXT,
                PRIMARY KEY (scope_type, scope_id, state_key)
            )
            '''
        )
        self._conn.commit()

    def manage_state(self, mutation: StateMutation, ttl_seconds: int | None = None) -> None:
        expires_at: str | None = None
        if ttl_seconds is not None:
            expires_at = (datetime.now(tz=timezone.utc) + timedelta(seconds=ttl_seconds)).isoformat()
        self._conn.execute(
            '''
            INSERT INTO shared_state(scope_type, scope_id, state_key, value_json, updated_at, expires_at)
            VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP, ?)
            ON CONFLICT(scope_type, scope_id, state_key)
            DO UPDATE SET value_json=excluded.value_json, updated_at=CURRENT_TIMESTAMP,
                          expires_at=COALESCE(excluded.expires_at, expires_at)
            ''',
            (
                mutation.scope.scope_type.value,
                mutation.scope.scope_id,
                mutation.key,
                mutation.value_json,
                expires_at,
            ),
        )
        self._conn.commit()

    def get_state(self, scope: ScopeRef, key: str) -> str | None:
        row = self._conn.execute(
            '''
            SELECT value_json FROM shared_state
            WHERE scope_type=? AND scope_id=? AND state_key=?
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            ''',
            (scope.scope_type.value, scope.scope_id, key),
        ).fetchone()
        if row is None:
            return None
        return str(row['value_json'])

    def snapshot(self, scope: ScopeRef) -> tuple[tuple[str, str], ...]:
        rows = self._conn.execute(
            '''
            SELECT state_key, value_json FROM shared_state
            WHERE scope_type=? AND scope_id=?
              AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
            ''',
            (scope.scope_type.value, scope.scope_id),
        ).fetchall()
        return tuple((str(row['state_key']), str(row['value_json'])) for row in rows)

    def cleanup_expired(self) -> int:
        """Delete all rows past their expiry. Returns the number of rows deleted."""
        cursor = self._conn.execute(
            "DELETE FROM shared_state WHERE expires_at IS NOT NULL AND expires_at <= CURRENT_TIMESTAMP"
        )
        self._conn.commit()
        return cursor.rowcount


def global_scope() -> ScopeRef:
    return ScopeRef(scope_type=ScopeType.GLOBAL, scope_id='global')
