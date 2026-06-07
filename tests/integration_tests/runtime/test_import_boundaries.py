# -*- coding: utf-8 -*-
from __future__ import annotations

import subprocess
import sys


def test_sqlite_retrieval_store_imports_in_fresh_interpreter() -> None:
    command = [
        sys.executable,
        "-c",
        (
            "from relay_teams.retrieval.sqlite_store import "
            "SqliteFts5RetrievalStore; "
            "print(SqliteFts5RetrievalStore.__name__)"
        ),
    ]

    result = subprocess.run(
        command,
        check=True,
        capture_output=True,
        text=True,
    )

    assert result.stdout.strip() == "SqliteFts5RetrievalStore"
