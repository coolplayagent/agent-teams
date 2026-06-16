# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import base64
import shutil
import sqlite3
import subprocess
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from pathlib import Path

import pytest

from relay_teams.sessions.session_repository import SessionRepository
from relay_teams.secrets import AppSecretStore
from relay_teams.workspace import (
    FileScopeBackend,
    GitWorktreeClient,
    SshProfileConfig,
    SshProfileRepository,
    SshProfileSecretStore,
    SshProfileService,
    WorkspaceMountCapabilities,
    WorkspaceDiffChangeType,
    WorkspaceFileScope,
    WorkspaceMountProvider,
    WorkspaceMountRecord,
    WorkspacePageSort,
    WorkspaceProfile,
    WorkspaceRepository,
    WorkspaceService,
    WorkspaceSshMountConfig,
    WorkspaceTreeListing,
    WorkspaceTreeNode,
    WorkspaceTreeNodeKind,
    build_local_workspace_mount,
)


class StorageScopedWorkspaceService(WorkspaceService):
    def __init__(
        self,
        *,
        repository: WorkspaceRepository,
        storage_root: Path,
        git_worktree_client: GitWorktreeClient | None = None,
    ) -> None:
        super().__init__(
            repository=repository,
            git_worktree_client=git_worktree_client,
        )
        self._storage_root = storage_root

    def _workspace_storage_dir(self, workspace_id: str) -> Path:
        return self._storage_root / workspace_id


class FakeGitWorktreeClient(GitWorktreeClient):
    def __init__(self) -> None:
        self.ensure_calls: list[Path] = []
        self.head_calls: list[Path] = []
        self.fetch_calls: list[tuple[Path, str, str]] = []
        self.resolve_ref_calls: list[tuple[Path, str]] = []
        self.add_calls: list[tuple[Path, str, Path, str]] = []
        self.remove_calls: list[tuple[Path, Path]] = []
        self.prune_calls: list[Path] = []
        self.fetch_error: ValueError | None = None
        self.resolve_error: ValueError | None = None

    def ensure_repository(self, repository_root: Path) -> Path:
        self.ensure_calls.append(repository_root)
        return repository_root.resolve()

    def current_head(self, repository_root: Path) -> str:
        self.head_calls.append(repository_root)
        return "abc123"

    def fetch_ref(
        self,
        repository_root: Path,
        *,
        remote: str = "origin",
        ref: str = "main",
    ) -> None:
        self.fetch_calls.append((repository_root, remote, ref))
        if self.fetch_error is not None:
            raise self.fetch_error

    def resolve_ref(self, repository_root: Path, ref_name: str) -> str:
        self.resolve_ref_calls.append((repository_root, ref_name))
        if self.resolve_error is not None:
            raise self.resolve_error
        return f"resolved:{ref_name}"

    def add_worktree(
        self,
        *,
        repository_root: Path,
        branch_name: str,
        target_path: Path,
        start_point: str,
    ) -> None:
        self.add_calls.append((repository_root, branch_name, target_path, start_point))
        target_path.mkdir(parents=True, exist_ok=True)

    def remove_worktree(self, *, repository_root: Path, target_path: Path) -> None:
        self.remove_calls.append((repository_root, target_path))
        shutil.rmtree(target_path, ignore_errors=True)

    def prune(self, repository_root: Path) -> None:
        self.prune_calls.append(repository_root)


class _FileOnlySecretStore(AppSecretStore):
    def has_usable_keyring_backend(self) -> bool:
        return False


def _build_ssh_workspace_service(
    tmp_path: Path,
    *,
    process_runner: Callable[..., subprocess.CompletedProcess[str]],
    remote_root: str = "/srv/app",
    ssh_profile_id: str = "container",
    mount_record: WorkspaceMountRecord | None = None,
) -> WorkspaceService:
    local_root = tmp_path / "local-root"
    local_root.mkdir(exist_ok=True)
    ssh_profile_service = SshProfileService(
        repository=SshProfileRepository(tmp_path / "ssh_profiles.db"),
        config_dir=tmp_path,
        secret_store=SshProfileSecretStore(secret_store=_FileOnlySecretStore()),
        ssh_path_lookup=lambda _name: "/usr/bin/ssh",
        process_runner=process_runner,
    )
    _ = ssh_profile_service.save_profile(
        ssh_profile_id=ssh_profile_id,
        config=SshProfileConfig(
            host="127.0.0.1",
            username="root",
            port=2222,
            password="secret",
        ),
    )
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        ssh_profile_service=ssh_profile_service,
    )
    ssh_mount = mount_record or WorkspaceMountRecord(
        mount_name="container",
        provider=WorkspaceMountProvider.SSH,
        provider_config=WorkspaceSshMountConfig(
            ssh_profile_id=ssh_profile_id,
            remote_root=remote_root,
        ),
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            build_local_workspace_mount(mount_name="default", root_path=local_root),
            ssh_mount,
        ),
        default_mount_name="default",
    )
    return service


def test_workspace_service_creates_and_lists_workspace(tmp_path: Path) -> None:
    db_path = tmp_path / "workspace_service.db"
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    service = WorkspaceService(repository=WorkspaceRepository(db_path))

    created = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    assert created.workspace_id == "project-alpha"
    assert created.root_path == root_path.resolve()
    listed = service.list_workspaces()
    assert len(listed) == 1
    assert listed[0].workspace_id == "project-alpha"


