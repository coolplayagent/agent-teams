# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import sqlite3

import pytest
from relay_teams.workspace import (
    WorkspaceLocalMountConfig,
    WorkspaceMountCapabilities,
    WorkspaceMountProvider,
    WorkspaceMountRecord,
    WorkspaceRepository,
    WorkspaceSshMountConfig,
)


def test_workspace_repository_skips_invalid_persisted_rows(tmp_path: Path) -> None:
    db_path = tmp_path / "workspace_invalid_rows.db"
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    repository = WorkspaceRepository(db_path)
    _ = repository.create(
        workspace_id="project-alpha",
        root_path=root_path,
    )
    _insert_workspace_row(
        db_path,
        workspace_id="None",
        root_path=root_path,
    )

    records = repository.list_all()

    assert [record.workspace_id for record in records] == ["project-alpha"]
    with pytest.raises(KeyError):
        repository.get("None")


def test_workspace_repository_persists_mounts_in_provider_then_name_order(
    tmp_path: Path,
) -> None:
    app_root = tmp_path / "app-root"
    ops_root = tmp_path / "ops-root"
    app_root.mkdir()
    ops_root.mkdir()
    repository = WorkspaceRepository(tmp_path / "workspace_mount_order.db")

    created = repository.create(
        workspace_id="project-alpha",
        default_mount_name="prod",
        mounts=(
            WorkspaceMountRecord(
                mount_name="prod",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="prod",
                    remote_root="/srv/prod",
                ),
            ),
            WorkspaceMountRecord(
                mount_name="ops",
                provider=WorkspaceMountProvider.LOCAL,
                provider_config=WorkspaceLocalMountConfig(root_path=ops_root),
            ),
            WorkspaceMountRecord(
                mount_name="app",
                provider=WorkspaceMountProvider.LOCAL,
                provider_config=WorkspaceLocalMountConfig(root_path=app_root),
            ),
            WorkspaceMountRecord(
                mount_name="stage",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="stage",
                    remote_root="/srv/stage",
                ),
            ),
        ),
    )

    fetched = repository.get("project-alpha")
    listed = repository.list_all()[0]
    expected_order = ["app", "ops", "prod", "stage"]

    assert [mount.mount_name for mount in created.mounts] == expected_order
    assert [mount.mount_name for mount in fetched.mounts] == expected_order
    assert [mount.mount_name for mount in listed.mounts] == expected_order


def test_workspace_repository_migrates_persisted_ssh_diff_capability(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_ssh_capabilities.db"
    repository = WorkspaceRepository(db_path)
    _ = repository.create(
        workspace_id="project-alpha",
        default_mount_name="prod",
        mounts=(
            WorkspaceMountRecord(
                mount_name="prod",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="prod",
                    remote_root="/srv/prod",
                ),
                capabilities=WorkspaceMountCapabilities(
                    can_diff=False,
                    can_preview=False,
                ),
            ),
        ),
    )
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE workspace_mounts
        SET capabilities_json = ?
        WHERE workspace_id = ? AND mount_name = ?
        """,
        (
            '{"can_read": true, "can_write": true, "can_search": true, "can_shell": true, "can_diff": false, "can_preview": false}',
            "project-alpha",
            "prod",
        ),
    )
    connection.commit()
    connection.close()

    fetched = repository.get("project-alpha")

    assert len(fetched.mounts) == 1
    assert fetched.mounts[0].provider == WorkspaceMountProvider.SSH
    assert fetched.mounts[0].capabilities is not None
    assert fetched.mounts[0].capabilities.can_diff is True
    assert fetched.mounts[0].capabilities.can_preview is False


def test_workspace_repository_skips_invalid_legacy_profile_rows_on_init(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_legacy_invalid.db"
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    now = datetime.now(tz=timezone.utc).isoformat()
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        CREATE TABLE workspaces (
            workspace_id TEXT PRIMARY KEY,
            root_path TEXT NOT NULL,
            backend TEXT NOT NULL,
            profile_json TEXT NOT NULL DEFAULT '{}',
            default_mount_name TEXT NOT NULL DEFAULT 'default',
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    connection.execute(
        """
        INSERT INTO workspaces(
            workspace_id,
            root_path,
            backend,
            profile_json,
            default_mount_name,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            "project-alpha",
            str(root_path),
            "filesystem",
            '{"backend": "filesystem", "file_scope": "broken"}',
            "default",
            now,
            now,
        ),
    )
    connection.commit()
    connection.close()

    repository = WorkspaceRepository(db_path)

    assert repository.list_all() == ()


def _insert_workspace_row(
    db_path: Path,
    *,
    workspace_id: str,
    root_path: Path,
) -> None:
    now = datetime.now(tz=timezone.utc).isoformat()
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        INSERT INTO workspaces(workspace_id, root_path, backend, profile_json, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            workspace_id,
            str(root_path),
            "filesystem",
            "{}",
            now,
            now,
        ),
    )
    connection.commit()
    connection.close()
