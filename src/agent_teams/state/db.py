from __future__ import annotations

import sqlite3
from pathlib import Path

MEMORY_DSN = 'file:agent_teams_shared?mode=memory&cache=shared'


def _can_write(conn: sqlite3.Connection) -> bool:
    try:
        conn.execute('CREATE TABLE IF NOT EXISTS __healthcheck__(id INTEGER PRIMARY KEY)')
        conn.execute('DROP TABLE IF EXISTS __healthcheck__')
        conn.commit()
        return True
    except sqlite3.OperationalError:
        return False


def open_sqlite(db_path: Path) -> sqlite3.Connection:
    file_dsn = str(db_path)
    try:
        conn = sqlite3.connect(file_dsn, timeout=30.0)
        if _can_write(conn):
            return conn
        conn.close()
    except sqlite3.OperationalError:
        pass

    return sqlite3.connect(MEMORY_DSN, uri=True, timeout=30.0)
