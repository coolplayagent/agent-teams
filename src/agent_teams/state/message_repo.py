from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from pydantic_ai.messages import ModelMessage, ModelMessagesTypeAdapter

from agent_teams.state.db import open_sqlite


class MessageRepository:
    """Persists per-instance LLM message history for multi-turn context."""

    def __init__(self, db_path: Path) -> None:
        self._conn = open_sqlite(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self) -> None:
        self._conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS messages (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                instance_id  TEXT NOT NULL,
                task_id      TEXT NOT NULL,
                trace_id     TEXT NOT NULL,
                role         TEXT NOT NULL,
                message_json TEXT NOT NULL,
                created_at   TEXT NOT NULL
            )
            '''
        )
        self._conn.execute(
            'CREATE INDEX IF NOT EXISTS idx_messages_instance ON messages(instance_id)'
        )
        self._conn.execute(
            'CREATE INDEX IF NOT EXISTS idx_messages_task ON messages(task_id)'
        )
        self._conn.commit()

    def append(
        self,
        *,
        instance_id: str,
        task_id: str,
        trace_id: str,
        messages: list[ModelMessage],
    ) -> None:
        """Insert a batch of messages from a single run_sync call."""
        now = datetime.now(tz=timezone.utc).isoformat()
        rows = [
            (
                instance_id,
                task_id,
                trace_id,
                _role(msg),
                ModelMessagesTypeAdapter.dump_json([msg]).decode(),
                now,
            )
            for msg in messages
        ]
        self._conn.executemany(
            'INSERT INTO messages(instance_id, task_id, trace_id, role, message_json, created_at) '
            'VALUES(?, ?, ?, ?, ?, ?)',
            rows,
        )
        self._conn.commit()

    def get_history(self, instance_id: str) -> list[ModelMessage]:
        """Return all messages for an instance ordered chronologically."""
        rows = self._conn.execute(
            'SELECT message_json FROM messages WHERE instance_id=? ORDER BY id ASC',
            (instance_id,),
        ).fetchall()
        result: list[ModelMessage] = []
        for row in rows:
            msgs = ModelMessagesTypeAdapter.validate_json(str(row['message_json']))
            result.extend(msgs)
        return result

    def get_history_for_task(self, instance_id: str, task_id: str) -> list[ModelMessage]:
        """Return messages scoped to a specific task."""
        rows = self._conn.execute(
            'SELECT message_json FROM messages WHERE instance_id=? AND task_id=? ORDER BY id ASC',
            (instance_id, task_id),
        ).fetchall()
        result: list[ModelMessage] = []
        for row in rows:
            msgs = ModelMessagesTypeAdapter.validate_json(str(row['message_json']))
            result.extend(msgs)
        return result


def _role(msg: ModelMessage) -> str:
    from pydantic_ai.messages import ModelRequest, ModelResponse
    if isinstance(msg, ModelRequest):
        return 'user'
    if isinstance(msg, ModelResponse):
        return 'assistant'
    return 'unknown'