def test_workspace_service_page_orders_by_latest_session_activity(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_service_activity_page.db"
    old_root = tmp_path / "old-root"
    new_root = tmp_path / "new-root"
    old_root.mkdir()
    new_root.mkdir()
    repository = WorkspaceRepository(db_path)
    service = WorkspaceService(repository=repository)
    _ = service.create_workspace(workspace_id="workspace-old", root_path=old_root)
    _ = service.create_workspace(workspace_id="workspace-new", root_path=new_root)
    _update_workspace_timestamps(
        db_path,
        "workspace-old",
        created_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    _update_workspace_timestamps(
        db_path,
        "workspace-new",
        created_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
    )
    session_repository = SessionRepository(db_path)
    _ = session_repository.create(
        session_id="session-recent",
        workspace_id="workspace-old",
    )
    _update_session_timestamps(
        db_path,
        "session-recent",
        created_at=datetime(2026, 6, 1, 12, 30, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
    )

    async def exercise() -> None:
        first_page = await service.list_workspaces_page_async(limit=1)
        second_page = await service.list_workspaces_page_async(
            limit=1,
            cursor=first_page.next_cursor,
        )

        assert [item.workspace_id for item in first_page.items] == ["workspace-old"]
        assert first_page.has_more is True
        assert [item.workspace_id for item in second_page.items] == ["workspace-new"]
        assert second_page.has_more is False

    asyncio.run(exercise())


def test_workspace_service_page_can_order_by_workspace_created_time(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_service_created_page.db"
    old_root = tmp_path / "old-root"
    new_root = tmp_path / "new-root"
    old_root.mkdir()
    new_root.mkdir()
    repository = WorkspaceRepository(db_path)
    service = WorkspaceService(repository=repository)
    _ = service.create_workspace(workspace_id="workspace-old", root_path=old_root)
    _ = service.create_workspace(workspace_id="workspace-new", root_path=new_root)
    _update_workspace_timestamps(
        db_path,
        "workspace-old",
        created_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    _update_workspace_timestamps(
        db_path,
        "workspace-new",
        created_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
    )
    session_repository = SessionRepository(db_path)
    _ = session_repository.create(
        session_id="session-recent",
        workspace_id="workspace-old",
    )
    _update_session_timestamps(
        db_path,
        "session-recent",
        created_at=datetime(2026, 6, 1, 12, 30, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
    )

    async def exercise() -> None:
        first_page = await service.list_workspaces_page_async(
            limit=1,
            sort=WorkspacePageSort.CREATED,
        )
        second_page = await service.list_workspaces_page_async(
            limit=1,
            cursor=first_page.next_cursor,
            sort=WorkspacePageSort.CREATED,
        )

        assert [item.workspace_id for item in first_page.items] == ["workspace-new"]
        assert first_page.has_more is True
        assert [item.workspace_id for item in second_page.items] == ["workspace-old"]
        assert second_page.has_more is False

    asyncio.run(exercise())


def test_workspace_service_page_skips_invalid_rows_before_cursor(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_service_invalid_page.db"
    service = WorkspaceService(repository=WorkspaceRepository(db_path))
    for workspace_id in ("workspace-new", "workspace-invalid", "workspace-old"):
        root_path = tmp_path / workspace_id
        root_path.mkdir()
        _ = service.create_workspace(workspace_id=workspace_id, root_path=root_path)
    _update_workspace_timestamps(
        db_path,
        "workspace-new",
        created_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 3, 12, 0, tzinfo=timezone.utc),
    )
    _update_workspace_timestamps(
        db_path,
        "workspace-invalid",
        created_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
    )
    _update_workspace_timestamps(
        db_path,
        "workspace-old",
        created_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE workspace_mounts
        SET provider_config_json=?
        WHERE workspace_id=?
        """,
        ("{not-json", "workspace-invalid"),
    )
    connection.commit()
    connection.close()

    async def exercise() -> None:
        first_page = await service.list_workspaces_page_async(limit=1)
        second_page = await service.list_workspaces_page_async(
            limit=1,
            cursor=first_page.next_cursor,
        )

        assert [item.workspace_id for item in first_page.items] == ["workspace-new"]
        assert first_page.has_more is True
        assert first_page.next_cursor is not None
        assert [item.workspace_id for item in second_page.items] == ["workspace-old"]
        assert second_page.has_more is False
        assert second_page.next_cursor is None

    asyncio.run(exercise())


def test_workspace_service_page_ignores_malformed_session_activity(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_service_malformed_session_activity.db"
    stale_root = tmp_path / "stale-root"
    recent_root = tmp_path / "recent-root"
    stale_root.mkdir()
    recent_root.mkdir()
    repository = WorkspaceRepository(db_path)
    service = WorkspaceService(repository=repository)
    _ = service.create_workspace(workspace_id="workspace-stale", root_path=stale_root)
    _ = service.create_workspace(workspace_id="workspace-recent", root_path=recent_root)
    _update_workspace_timestamps(
        db_path,
        "workspace-stale",
        created_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 1, 12, 0, tzinfo=timezone.utc),
    )
    _update_workspace_timestamps(
        db_path,
        "workspace-recent",
        created_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
        updated_at=datetime(2026, 6, 2, 12, 0, tzinfo=timezone.utc),
    )
    session_repository = SessionRepository(db_path)
    _ = session_repository.create(
        session_id="session-malformed",
        workspace_id="workspace-stale",
    )
    _update_session_raw_timestamps(
        db_path,
        "session-malformed",
        created_at="also-not-a-date",
        updated_at="zzzz-not-a-date",
    )

    async def exercise() -> None:
        page = await service.list_workspaces_page_async(limit=1)

        assert [item.workspace_id for item in page.items] == ["workspace-recent"]

    asyncio.run(exercise())


def test_workspace_service_updates_mounts_and_default_mount(tmp_path: Path) -> None:
    db_path = tmp_path / "workspace_service.db"
    app_root = tmp_path / "app-root"
    ops_root = tmp_path / "ops-root"
    service = WorkspaceService(repository=WorkspaceRepository(db_path))
    app_root.mkdir()
    ops_root.mkdir()
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=app_root,
    )

    updated = service.update_workspace(
        "project-alpha",
        default_mount_name="ops",
        mounts=(
            build_local_workspace_mount(mount_name="app", root_path=app_root),
            build_local_workspace_mount(mount_name="ops", root_path=ops_root),
        ),
    )

    assert updated.default_mount_name == "ops"
    assert [mount.mount_name for mount in updated.mounts] == ["app", "ops"]
    assert updated.root_path == ops_root.resolve()


def test_workspace_service_rejects_local_mount_scope_escape_on_create(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_service.db"
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    service = WorkspaceService(repository=WorkspaceRepository(db_path))

    with pytest.raises(ValueError, match="Workspace file scope escapes mount root"):
        _ = service.create_workspace(
            workspace_id="project-alpha",
            mounts=(
                build_local_workspace_mount(
                    mount_name="default",
                    root_path=root_path,
                    working_directory="../outside",
                ),
            ),
            default_mount_name="default",
        )


def test_workspace_service_persists_local_mount_root_as_absolute_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    db_path = tmp_path / "workspace_service.db"
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    service = WorkspaceService(repository=WorkspaceRepository(db_path))
    monkeypatch.chdir(tmp_path)

    created = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            build_local_workspace_mount(
                mount_name="default",
                root_path=Path("workspace-root"),
            ),
        ),
        default_mount_name="default",
    )

    assert created.mounts[0].local_root_path() == root_path.resolve()
    assert (
        service.get_workspace("project-alpha").mounts[0].local_root_path()
        == root_path.resolve()
    )


def test_workspace_service_rejects_local_mount_scope_escape_on_update(
    tmp_path: Path,
) -> None:
    db_path = tmp_path / "workspace_service.db"
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    service = WorkspaceService(repository=WorkspaceRepository(db_path))
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="Workspace file scope escapes mount root"):
        _ = service.update_workspace(
            "project-alpha",
            mounts=(
                build_local_workspace_mount(
                    mount_name="default",
                    root_path=root_path,
                    writable_paths=("../outside",),
                ),
            ),
            default_mount_name="default",
        )


def test_workspace_service_rejects_missing_root(tmp_path: Path) -> None:
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )

    with pytest.raises(ValueError, match="does not exist"):
        _ = service.create_workspace(
            workspace_id="missing",
            root_path=tmp_path / "missing-root",
        )


def test_workspace_service_create_for_root_reuses_existing_workspace(
    tmp_path: Path,
) -> None:
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    root_path = tmp_path / "Project Root"
    root_path.mkdir()

    created = service.create_workspace_for_root(root_path=root_path)
    reused = service.create_workspace_for_root(root_path=root_path)

    assert created.workspace_id == "project-root"
    assert reused.workspace_id == "project-root"
    assert len(service.list_workspaces()) == 1


def test_workspace_service_create_for_root_generates_unique_workspace_id(
    tmp_path: Path,
) -> None:
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    first_root = tmp_path / "Demo Project"
    second_root = tmp_path / "demo-project"
    first_root.mkdir()
    second_root.mkdir()

    first = service.create_workspace_for_root(root_path=first_root)
    second = service.create_workspace_for_root(root_path=second_root)

    assert first.workspace_id == "demo-project"
    assert second.workspace_id == "demo-project-2"


def test_workspace_service_forks_workspace_into_git_worktree(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    created = service.fork_workspace(
        source_workspace_id="project-alpha",
        name="Alpha Project Fork",
    )

    assert created.workspace_id == "alpha-project-fork"
    assert (
        created.root_path
        == (tmp_path / "storage" / "alpha-project-fork" / "worktree").resolve()
    )
    assert created.profile.file_scope.backend == FileScopeBackend.GIT_WORKTREE
    assert created.profile.file_scope.branch_name == "fork/alpha-project-fork"
    assert created.profile.file_scope.source_root_path == str(root_path.resolve())
    assert created.profile.file_scope.forked_from_workspace_id == "project-alpha"
    assert git_client.ensure_calls == [root_path.resolve()]
    assert git_client.head_calls == []
    assert git_client.fetch_calls == [(root_path.resolve(), "origin", "main")]
    assert git_client.resolve_ref_calls == [(root_path.resolve(), "origin/main")]
    assert git_client.add_calls == [
        (
            root_path.resolve(),
            "fork/alpha-project-fork",
            (tmp_path / "storage" / "alpha-project-fork" / "worktree").resolve(),
            "resolved:origin/main",
        )
    ]


def test_workspace_service_forks_workspace_from_explicit_start_ref(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    created = service.fork_workspace(
        source_workspace_id="project-alpha",
        name="Release Fork",
        start_ref="origin/release",
    )

    assert created.workspace_id == "release-fork"
    assert git_client.fetch_calls == []
    assert git_client.resolve_ref_calls == [(root_path.resolve(), "origin/release")]
    assert git_client.add_calls == [
        (
            root_path.resolve(),
            "fork/release-fork",
            (tmp_path / "storage" / "release-fork" / "worktree").resolve(),
            "resolved:origin/release",
        )
    ]


def test_workspace_service_fork_workspace_falls_back_to_cached_origin_main_after_fetch_timeout(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    git_client.fetch_error = ValueError("Git command timed out")
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    created = service.fork_workspace(
        source_workspace_id="project-alpha",
        name="Alpha Project Fork",
    )

    assert created.workspace_id == "alpha-project-fork"
    assert git_client.fetch_calls == [(root_path.resolve(), "origin", "main")]
    assert git_client.resolve_ref_calls == [(root_path.resolve(), "origin/main")]
    assert git_client.head_calls == []
    assert git_client.add_calls == [
        (
            root_path.resolve(),
            "fork/alpha-project-fork",
            (tmp_path / "storage" / "alpha-project-fork" / "worktree").resolve(),
            "resolved:origin/main",
        )
    ]


def test_workspace_service_fork_workspace_raises_when_timeout_has_no_cached_origin_main(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    git_client.fetch_error = ValueError("Git command timed out")
    git_client.resolve_error = ValueError(
        "Git command failed: fatal: ambiguous argument 'origin/main': unknown "
        "revision or path not in the working tree."
    )
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="cached default fork ref"):
        _ = service.fork_workspace(
            source_workspace_id="project-alpha",
            name="Alpha Project Fork",
        )

    assert git_client.fetch_calls == [(root_path.resolve(), "origin", "main")]
    assert git_client.resolve_ref_calls == [(root_path.resolve(), "origin/main")]
    assert git_client.head_calls == []
    assert git_client.add_calls == []


def test_workspace_service_fork_workspace_raises_when_remote_main_is_missing(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    git_client.fetch_error = ValueError(
        "Git command failed: fatal: couldn't find remote ref main"
    )
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="remote ref main"):
        _ = service.fork_workspace(
            source_workspace_id="project-alpha",
            name="Alpha Project Fork",
        )

    assert git_client.fetch_calls == [(root_path.resolve(), "origin", "main")]
    assert git_client.resolve_ref_calls == []
    assert git_client.head_calls == []
    assert git_client.add_calls == []


def test_workspace_service_fork_workspace_falls_back_to_current_head_when_origin_main_is_unavailable(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    git_client.fetch_error = ValueError(
        "Git command failed: fatal: 'origin' does not appear to be a git repository"
    )
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    created = service.fork_workspace(
        source_workspace_id="project-alpha",
        name="Alpha Project Fork",
    )

    assert created.workspace_id == "alpha-project-fork"
    assert git_client.fetch_calls == [(root_path.resolve(), "origin", "main")]
    assert git_client.resolve_ref_calls == []
    assert git_client.head_calls == [root_path.resolve()]
    assert git_client.add_calls == [
        (
            root_path.resolve(),
            "fork/alpha-project-fork",
            (tmp_path / "storage" / "alpha-project-fork" / "worktree").resolve(),
            "abc123",
        )
    ]


def test_workspace_service_fork_workspace_raises_when_origin_main_ref_is_missing(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    git_client.resolve_error = ValueError(
        "Git command failed: fatal: ambiguous argument 'origin/main': unknown "
        "revision or path not in the working tree."
    )
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="origin/main"):
        _ = service.fork_workspace(
            source_workspace_id="project-alpha",
            name="Alpha Project Fork",
        )

    assert git_client.fetch_calls == [(root_path.resolve(), "origin", "main")]
    assert git_client.resolve_ref_calls == [(root_path.resolve(), "origin/main")]
    assert git_client.head_calls == []
    assert git_client.add_calls == []


def test_workspace_service_fork_workspace_raises_when_origin_main_resolve_times_out(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    git_client = FakeGitWorktreeClient()
    git_client.resolve_error = ValueError("Git command timed out")
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="timed out"):
        _ = service.fork_workspace(
            source_workspace_id="project-alpha",
            name="Alpha Project Fork",
        )

    assert git_client.fetch_calls == [(root_path.resolve(), "origin", "main")]
    assert git_client.resolve_ref_calls == [(root_path.resolve(), "origin/main")]
    assert git_client.head_calls == []
    assert git_client.add_calls == []


@pytest.mark.timeout(30)
def test_workspace_service_forks_local_git_repository_without_origin(
    tmp_path: Path,
) -> None:
    if shutil.which("git") is None:
        pytest.skip("git is required for workspace fork regression coverage")

    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    _run_git_command(root_path, "init")
    _run_git_command(root_path, "config", "user.name", "Workspace Test")
    _run_git_command(root_path, "config", "user.email", "workspace@example.com")
    (root_path / "README.md").write_text("hello\n", encoding="utf-8")
    _run_git_command(root_path, "add", ".")
    _run_git_command(root_path, "commit", "-m", "initial")
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    created = service.fork_workspace(
        source_workspace_id="project-alpha",
        name="Alpha Project Fork",
    )

    assert created.workspace_id == "alpha-project-fork"
    assert created.root_path is not None
    assert (created.root_path / "README.md").read_text(encoding="utf-8") == "hello\n"
    assert created.profile.file_scope.branch_name == "fork/alpha-project-fork"
    assert created.profile.file_scope.source_root_path == str(root_path.resolve())


def test_workspace_service_deletes_git_worktree_when_requested(tmp_path: Path) -> None:
    git_client = FakeGitWorktreeClient()
    service = StorageScopedWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        storage_root=tmp_path / "storage",
        git_worktree_client=git_client,
    )
    root_path = tmp_path / "storage" / "alpha-project-fork" / "worktree"
    root_path.mkdir(parents=True)
    _ = service.create_workspace(
        workspace_id="alpha-project-fork",
        root_path=root_path,
        profile=WorkspaceProfile(
            file_scope=WorkspaceFileScope(
                backend=FileScopeBackend.GIT_WORKTREE,
                branch_name="fork/alpha-project-fork",
                source_root_path=str((tmp_path / "workspace-root").resolve()),
                forked_from_workspace_id="project-alpha",
            )
        ),
    )

    deleted = service.delete_workspace_with_options(
        workspace_id="alpha-project-fork",
        remove_directory=True,
    )

    assert deleted.workspace_id == "alpha-project-fork"
    assert git_client.remove_calls == [
        ((tmp_path / "workspace-root").resolve(), root_path.resolve())
    ]
    assert git_client.prune_calls == [(tmp_path / "workspace-root").resolve()]
    assert root_path.exists() is False
    assert service.list_workspaces() == ()


def test_workspace_service_deletes_workspace(tmp_path: Path) -> None:
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    service.delete_workspace("project-alpha")

    assert root_path.exists() is True
    assert service.list_workspaces() == ()


def test_workspace_service_deletes_workspace_directory_when_requested(
    tmp_path: Path,
) -> None:
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    deleted = service.delete_workspace_with_options(
        workspace_id="project-alpha",
        remove_directory=True,
    )

    assert deleted.workspace_id == "project-alpha"
    assert root_path.exists() is False
    assert service.list_workspaces() == ()


def test_workspace_service_keeps_record_when_directory_removal_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    original_rmtree = shutil.rmtree

    def fail_rmtree(path: Path, ignore_errors: bool = False) -> None:
        _ = ignore_errors
        if Path(path) == root_path:
            raise PermissionError("permission denied")
        original_rmtree(path)

    monkeypatch.setattr(shutil, "rmtree", fail_rmtree)

    with pytest.raises(RuntimeError, match="Failed to remove workspace path"):
        _ = service.delete_workspace_with_options(
            workspace_id="project-alpha",
            remove_directory=True,
        )

    assert root_path.exists() is True
    assert [workspace.workspace_id for workspace in service.list_workspaces()] == [
        "project-alpha"
    ]


def test_workspace_service_returns_progressive_snapshot_and_tree_listing(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    (root_path / "src" / "nested").mkdir(parents=True)
    (root_path / "docs").mkdir(parents=True)
    (root_path / "src" / "app.py").write_text('print("new")' + "\n", encoding="utf-8")
    (root_path / "src" / "nested" / "tool.py").write_text(
        'print("tool")' + "\n", encoding="utf-8"
    )
    (root_path / "docs" / "README.md").write_text(
        "# Root Docs" + "\n", encoding="utf-8"
    )
    (root_path / "package.json").write_text("{}" + "\n", encoding="utf-8")

    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    snapshot = service.get_workspace_snapshot("project-alpha")
    src_listing = service.get_workspace_tree_listing(
        "project-alpha",
        directory_path="src",
    )

    assert snapshot.workspace_id == "project-alpha"
    assert snapshot.root_path == root_path.resolve()
    assert snapshot.default_mount_name == "default"
    assert snapshot.tree.path == "."
    assert [item.path for item in snapshot.tree.children] == ["default"]
    assert snapshot.tree.children[0].has_children is True
    assert snapshot.tree.children[0].children == ()
    assert src_listing.workspace_id == "project-alpha"
    assert src_listing.mount_name == "default"
    assert src_listing.directory_path == "src"
    assert [item.path for item in src_listing.children] == [
        "src/nested",
        "src/app.py",
    ]
    assert src_listing.children[0].has_children is True
    assert src_listing.children[1].has_children is False


def test_workspace_service_searches_local_paths_and_skips_heavy_dirs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    (root_path / "src").mkdir(parents=True)
    (root_path / "node_modules" / "pkg").mkdir(parents=True)
    (root_path / ".git").mkdir(parents=True)
    (root_path / "src" / "app.py").write_text('print("new")\n', encoding="utf-8")
    (root_path / "node_modules" / "pkg" / "app.js").write_text(
        "console.log(1)\n",
        encoding="utf-8",
    )
    calls: list[tuple[str, ...]] = []

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout="src/app.py\n",
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)

    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    listing = service.search_workspace_paths(
        "project-alpha",
        query="app",
    )

    assert listing.workspace_id == "project-alpha"
    assert listing.query == "app"
    assert [item.path for item in listing.results] == ["src/app.py"]
    assert listing.results[0].kind == WorkspaceTreeNodeKind.FILE
    assert listing.results[0].mount_name == "default"
    assert any(arg == "--glob=!**/node_modules/**" for arg in calls[0])
    assert "--glob=!.git/*" in calls[0]


def test_workspace_service_search_uses_ripgrep_index_and_derived_dirs(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    calls: list[tuple[str, ...]] = []

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        calls.append(tuple(command))
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout="src/relay_teams/main.py\nREADME.md\n",
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(workspace_id="project-alpha", root_path=root_path)

    listing = service.search_workspace_paths("project-alpha", query="relay", limit=10)

    assert calls
    assert "--files" in calls[0]
    assert [item.path for item in listing.results] == [
        "src/relay_teams/",
        "src/relay_teams/main.py",
    ]
    assert listing.results[0].kind == WorkspaceTreeNodeKind.DIRECTORY


def test_workspace_service_search_lists_directory_children_for_trailing_slash_query(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        _ = command
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout=(
                "src/relay_teams/media/__init__.py\n"
                "src/relay_teams/media/models.py\n"
                "src/relay_teams/media/prompt_content.py\n"
                "src/relay_teams/main.py\n"
            ),
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(workspace_id="project-alpha", root_path=root_path)

    listing = service.search_workspace_paths(
        "project-alpha",
        query="src/relay_teams/media/",
        limit=10,
    )

    assert [item.path for item in listing.results] == [
        "src/relay_teams/media/__init__.py",
        "src/relay_teams/media/models.py",
        "src/relay_teams/media/prompt_content.py",
    ]
    assert all(item.kind == WorkspaceTreeNodeKind.FILE for item in listing.results)


def test_workspace_service_search_falls_back_to_directory_listing_for_trailing_slash(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    target_dir = root_path / "src" / "relay_teams" / "gateway"
    target_dir.mkdir(parents=True)
    (target_dir / "__init__.py").write_text("", encoding="utf-8")
    (target_dir / "gateway_models.py").write_text("", encoding="utf-8")

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        _ = command
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout="README.md\n",
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(workspace_id="project-alpha", root_path=root_path)

    listing = service.search_workspace_paths(
        "project-alpha",
        query="src/relay_teams/gateway/",
        limit=10,
    )

    assert [item.path for item in listing.results] == [
        "src/relay_teams/gateway/__init__.py",
        "src/relay_teams/gateway/gateway_models.py",
    ]
    assert all(item.kind == WorkspaceTreeNodeKind.FILE for item in listing.results)


def test_workspace_service_search_trailing_slash_fallback_preserves_query_case(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    requested_directories: list[str] = []

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        _ = command
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout="README.md\n",
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(workspace_id="project-alpha", root_path=root_path)

    def fake_tree_listing(
        workspace_id: str,
        *,
        directory_path: str = ".",
        mount_name: str | None = None,
    ) -> WorkspaceTreeListing:
        requested_directories.append(directory_path)
        return WorkspaceTreeListing(
            workspace_id=workspace_id,
            mount_name=mount_name or "default",
            directory_path=directory_path,
            children=(
                WorkspaceTreeNode(
                    name="Models.py",
                    path=f"{directory_path}Models.py",
                    kind=WorkspaceTreeNodeKind.FILE,
                    has_children=False,
                ),
            ),
        )

    monkeypatch.setattr(service, "get_workspace_tree_listing", fake_tree_listing)

    listing = service.search_workspace_paths(
        "project-alpha",
        query="Src/Relay_Teams/Media/",
        limit=10,
    )

    assert requested_directories == ["Src/Relay_Teams/Media/"]
    assert [item.path for item in listing.results] == [
        "Src/Relay_Teams/Media/Models.py"
    ]


def test_workspace_service_search_reuses_index_between_queries(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    call_count = 0

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        nonlocal call_count
        call_count += 1
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout="src/app.py\nsrc/domain.py\n",
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(workspace_id="project-alpha", root_path=root_path)

    first = service.search_workspace_paths("project-alpha", query="app")
    second = service.search_workspace_paths("project-alpha", query="domain")

    assert [item.path for item in first.results] == ["src/app.py"]
    assert [item.path for item in second.results] == ["src/domain.py"]
    assert call_count == 1


def test_workspace_service_search_without_ripgrep_returns_shallow_index_first(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    (root_path / "src" / "relay_teams").mkdir(parents=True)
    (root_path / "src" / "relay_teams" / "main.py").write_text(
        'print("new")\n',
        encoding="utf-8",
    )

    monkeypatch.setattr(shutil, "which", lambda name: None)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(workspace_id="project-alpha", root_path=root_path)

    listing = service.search_workspace_paths("project-alpha", query="", limit=10)

    assert [item.path for item in listing.results] == ["src/"]
    assert listing.results[0].kind == WorkspaceTreeNodeKind.DIRECTORY


def test_workspace_service_search_sorts_hidden_paths_last_by_default(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout=".hidden/config.py\nvisible.py\n",
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(workspace_id="project-alpha", root_path=root_path)

    default_listing = service.search_workspace_paths("project-alpha", query="", limit=3)
    hidden_listing = service.search_workspace_paths(
        "project-alpha", query=".hidden", limit=3
    )

    assert default_listing.results[0].path == "visible.py"
    assert hidden_listing.results[0].path == ".hidden/"


def test_workspace_service_rejects_explicit_non_local_search_mount(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    local_root = tmp_path / "local-root"
    local_root.mkdir()
    (local_root / "src").mkdir()
    (local_root / "src" / "app.py").write_text('print("new")\n', encoding="utf-8")

    def fake_run(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        return subprocess.CompletedProcess(
            args=tuple(command),
            returncode=0,
            stdout="src/app.py\n",
            stderr="",
        )

    monkeypatch.setattr(shutil, "which", lambda name: "rg" if name == "rg" else None)
    monkeypatch.setattr(subprocess, "run", fake_run)

    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            WorkspaceMountRecord(
                mount_name="container",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="container",
                    remote_root="/srv/app",
                ),
            ),
            build_local_workspace_mount(mount_name="default", root_path=local_root),
        ),
        default_mount_name="container",
    )

    fallback_listing = service.search_workspace_paths(
        "project-alpha",
        query="app",
    )

    assert [item.path for item in fallback_listing.results] == ["src/app.py"]
    assert fallback_listing.results[0].mount_name == "default"
    with pytest.raises(ValueError, match="Workspace mount is not local: container"):
        _ = service.search_workspace_paths(
            "project-alpha",
            query="app",
            mount_name="container",
        )


def test_workspace_service_lists_ssh_mount_tree_with_saved_profile(
    tmp_path: Path,
) -> None:
    captured_commands: list[tuple[str, ...]] = []

    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        captured_commands.append(command_tuple)
        remote_command = command_tuple[-1]
        stdout = (
            "file\t0\tmain.py\n"
            if "/srv/app/src" in remote_command
            else "file\t0\tREADME.md\ndirectory\t1\tsrc\n"
        )
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=0,
            stdout=stdout,
            stderr="",
        )

    local_root = tmp_path / "local-root"
    local_root.mkdir()
    ssh_profile_service = SshProfileService(
        repository=SshProfileRepository(tmp_path / "ssh_profiles.db"),
        config_dir=tmp_path,
        secret_store=SshProfileSecretStore(secret_store=_FileOnlySecretStore()),
        ssh_path_lookup=lambda _name: "/usr/bin/ssh",
        process_runner=run_ssh_command,
    )
    _ = ssh_profile_service.save_profile(
        ssh_profile_id="container",
        config=SshProfileConfig(
            host="127.0.0.1",
            username="root",
            port=2222,
            password="secret",
        ),
    )
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        ssh_profile_service=ssh_profile_service,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            build_local_workspace_mount(mount_name="default", root_path=local_root),
            WorkspaceMountRecord(
                mount_name="container",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="container",
                    remote_root="/srv/app",
                ),
            ),
        ),
        default_mount_name="default",
    )

    root_listing = service.get_workspace_tree_listing(
        "project-alpha",
        directory_path=".",
        mount_name="container",
    )
    src_listing = service.get_workspace_tree_listing(
        "project-alpha",
        directory_path="src",
        mount_name="container",
    )

    assert root_listing.mount_name == "container"
    assert root_listing.directory_path == "."
    assert [item.path for item in root_listing.children] == ["src", "README.md"]
    assert root_listing.children[0].has_children is True
    assert src_listing.directory_path == "src"
    assert [item.path for item in src_listing.children] == ["src/main.py"]
    assert captured_commands[0][-3:-1] == ("--", "127.0.0.1")
    assert "BatchMode=no" in captured_commands[0]
    assert "/srv/app" in captured_commands[0][-1]
    assert "/srv/app/src" in captured_commands[1][-1]


@pytest.mark.asyncio
async def test_workspace_service_reads_ssh_mount_file_content(
    tmp_path: Path,
) -> None:
    captured_commands: list[tuple[str, ...]] = []
    content = b"# README\n\nhello from ssh\n"

    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        captured_commands.append(command_tuple)
        encoded = base64.b64encode(content).decode("ascii")
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=0,
            stdout=f"{len(content)}\n{encoded}\n",
            stderr="",
        )

    local_root = tmp_path / "local-root"
    local_root.mkdir()
    ssh_profile_service = SshProfileService(
        repository=SshProfileRepository(tmp_path / "ssh_profiles.db"),
        config_dir=tmp_path,
        secret_store=SshProfileSecretStore(secret_store=_FileOnlySecretStore()),
        ssh_path_lookup=lambda _name: "/usr/bin/ssh",
        process_runner=run_ssh_command,
    )
    _ = ssh_profile_service.save_profile(
        ssh_profile_id="container",
        config=SshProfileConfig(
            host="127.0.0.1",
            username="root",
            port=2222,
            password="secret",
        ),
    )
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        ssh_profile_service=ssh_profile_service,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            build_local_workspace_mount(mount_name="default", root_path=local_root),
            WorkspaceMountRecord(
                mount_name="container",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="container",
                    remote_root="/srv/app",
                ),
            ),
        ),
        default_mount_name="default",
    )

    file_content = await service.get_workspace_file_content_async(
        "project-alpha",
        path="docs/readme.md",
        mount_name="container",
    )

    assert file_content.mount_name == "container"
    assert file_content.path == "docs/readme.md"
    assert file_content.content == content.decode("utf-8")
    assert file_content.encoding == "utf-8"
    assert file_content.size_bytes == len(content)
    assert file_content.is_binary is False
    assert " /srv/app " in captured_commands[0][-1]
    assert "/srv/app/docs/readme.md" in captured_commands[0][-1]


@pytest.mark.parametrize(
    ("stdout", "returncode", "expected_error", "match"),
    (
        ("relay-teams-error:not-found\n", 2, FileNotFoundError, "not found"),
        ("relay-teams-error:not-file\n", 3, ValueError, "not a file"),
        ("relay-teams-error:outside-root\n", 4, ValueError, "escapes root"),
        ("permission denied\n", 1, ValueError, "Workspace ssh mount command failed"),
    ),
)
@pytest.mark.asyncio
async def test_workspace_service_handles_ssh_mount_file_read_errors(
    tmp_path: Path,
    stdout: str,
    returncode: int,
    expected_error: type[Exception],
    match: str,
) -> None:
    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=returncode,
            stdout=stdout,
            stderr="",
        )

    service = _build_ssh_workspace_service(
        tmp_path,
        process_runner=run_ssh_command,
    )

    with pytest.raises(expected_error, match=match):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="docs/readme.md",
            mount_name="container",
        )


@pytest.mark.parametrize("stdout", ("", "not-a-size\n"))
@pytest.mark.asyncio
async def test_workspace_service_rejects_malformed_ssh_mount_file_payload(
    tmp_path: Path,
    stdout: str,
) -> None:
    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=0,
            stdout=stdout,
            stderr="",
        )

    service = _build_ssh_workspace_service(
        tmp_path,
        process_runner=run_ssh_command,
    )

    with pytest.raises(ValueError, match="malformed file payload"):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="docs/readme.md",
            mount_name="container",
        )


@pytest.mark.asyncio
async def test_workspace_service_returns_ssh_mount_binary_file_state(
    tmp_path: Path,
) -> None:
    content = b"abc\0def"

    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        encoded = base64.b64encode(content).decode("ascii")
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=0,
            stdout=f"{len(content)}\n{encoded}\n",
            stderr="",
        )

    service = _build_ssh_workspace_service(
        tmp_path,
        process_runner=run_ssh_command,
    )

    file_content = await service.get_workspace_file_content_async(
        "project-alpha",
        path="artifacts/blob.bin",
        mount_name="container",
    )

    assert file_content.content == ""
    assert file_content.encoding == "binary"
    assert file_content.is_binary is True
    assert file_content.size_bytes == len(content)


def test_workspace_service_returns_ssh_mount_git_diff(
    tmp_path: Path,
) -> None:
    captured_remote_commands: list[str] = []
    patch = (
        "diff --git a/src/app.py b/src/app.py\n"
        "--- a/src/app.py\n"
        "+++ b/src/app.py\n"
        "@@ -1 +1 @@\n"
        "-print('old')\n"
        "+print('new')\n"
    )

    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        remote_command = command_tuple[-1]
        captured_remote_commands.append(remote_command)
        stdout = ""
        if "rev-parse --show-toplevel" in remote_command:
            stdout = "/srv/app\n"
        elif "rev-parse --verify HEAD" in remote_command:
            stdout = "abc123\n"
        elif "diff --relative --name-status --find-renames HEAD -- ." in remote_command:
            stdout = "M\tsrc/app.py\n"
        elif "ls-files --others --exclude-standard -- ." in remote_command:
            stdout = "notes/todo.txt\n"
        elif (
            "diff --relative --no-ext-diff --find-renames HEAD -- ':(literal)src/app.py'"
            in remote_command
        ):
            stdout = patch
        else:
            raise AssertionError(f"unexpected remote command: {remote_command}")
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=0,
            stdout=stdout,
            stderr="",
        )

    local_root = tmp_path / "local-root"
    local_root.mkdir()
    ssh_profile_service = SshProfileService(
        repository=SshProfileRepository(tmp_path / "ssh_profiles.db"),
        config_dir=tmp_path,
        secret_store=SshProfileSecretStore(secret_store=_FileOnlySecretStore()),
        ssh_path_lookup=lambda _name: "/usr/bin/ssh",
        process_runner=run_ssh_command,
    )
    _ = ssh_profile_service.save_profile(
        ssh_profile_id="container",
        config=SshProfileConfig(
            host="127.0.0.1",
            username="root",
            port=2222,
            password="secret",
        ),
    )
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db"),
        ssh_profile_service=ssh_profile_service,
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            build_local_workspace_mount(mount_name="default", root_path=local_root),
            WorkspaceMountRecord(
                mount_name="container",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="container",
                    remote_root="/srv/app",
                ),
            ),
        ),
        default_mount_name="default",
    )

    listing = service.get_workspace_diffs("project-alpha", mount_name="container")
    diff_file = service.get_workspace_diff_file(
        "project-alpha",
        path="src/app.py",
        mount_name="container",
    )

    assert listing.mount_name == "container"
    assert listing.is_git_repository is True
    assert listing.git_root_path == "/srv/app"
    assert [item.path for item in listing.diff_files] == [
        "notes/todo.txt",
        "src/app.py",
    ]
    assert listing.diff_files[0].change_type == WorkspaceDiffChangeType.UNTRACKED
    assert listing.diff_files[1].change_type == WorkspaceDiffChangeType.MODIFIED
    assert diff_file.mount_name == "container"
    assert diff_file.diff == patch
    assert diff_file.is_binary is False
    assert any(
        command.startswith("git -C /srv/app ") for command in captured_remote_commands
    )


def test_workspace_service_hides_non_git_ssh_mount_diff_stderr(
    tmp_path: Path,
) -> None:
    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=1,
            stdout="",
            stderr="fatal: not a git repository (or any of the parent directories): .git",
        )

    service = _build_ssh_workspace_service(
        tmp_path,
        process_runner=run_ssh_command,
    )

    diffs = service.get_workspace_diffs("project-alpha", mount_name="container")

    assert diffs.is_git_repository is False
    assert diffs.diff_message is None
    assert diffs.diff_files == ()


def test_workspace_service_uses_cached_ssh_diff_without_head_and_untracked_patch(
    tmp_path: Path,
) -> None:
    rename_patch = (
        "diff --git a/old.py b/new.py\n"
        "similarity index 100%\n"
        "rename from old.py\n"
        "rename to new.py\n"
    )
    untracked_patch = (
        "diff --git a/notes/new.txt b/notes/new.txt\n"
        "new file mode 100644\n"
        "--- /dev/null\n"
        "+++ b/notes/new.txt\n"
        "@@ -0,0 +1 @@\n"
        "+new\n"
    )

    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        remote_command = command_tuple[-1]
        stdout = ""
        stderr = ""
        returncode = 0
        if "rev-parse --show-toplevel" in remote_command:
            stdout = "/srv/app\n"
        elif "rev-parse --verify HEAD" in remote_command:
            returncode = 1
            stderr = "fatal: Needed a single revision"
        elif (
            "diff --relative --cached --name-status --find-renames -- ."
            in remote_command
        ):
            stdout = "R100\told.py\tnew.py\nM\tsrc/app.py\n"
        elif "ls-files --others --exclude-standard -- ." in remote_command:
            stdout = "./src/app.py\nnotes/new.txt\n"
        elif "diff --no-ext-diff --no-index -- /dev/null new.py" in remote_command:
            stdout = rename_patch
            returncode = 1
        elif (
            "diff --no-ext-diff --no-index -- /dev/null notes/new.txt" in remote_command
        ):
            stdout = untracked_patch
            returncode = 1
        else:
            raise AssertionError(f"unexpected remote command: {remote_command}")
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=returncode,
            stdout=stdout,
            stderr=stderr,
        )

    service = _build_ssh_workspace_service(
        tmp_path,
        process_runner=run_ssh_command,
    )

    listing = service.get_workspace_diffs("project-alpha", mount_name="container")
    renamed_diff = service.get_workspace_diff_file(
        "project-alpha",
        path="new.py",
        mount_name="container",
    )
    untracked_diff = service.get_workspace_diff_file(
        "project-alpha",
        path="notes/new.txt",
        mount_name="container",
    )

    assert [item.path for item in listing.diff_files] == [
        "new.py",
        "notes/new.txt",
        "src/app.py",
    ]
    assert listing.diff_files[0].previous_path == "old.py"
    assert renamed_diff.diff == rename_patch
    assert untracked_diff.diff == untracked_patch


def test_workspace_service_returns_ssh_diff_paths_relative_to_mount_root(
    tmp_path: Path,
) -> None:
    patch = (
        "diff --git a/f.txt b/f.txt\n"
        "--- a/f.txt\n"
        "+++ b/f.txt\n"
        "@@ -1 +1 @@\n"
        "-old\n"
        "+new\n"
    )

    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        remote_command = command_tuple[-1]
        stdout = ""
        if "rev-parse --show-toplevel" in remote_command:
            stdout = "/srv/app\n"
        elif "rev-parse --verify HEAD" in remote_command:
            stdout = "abc123\n"
        elif "diff --relative --name-status --find-renames HEAD -- ." in remote_command:
            stdout = "M\tf.txt\n"
        elif "ls-files --others --exclude-standard -- ." in remote_command:
            stdout = ""
        elif (
            "diff --relative --no-ext-diff --find-renames HEAD -- ':(literal)f.txt'"
            in remote_command
        ):
            stdout = patch
        else:
            raise AssertionError(f"unexpected remote command: {remote_command}")
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=0,
            stdout=stdout,
            stderr="",
        )

    service = _build_ssh_workspace_service(
        tmp_path,
        process_runner=run_ssh_command,
        remote_root="/srv/app/sub",
    )

    listing = service.get_workspace_diffs("project-alpha", mount_name="container")
    diff_file = service.get_workspace_diff_file(
        "project-alpha",
        path="f.txt",
        mount_name="container",
    )

    assert [item.path for item in listing.diff_files] == ["f.txt"]
    assert diff_file.diff == patch


@pytest.mark.asyncio
async def test_workspace_service_rejects_unreadable_file_mount(tmp_path: Path) -> None:
    local_root = tmp_path / "local-root"
    local_root.mkdir()
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    readonly_mount = build_local_workspace_mount(
        mount_name="readonly",
        root_path=local_root,
    ).model_copy(update={"capabilities": WorkspaceMountCapabilities(can_read=False)})
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(readonly_mount,),
        default_mount_name="readonly",
    )

    with pytest.raises(ValueError, match="does not support file read"):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="README.md",
        )


@pytest.mark.asyncio
async def test_workspace_service_rejects_ssh_mount_without_profile_service(
    tmp_path: Path,
) -> None:
    local_root = tmp_path / "local-root"
    local_root.mkdir()
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            build_local_workspace_mount(mount_name="default", root_path=local_root),
            WorkspaceMountRecord(
                mount_name="container",
                provider=WorkspaceMountProvider.SSH,
                provider_config=WorkspaceSshMountConfig(
                    ssh_profile_id="container",
                    remote_root="/srv/app",
                ),
            ),
        ),
        default_mount_name="default",
    )

    with pytest.raises(ValueError, match="without ssh profiles"):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="README.md",
            mount_name="container",
        )


@pytest.mark.asyncio
async def test_workspace_service_rejects_relative_ssh_mount_root(
    tmp_path: Path,
) -> None:
    def run_ssh_command(
        command: Sequence[str],
        **_kwargs: object,
    ) -> subprocess.CompletedProcess[str]:
        command_tuple = tuple(command)
        return subprocess.CompletedProcess(
            args=command_tuple,
            returncode=0,
            stdout="",
            stderr="",
        )

    service = _build_ssh_workspace_service(
        tmp_path,
        process_runner=run_ssh_command,
        remote_root="srv/app",
    )

    with pytest.raises(ValueError, match="remote root must be absolute"):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="README.md",
            mount_name="container",
        )


def test_workspace_service_rejects_tree_path_that_escapes_workspace_root(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="escapes root"):
        _ = service.get_workspace_tree_listing(
            "project-alpha",
            directory_path="../outside",
        )


def test_workspace_service_returns_image_preview_for_absolute_workspace_path(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    image_path = root_path / "artifacts" / "brief.png"
    image_path.parent.mkdir(parents=True)
    image_path.write_bytes(b"not-a-real-png")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    preview_path, media_type = service.get_workspace_image_preview_file(
        "project-alpha",
        path=str(image_path.resolve()),
    )

    assert preview_path == image_path.resolve()
    assert media_type == "image/png"


def test_workspace_service_rejects_non_image_preview_file(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    text_path = root_path / "notes.txt"
    root_path.mkdir()
    text_path.write_text("hello\n", encoding="utf-8")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="supported image"):
        _ = service.get_workspace_image_preview_file(
            "project-alpha",
            path="notes.txt",
        )


@pytest.mark.asyncio
async def test_workspace_service_returns_text_file_content(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    file_path = root_path / "docker" / "eval-entrypoint.sh"
    file_path.parent.mkdir(parents=True)
    expected_content = '#!/bin/sh\nexec "$@"\n'
    file_path.write_bytes(expected_content.encode("utf-8"))
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    content = await service.get_workspace_file_content_async(
        "project-alpha",
        path="docker/eval-entrypoint.sh",
    )

    assert content.workspace_id == "project-alpha"
    assert content.mount_name == "default"
    assert content.path == "docker/eval-entrypoint.sh"
    assert content.content == expected_content
    assert content.encoding == "utf-8"
    assert content.is_binary is False
    assert content.truncated is False
    assert content.size_bytes == len(expected_content.encode("utf-8"))


@pytest.mark.asyncio
async def test_workspace_service_file_content_respects_readable_paths(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    allowed_file = root_path / "allowed" / "visible.txt"
    private_file = root_path / "private" / "secret.txt"
    allowed_file.parent.mkdir(parents=True)
    private_file.parent.mkdir(parents=True)
    allowed_file.write_bytes(b"visible\n")
    private_file.write_bytes(b"secret\n")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        mounts=(
            build_local_workspace_mount(
                mount_name="default",
                root_path=root_path,
                readable_paths=("allowed",),
                writable_paths=("allowed",),
            ),
        ),
        default_mount_name="default",
    )

    content = await service.get_workspace_file_content_async(
        "project-alpha",
        path="allowed/visible.txt",
    )

    assert content.content == "visible\n"
    with pytest.raises(ValueError, match="outside readable paths"):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="private/secret.txt",
        )


@pytest.mark.asyncio
async def test_workspace_service_rejects_directory_file_content(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    (root_path / "src").mkdir(parents=True)
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="not a file"):
        _ = await service.get_workspace_file_content_async("project-alpha", path="src")


@pytest.mark.asyncio
async def test_workspace_service_rejects_missing_file_content(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(FileNotFoundError, match="not found"):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="missing.txt",
        )


@pytest.mark.asyncio
async def test_workspace_service_rejects_file_content_path_escape(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    outside_path = tmp_path / "outside.txt"
    root_path.mkdir()
    outside_path.write_text("outside\n", encoding="utf-8")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="escapes root"):
        _ = await service.get_workspace_file_content_async(
            "project-alpha",
            path="../outside.txt",
        )


@pytest.mark.asyncio
async def test_workspace_service_returns_binary_file_content_state(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    file_path = root_path / "artifact.bin"
    root_path.mkdir()
    file_path.write_bytes(b"abc\0def")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    content = await service.get_workspace_file_content_async(
        "project-alpha",
        path="artifact.bin",
    )

    assert content.content == ""
    assert content.encoding == "binary"
    assert content.is_binary is True
    assert content.size_bytes == 7


@pytest.mark.asyncio
async def test_workspace_service_truncates_large_file_content(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    file_path = root_path / "large.txt"
    root_path.mkdir()
    file_path.write_text("a" * (600 * 1024), encoding="utf-8")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    content = await service.get_workspace_file_content_async(
        "project-alpha",
        path="large.txt",
    )

    assert content.truncated is True
    assert len(content.content) == 512 * 1024
    assert content.size_bytes == 600 * 1024


@pytest.mark.asyncio
async def test_workspace_service_truncates_utf8_preview_on_character_boundary(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    file_path = root_path / "large.txt"
    root_path.mkdir()
    preview_limit = 512 * 1024
    file_path.write_bytes((b"a" * (preview_limit - 1)) + "中".encode("utf-8"))
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    content = await service.get_workspace_file_content_async(
        "project-alpha",
        path="large.txt",
    )

    assert content.is_binary is False
    assert content.encoding == "utf-8"
    assert content.truncated is True
    assert content.content == "a" * (preview_limit - 1)


def test_workspace_service_returns_git_diffs_separately(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    (root_path / "src").mkdir(parents=True)
    (root_path / "docs").mkdir()
    (root_path / "notes").mkdir()
    (root_path / "src" / "app.py").write_text('print("new")' + "\n", encoding="utf-8")
    (root_path / "docs" / "README.md").write_text(
        "# Root Docs" + "\n", encoding="utf-8"
    )
    (root_path / "notes" / "todo.txt").write_text("todo" + "\n", encoding="utf-8")
    (root_path / "package.json").write_text("{}" + "\n", encoding="utf-8")

    class SnapshotWorkspaceService(WorkspaceService):
        def _run_git(
            self,
            args: tuple[str, ...],
            *,
            cwd: Path,
            text: bool = True,
            allowed_exit_codes: tuple[int, ...] = (0,),
        ) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
            _ = (cwd, allowed_exit_codes)
            if args == ("rev-parse", "--show-toplevel"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=f"{root_path.resolve()}\n",
                    stderr="",
                )
            if args == ("rev-parse", "--verify", "HEAD"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="abc123\n",
                    stderr="",
                )
            if args == (
                "diff",
                "--relative",
                "--name-status",
                "--find-renames",
                "HEAD",
                "--",
            ):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="R100\tREADME.md\tdocs/README.md\nM\tsrc/app.py\n",
                    stderr="",
                )
            if args == ("ls-files", "--others", "--exclude-standard"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="notes/todo.txt\n",
                    stderr="",
                )
            if args == ("show", "HEAD:README.md"):
                if text:
                    return subprocess.CompletedProcess(
                        args=["git", *args],
                        returncode=0,
                        stdout="# Root Docs\n",
                        stderr="",
                    )
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=b"# Root Docs\n",
                    stderr=b"",
                )
            if args == ("show", "HEAD:src/app.py"):
                if text:
                    return subprocess.CompletedProcess(
                        args=["git", *args],
                        returncode=0,
                        stdout='print("old")\n',
                        stderr="",
                    )
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=b'print("old")\n',
                    stderr=b"",
                )
            if args == (
                "diff",
                "--relative",
                "--no-ext-diff",
                "--find-renames",
                "HEAD",
                "--",
                ":(literal)src/app.py",
            ):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=(
                        "diff --git a/src/app.py b/src/app.py\n"
                        "--- a/src/app.py\n"
                        "+++ b/src/app.py\n"
                        "@@ -1 +1 @@\n"
                        '-print("old")\n'
                        '+print("new")\n'
                    ),
                    stderr="",
                )
            if args == (
                "diff",
                "--relative",
                "--no-ext-diff",
                "--find-renames",
                "HEAD",
                "--",
                ":(literal)README.md",
                ":(literal)docs/README.md",
            ):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=(
                        "diff --git a/README.md b/docs/README.md\n"
                        "similarity index 100%\n"
                        "rename from README.md\n"
                        "rename to docs/README.md\n"
                    ),
                    stderr="",
                )
            raise AssertionError(f"Unexpected git command: {args}")

    service = SnapshotWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    diffs = service.get_workspace_diffs("project-alpha")
    diff_file = service.get_workspace_diff_file(
        "project-alpha",
        path="src/app.py",
    )
    renamed_diff_file = service.get_workspace_diff_file(
        "project-alpha",
        path="docs/README.md",
    )
    untracked_diff_file = service.get_workspace_diff_file(
        "project-alpha",
        path="notes/todo.txt",
    )

    assert diffs.workspace_id == "project-alpha"
    assert diffs.root_path == root_path.resolve()
    assert diffs.is_git_repository is True
    assert diffs.git_root_path == root_path.resolve()
    assert [item.path for item in diffs.diff_files] == [
        "docs/README.md",
        "notes/todo.txt",
        "src/app.py",
    ]
    assert diffs.diff_files[0].change_type.value == "renamed"
    assert diffs.diff_files[0].previous_path == "README.md"
    assert diffs.diff_files[1].change_type.value == "untracked"
    assert diffs.diff_files[2].change_type.value == "modified"

    assert diff_file.path == "src/app.py"
    assert diff_file.change_type.value == "modified"
    assert '-print("old")' in diff_file.diff
    assert '+print("new")' in diff_file.diff
    assert renamed_diff_file.previous_path == "README.md"
    assert "rename from README.md" in renamed_diff_file.diff
    assert untracked_diff_file.change_type.value == "untracked"
    assert "+todo" in untracked_diff_file.diff


def test_workspace_service_non_git_diff_listing_hides_git_stderr(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()

    class NonGitWorkspaceService(WorkspaceService):
        def _run_git(
            self,
            args: tuple[str, ...],
            *,
            cwd: Path,
            text: bool = True,
            allowed_exit_codes: tuple[int, ...] = (0,),
        ) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
            _ = (cwd, text, allowed_exit_codes)
            if args == ("rev-parse", "--show-toplevel"):
                raise ValueError(
                    "Git command failed: fatal: not a git repository "
                    "(or any of the parent directories): .git"
                )
            raise AssertionError(f"Unexpected git command: {args}")

    service = NonGitWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    diffs = service.get_workspace_diffs("project-alpha")

    assert diffs.is_git_repository is False
    assert diffs.diff_message is None
    assert diffs.diff_files == ()


def test_workspace_service_rejects_missing_diff_file(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    (root_path / "src").mkdir()
    (root_path / "src" / "app.py").write_text('print("new")' + "\n", encoding="utf-8")

    class SnapshotWorkspaceService(WorkspaceService):
        def _run_git(
            self,
            args: tuple[str, ...],
            *,
            cwd: Path,
            text: bool = True,
            allowed_exit_codes: tuple[int, ...] = (0,),
        ) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
            _ = (cwd, allowed_exit_codes)
            if args == ("rev-parse", "--show-toplevel"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=f"{root_path.resolve()}\n",
                    stderr="",
                )
            if args == ("rev-parse", "--verify", "HEAD"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="abc123\n",
                    stderr="",
                )
            if args == (
                "diff",
                "--relative",
                "--name-status",
                "--find-renames",
                "HEAD",
                "--",
            ):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="M	src/app.py\n",
                    stderr="",
                )
            if args == ("ls-files", "--others", "--exclude-standard"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="",
                    stderr="",
                )
            if args == ("show", "HEAD:src/app.py"):
                if text:
                    return subprocess.CompletedProcess(
                        args=["git", *args],
                        returncode=0,
                        stdout='print("old")\n',
                        stderr="",
                    )
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=b'print("old")\n',
                    stderr=b"",
                )
            raise AssertionError(f"Unexpected git command: {args}")

    service = SnapshotWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    with pytest.raises(ValueError, match="not found"):
        _ = service.get_workspace_diff_file(
            "project-alpha",
            path="missing.py",
        )


def test_workspace_service_uses_cached_git_diff_without_head(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    (root_path / "src").mkdir()
    (root_path / "src" / "app.py").write_text('print("new")\n', encoding="utf-8")

    class SnapshotWorkspaceService(WorkspaceService):
        def _run_git(
            self,
            args: tuple[str, ...],
            *,
            cwd: Path,
            text: bool = True,
            allowed_exit_codes: tuple[int, ...] = (0,),
        ) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
            _ = (cwd, text, allowed_exit_codes)
            if args == ("rev-parse", "--show-toplevel"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=f"{root_path.resolve()}\n",
                    stderr="",
                )
            if args == ("rev-parse", "--verify", "HEAD"):
                raise ValueError("Git command failed: fatal: Needed a single revision")
            if args == (
                "diff",
                "--relative",
                "--cached",
                "--name-status",
                "--find-renames",
                "--",
            ):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="M\tsrc/app.py\n",
                    stderr="",
                )
            if args == ("ls-files", "--others", "--exclude-standard"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="",
                    stderr="",
                )
            if args == (
                "diff",
                "--no-ext-diff",
                "--no-index",
                "--",
                "/dev/null",
                "src/app.py",
            ):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout='+print("new")\n',
                    stderr="",
                )
            raise AssertionError(f"Unexpected git command: {args}")

    service = SnapshotWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    diffs = service.get_workspace_diffs("project-alpha")
    diff_file = service.get_workspace_diff_file("project-alpha", path="src/app.py")

    assert diffs.diff_files[0].path == "src/app.py"
    assert diff_file.diff == '+print("new")\n'


def test_workspace_service_returns_binary_git_diff_state(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    (root_path / "artifact.bin").write_bytes(b"abc\0new")

    class SnapshotWorkspaceService(WorkspaceService):
        def _run_git(
            self,
            args: tuple[str, ...],
            *,
            cwd: Path,
            text: bool = True,
            allowed_exit_codes: tuple[int, ...] = (0,),
        ) -> subprocess.CompletedProcess[str] | subprocess.CompletedProcess[bytes]:
            _ = (cwd, allowed_exit_codes)
            if args == ("rev-parse", "--show-toplevel"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=f"{root_path.resolve()}\n",
                    stderr="",
                )
            if args == ("rev-parse", "--verify", "HEAD"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="abc123\n",
                    stderr="",
                )
            if args == (
                "diff",
                "--relative",
                "--name-status",
                "--find-renames",
                "HEAD",
                "--",
            ):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="M\tartifact.bin\n",
                    stderr="",
                )
            if args == ("ls-files", "--others", "--exclude-standard"):
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout="",
                    stderr="",
                )
            if args == ("show", "HEAD:artifact.bin"):
                if text:
                    return subprocess.CompletedProcess(
                        args=["git", *args],
                        returncode=0,
                        stdout="abc",
                        stderr="",
                    )
                return subprocess.CompletedProcess(
                    args=["git", *args],
                    returncode=0,
                    stdout=b"abc\0old",
                    stderr=b"",
                )
            raise AssertionError(f"Unexpected git command: {args}")

    service = SnapshotWorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    diff_file = service.get_workspace_diff_file("project-alpha", path="artifact.bin")

    assert diff_file.is_binary is True
    assert diff_file.diff == "Binary file changed"


def test_workspace_service_binary_diff_uses_git_root_path_for_subdirectory_mount(
    tmp_path: Path,
) -> None:
    repository_root = tmp_path / "repo"
    mount_root = repository_root / "sub"
    mount_root.mkdir(parents=True)
    _run_git_command(repository_root, "init")
    _run_git_command(repository_root, "config", "user.email", "tests@example.com")
    _run_git_command(repository_root, "config", "user.name", "Tests")
    artifact_path = mount_root / "artifact.bin"
    artifact_path.write_bytes(b"abc\0old")
    _run_git_command(repository_root, "add", "sub/artifact.bin")
    _run_git_command(repository_root, "commit", "-m", "initial")
    artifact_path.unlink()
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=mount_root,
    )

    diffs = service.get_workspace_diffs("project-alpha")
    diff_file = service.get_workspace_diff_file("project-alpha", path="artifact.bin")

    assert diffs.git_root_path == repository_root.resolve()
    assert [item.path for item in diffs.diff_files] == ["artifact.bin"]
    assert diff_file.change_type.value == "deleted"
    assert diff_file.is_binary is True
    assert diff_file.diff == "Binary file changed"


def test_workspace_service_diff_uses_git_eol_normalization(tmp_path: Path) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    _run_git_command(root_path, "init")
    _run_git_command(root_path, "config", "user.email", "tests@example.com")
    _run_git_command(root_path, "config", "user.name", "Tests")
    _run_git_command(root_path, "config", "core.autocrlf", "true")
    (root_path / "src").mkdir()
    file_path = root_path / "src" / "app.py"
    file_path.write_bytes(b"one\ntwo\nthree\n")
    _run_git_command(root_path, "add", "src/app.py")
    _run_git_command(root_path, "commit", "-m", "initial")

    file_path.write_bytes(b"one\r\nTWO\r\nthree\r\n")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    diff_file = service.get_workspace_diff_file("project-alpha", path="src/app.py")
    changed_lines = [
        line
        for line in diff_file.diff.splitlines()
        if line.startswith(("+", "-")) and not line.startswith(("+++", "---"))
    ]

    assert diff_file.change_type.value == "modified"
    assert changed_lines == ["-two", "+TWO"]
    assert "-one" not in diff_file.diff
    assert "+one" not in diff_file.diff
    assert "-three" not in diff_file.diff
    assert "+three" not in diff_file.diff


def test_workspace_service_no_head_diff_uses_worktree_file_content(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    _run_git_command(root_path, "init")
    file_path = root_path / "new.txt"
    file_path.write_text("staged\n", encoding="utf-8")
    _run_git_command(root_path, "add", "new.txt")
    file_path.write_text("edited\n", encoding="utf-8")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    diff_file = service.get_workspace_diff_file("project-alpha", path="new.txt")

    assert diff_file.change_type.value == "added"
    assert "+edited" in diff_file.diff
    assert "+staged" not in diff_file.diff


def test_workspace_service_diff_treats_selected_path_as_literal(
    tmp_path: Path,
) -> None:
    root_path = tmp_path / "workspace-root"
    root_path.mkdir()
    _run_git_command(root_path, "init")
    _run_git_command(root_path, "config", "user.email", "tests@example.com")
    _run_git_command(root_path, "config", "user.name", "Tests")
    literal_path = root_path / "a[bc].txt"
    glob_match_path = root_path / "ab.txt"
    literal_path.write_text("old literal\n", encoding="utf-8")
    glob_match_path.write_text("old glob\n", encoding="utf-8")
    _run_git_command(root_path, "add", "a[bc].txt", "ab.txt")
    _run_git_command(root_path, "commit", "-m", "initial")
    literal_path.write_text("new literal\n", encoding="utf-8")
    glob_match_path.write_text("new glob\n", encoding="utf-8")
    service = WorkspaceService(
        repository=WorkspaceRepository(tmp_path / "workspace.db")
    )
    _ = service.create_workspace(
        workspace_id="project-alpha",
        root_path=root_path,
    )

    diff_file = service.get_workspace_diff_file("project-alpha", path="a[bc].txt")

    assert "a[bc].txt" in diff_file.diff
    assert "ab.txt" not in diff_file.diff
    assert "+new literal" in diff_file.diff
    assert "+new glob" not in diff_file.diff


def _update_workspace_timestamps(
    db_path: Path,
    workspace_id: str,
    *,
    created_at: datetime,
    updated_at: datetime,
) -> None:
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE workspaces
        SET created_at=?, updated_at=?
        WHERE workspace_id=?
        """,
        (created_at.isoformat(), updated_at.isoformat(), workspace_id),
    )
    connection.commit()
    connection.close()


def _update_session_timestamps(
    db_path: Path,
    session_id: str,
    *,
    created_at: datetime,
    updated_at: datetime,
) -> None:
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE sessions
        SET created_at=?, updated_at=?
        WHERE session_id=?
        """,
        (created_at.isoformat(), updated_at.isoformat(), session_id),
    )
    connection.commit()
    connection.close()


def _update_session_raw_timestamps(
    db_path: Path,
    session_id: str,
    *,
    created_at: str,
    updated_at: str,
) -> None:
    connection = sqlite3.connect(db_path)
    connection.execute(
        """
        UPDATE sessions
        SET created_at=?, updated_at=?
        WHERE session_id=?
        """,
        (created_at, updated_at, session_id),
    )
    connection.commit()
    connection.close()


def _run_git_command(workspace_root: Path, *args: str) -> None:
    command = ("git", *args)
    completed = subprocess.run(
        command,
        cwd=workspace_root,
        check=False,
        capture_output=True,
        text=True,
        timeout=15.0,
    )
    if completed.returncode != 0:
        pytest.fail(
            "Git command failed: "
            f"{' '.join(command)}\n{completed.stderr or completed.stdout}"
        )
