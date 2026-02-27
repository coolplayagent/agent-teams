from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from agent_teams.core.enums import TaskStatus
from agent_teams.core.models import TaskEnvelope, TaskRecord
from agent_teams.state.db import open_sqlite


class TaskRepository:
    def __init__(self, db_path: Path) -> None:
        self._conn = open_sqlite(db_path)
        self._conn.row_factory = sqlite3.Row
        self._init_tables()

    def _init_tables(self) -> None:
        self._conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS tasks (
                task_id TEXT PRIMARY KEY,
                envelope_json TEXT NOT NULL,
                status TEXT NOT NULL,
                assigned_instance_id TEXT,
                result TEXT,
                error_message TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            '''
        )
        self._conn.commit()

    def create(self, envelope: TaskEnvelope) -> TaskRecord:
        now = datetime.now(tz=timezone.utc).isoformat()
        record = TaskRecord(envelope=envelope)
        self._conn.execute(
            '''
            INSERT INTO tasks(task_id, envelope_json, status, assigned_instance_id, result, error_message, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?, ?, ?, ?)
            ''',
            (
                envelope.task_id,
                envelope.model_dump_json(),
                TaskStatus.CREATED.value,
                None,
                None,
                None,
                now,
                now,
            ),
        )
        self._conn.commit()
        return record

    def update_status(
        self,
        task_id: str,
        status: TaskStatus,
        assigned_instance_id: str | None = None,
        result: str | None = None,
        error_message: str | None = None,
    ) -> None:
        now = datetime.now(tz=timezone.utc).isoformat()
        self._conn.execute(
            '''
            UPDATE tasks
            SET status=?, assigned_instance_id=COALESCE(?, assigned_instance_id), result=COALESCE(?, result), error_message=COALESCE(?, error_message), updated_at=?
            WHERE task_id=?
            ''',
            (status.value, assigned_instance_id, result, error_message, now, task_id),
        )
        self._conn.commit()

    def get(self, task_id: str) -> TaskRecord:
        row = self._conn.execute('SELECT * FROM tasks WHERE task_id=?', (task_id,)).fetchone()
        if row is None:
            raise KeyError(f'Unknown task_id: {task_id}')
        return self._to_record(row)

    def list_all(self) -> tuple[TaskRecord, ...]:
        rows = self._conn.execute('SELECT * FROM tasks ORDER BY created_at ASC').fetchall()
        return tuple(self._to_record(row) for row in rows)

    def _to_record(self, row: sqlite3.Row) -> TaskRecord:
        return TaskRecord(
            envelope=TaskEnvelope.model_validate_json(str(row['envelope_json'])),
            status=TaskStatus(str(row['status'])),
            assigned_instance_id=str(row['assigned_instance_id']) if row['assigned_instance_id'] else None,
            result=str(row['result']) if row['result'] else None,
            error_message=str(row['error_message']) if row['error_message'] else None,
            created_at=datetime.fromisoformat(str(row['created_at'])),
            updated_at=datetime.fromisoformat(str(row['updated_at'])),
        )
