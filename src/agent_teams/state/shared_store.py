from __future__ import annotations

import sqlite3
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
                scope_type TEXT NOT NULL,
                scope_id TEXT NOT NULL,
                state_key TEXT NOT NULL,
                value_json TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (scope_type, scope_id, state_key)
            )
            '''
        )
        self._conn.commit()

    def manage_state(self, mutation: StateMutation) -> None:
        self._conn.execute(
            '''
            INSERT INTO shared_state(scope_type, scope_id, state_key, value_json, updated_at)
            VALUES(?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(scope_type, scope_id, state_key)
            DO UPDATE SET value_json=excluded.value_json, updated_at=CURRENT_TIMESTAMP
            ''',
            (
                mutation.scope.scope_type.value,
                mutation.scope.scope_id,
                mutation.key,
                mutation.value_json,
            ),
        )
        self._conn.commit()

    def get_state(self, scope: ScopeRef, key: str) -> str | None:
        row = self._conn.execute(
            'SELECT value_json FROM shared_state WHERE scope_type=? AND scope_id=? AND state_key=?',
            (scope.scope_type.value, scope.scope_id, key),
        ).fetchone()
        if row is None:
            return None
        return str(row['value_json'])

    def snapshot(self, scope: ScopeRef) -> tuple[tuple[str, str], ...]:
        rows = self._conn.execute(
            'SELECT state_key, value_json FROM shared_state WHERE scope_type=? AND scope_id=?',
            (scope.scope_type.value, scope.scope_id),
        ).fetchall()
        return tuple((str(row['state_key']), str(row['value_json'])) for row in rows)


def global_scope() -> ScopeRef:
    return ScopeRef(scope_type=ScopeType.GLOBAL, scope_id='global')
