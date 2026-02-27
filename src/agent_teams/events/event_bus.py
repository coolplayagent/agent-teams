from __future__ import annotations

import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Callable

from agent_teams.core.enums import EventType
from agent_teams.core.models import EventEnvelope
from agent_teams.state.db import open_sqlite

EventHandler = Callable[[EventEnvelope], None]


class EventBus:
    def __init__(self, db_path: Path) -> None:
        self._handlers: list[EventHandler] = []
        self._conn = open_sqlite(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self) -> None:
        self._conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type TEXT NOT NULL,
                trace_id TEXT NOT NULL,
                session_id TEXT NOT NULL,
                task_id TEXT,
                instance_id TEXT,
                payload_json TEXT NOT NULL,
                occurred_at TEXT NOT NULL
            )
            '''
        )
        self._conn.commit()

    def subscribe(self, handler: EventHandler) -> None:
        self._handlers.append(handler)

    def emit(self, event: EventEnvelope) -> None:
        self._conn.execute(
            '''
            INSERT INTO events(event_type, trace_id, session_id, task_id, instance_id, payload_json, occurred_at)
            VALUES(?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                event.event_type.value,
                event.trace_id,
                event.session_id,
                event.task_id,
                event.instance_id,
                event.payload_json,
                event.occurred_at.isoformat(),
            ),
        )
        self._conn.commit()
        for handler in self._handlers:
            handler(event)

    def list_by_trace(self, trace_id: str) -> tuple[EventEnvelope, ...]:
        rows = self._conn.execute(
            'SELECT event_type, trace_id, session_id, task_id, instance_id, payload_json, occurred_at FROM events WHERE trace_id=? ORDER BY id ASC',
            (trace_id,),
        ).fetchall()
        return tuple(
            EventEnvelope(
                event_type=EventType(str(row['event_type'])),
                trace_id=str(row['trace_id']),
                session_id=str(row['session_id']),
                task_id=str(row['task_id']) if row['task_id'] is not None else None,
                instance_id=str(row['instance_id']) if row['instance_id'] is not None else None,
                payload_json=str(row['payload_json']),
                occurred_at=datetime.fromisoformat(str(row['occurred_at'])),
            )
            for row in rows
        )
