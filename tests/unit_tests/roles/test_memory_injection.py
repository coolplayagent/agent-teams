# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
from pathlib import Path
from unittest.mock import AsyncMock, create_autospec

import pytest

from relay_teams.memory.models import (
    CreateMemoryEntryRequest,
    MemoryContent,
    MemoryEntryKind,
    MemoryQuery,
    MemoryScope,
    MemorySourceKind,
    MemoryTier,
)
from relay_teams.memory.repository import MemoryBankRepository
from relay_teams.memory.service import MemoryBankService
from relay_teams.roles.memory_injection import (
    _MEMORY_ENTRY_PREVIEW_CHARS,
    _MEMORY_REFERENCE_NOTICE,
    _MEMORY_SECTION_CHAR_BUDGET,
    _format_memory_section,
    build_project_memory_section_async,
    build_role_with_memory_async,
)
from relay_teams.roles.role_models import MemoryProfile, RoleDefinition
from relay_teams.roles.role_registry import RoleRegistry

pytestmark = pytest.mark.asyncio


def _make_role(**overrides: object) -> RoleDefinition:
    base: dict[str, object] = {
        "role_id": "crafter",
        "version": "1.0.0",
        "name": "Crafter",
        "description": "Test role",
        "system_prompt": "You are a test assistant.",
        "memory_profile": MemoryProfile(enabled=True),
    }
    base.update(overrides)
    return RoleDefinition(**base)  # type: ignore[arg-type]


async def _create_entry(
    service: MemoryBankService, tier: MemoryTier, **overrides: object
) -> None:
    base: dict[str, object] = {
        "tier": tier,
        "scope": MemoryScope.ROLE,
        "workspace_id": "ws-1",
        "role_id": "crafter",
        "kind": MemoryEntryKind.INSIGHT,
        "content": MemoryContent(title="Test insight", body="Some body text"),
        "source": MemorySourceKind.MANUAL,
    }
    base.update(overrides)
    await service.create_entry_async(CreateMemoryEntryRequest(**base))  # type: ignore[arg-type]


class TestBuildRoleWithMemory:
    async def test_skips_coordinator_role(self, tmp_path: Path) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = True
        role = _make_role()
        result = await build_role_with_memory_async(
            role_registry=registry,
            role=role,
            role_id="coordinator",
            workspace_id="ws-1",
        )
        assert result.system_prompt == role.system_prompt

    async def test_skips_disabled_memory(self, tmp_path: Path) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role(memory_profile=MemoryProfile(enabled=False))
        result = await build_role_with_memory_async(
            role_registry=registry,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
        )
        assert result.system_prompt == role.system_prompt

    async def test_skips_when_no_services(self, tmp_path: Path) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role()
        result = await build_role_with_memory_async(
            role_registry=registry,
            memory_bank_service=None,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
        )
        assert result.system_prompt == role.system_prompt

    async def test_appends_project_memory(self, tmp_path: Path) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role()
        repo = MemoryBankRepository(tmp_path / "test.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(service, MemoryTier.PERSISTENT)
        result = await build_role_with_memory_async(
            role_registry=registry,
            memory_bank_service=service,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
        )
        assert "Project Memory" in result.system_prompt
        assert _MEMORY_REFERENCE_NOTICE in result.system_prompt

    async def test_prefers_task_relevant_memory(self, tmp_path: Path) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role()
        repo = MemoryBankRepository(tmp_path / "relevant.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            content=MemoryContent(
                title="Pydantic validation",
                body="Use Pydantic validators for request contracts.",
            ),
        )
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            content=MemoryContent(
                title="Frontend styling",
                body="Keep settings panels compact.",
            ),
        )

        result = await build_role_with_memory_async(
            role_registry=registry,
            memory_bank_service=service,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
            objective="pydantic validators",
        )

        assert "Pydantic validation" in result.system_prompt
        assert "request contracts" in result.system_prompt
        assert "Frontend styling" not in result.system_prompt
        assert _MEMORY_REFERENCE_NOTICE in result.system_prompt

    async def test_task_relevant_memory_includes_workspace_global_entries(
        self, tmp_path: Path
    ) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role()
        repo = MemoryBankRepository(tmp_path / "global-relevant.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            content=MemoryContent(
                title="Role-specific validator memory",
                body="Use validators in role-specific code.",
            ),
        )
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            role_id=None,
            scope=MemoryScope.WORKSPACE,
            content=MemoryContent(
                title="Workspace validator policy",
                body="All workspace request models use validators.",
            ),
        )

        result = await build_role_with_memory_async(
            role_registry=registry,
            memory_bank_service=service,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
            objective="validators",
        )

        assert "Role-specific validator memory" in result.system_prompt
        assert "Workspace validator policy" in result.system_prompt

    async def test_workspace_global_fallback_filters_before_limit(
        self, tmp_path: Path
    ) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role()
        repo = MemoryBankRepository(tmp_path / "global-limit.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            role_id=None,
            scope=MemoryScope.WORKSPACE,
            content=MemoryContent(
                title="Workspace global policy",
                body="Global memory must survive role-heavy workspaces.",
            ),
        )
        for index in range(120):
            await _create_entry(
                service,
                MemoryTier.PERSISTENT,
                role_id=f"other-role-{index}",
                content=MemoryContent(
                    title=f"Other role memory {index}",
                    body="Role scoped entry",
                ),
            )

        result = await build_role_with_memory_async(
            role_registry=registry,
            memory_bank_service=service,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
        )

        assert "Workspace global policy" in result.system_prompt

    async def test_task_relevant_memory_truncates_preview(self, tmp_path: Path) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role()
        repo = MemoryBankRepository(tmp_path / "truncated.db")
        service = MemoryBankService(repository=repo)
        long_tail = "x" * (_MEMORY_ENTRY_PREVIEW_CHARS + 80)
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            content=MemoryContent(
                title="Validation memory",
                body=f"Use validators for contracts. {long_tail}",
            ),
        )

        result = await build_role_with_memory_async(
            role_registry=registry,
            memory_bank_service=service,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
            objective="validators",
        )

        assert "Validation memory" in result.system_prompt
        assert "..." in result.system_prompt
        assert long_tail not in result.system_prompt

    async def test_no_append_when_empty_memory(self, tmp_path: Path) -> None:
        registry = create_autospec(RoleRegistry, instance=True)
        registry.is_coordinator_role.return_value = False
        role = _make_role()
        repo = MemoryBankRepository(tmp_path / "empty.db")
        service = MemoryBankService(repository=repo)
        result = await build_role_with_memory_async(
            role_registry=registry,
            memory_bank_service=service,
            role=role,
            role_id="crafter",
            workspace_id="ws-1",
        )
        assert result.system_prompt == role.system_prompt


class TestBuildProjectMemorySection:
    async def test_returns_text_for_entries(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(service, MemoryTier.PERSISTENT)
        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
        )
        assert "Persistent" in result
        assert "Test insight" in result

    async def test_returns_empty_when_no_entries(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test.db")
        service = MemoryBankService(repository=repo)
        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
        )
        assert result == ""

    async def test_handles_service_exception(self, tmp_path: Path) -> None:
        service = create_autospec(MemoryBankService, instance=True)
        service.list_entries_async = AsyncMock(side_effect=RuntimeError("db error"))
        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
        )
        assert result == ""

    async def test_handles_list_sqlite_exception(self, tmp_path: Path) -> None:
        service = create_autospec(MemoryBankService, instance=True)
        service.list_entries_async = AsyncMock(
            side_effect=sqlite3.OperationalError("locked")
        )
        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
        )
        assert result == ""

    async def test_handles_search_exception(self, tmp_path: Path) -> None:
        service = create_autospec(MemoryBankService, instance=True)
        service.search_async = AsyncMock(side_effect=RuntimeError("db error"))
        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
            objective="validators",
        )
        assert result == ""

    async def test_handles_search_sqlite_exception(self, tmp_path: Path) -> None:
        service = create_autospec(MemoryBankService, instance=True)
        service.search_async = AsyncMock(side_effect=sqlite3.OperationalError("locked"))
        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
            objective="validators",
        )
        assert result == ""

    async def test_stops_when_tier_heading_exceeds_budget(
        self, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "budget.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(service, MemoryTier.PERSISTENT)
        result = await service.list_entries_async(
            MemoryQuery(workspace_id="ws-1", limit=1)
        )
        monkeypatch.setattr(
            "relay_teams.roles.memory_injection._MEMORY_SECTION_CHAR_BUDGET",
            1,
        )

        section = _format_memory_section(
            by_tier={
                MemoryTier.PERSISTENT: list(result.items),
                MemoryTier.MEDIUM_TERM: [],
            },
            include_preview=False,
        )

        assert section == ""

    async def test_includes_medium_term_entries(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "test.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.MEDIUM_TERM,
            scope=MemoryScope.SESSION,
            session_id="s1",
        )
        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
            session_id="s1",
        )
        assert "Medium Term" in result

    async def test_includes_roleless_session_entries_for_role(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "roleless-session.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.MEDIUM_TERM,
            scope=MemoryScope.SESSION,
            role_id=None,
            session_id="s1",
            content=MemoryContent(
                title="Session-wide insight",
                body="All roles need this context.",
            ),
        )

        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
            session_id="s1",
        )

        assert "Session-wide insight" in result

    async def test_task_relevant_memory_includes_roleless_session_entries(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "roleless-session-search.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.MEDIUM_TERM,
            scope=MemoryScope.SESSION,
            role_id=None,
            session_id="s1",
            content=MemoryContent(
                title="Validator summary",
                body="All roles should check validator output.",
            ),
        )

        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
            session_id="s1",
            objective="validator",
        )

        assert "Validator summary" in result

    async def test_excludes_other_session_medium_term_entries(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "session-filter.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.MEDIUM_TERM,
            scope=MemoryScope.SESSION,
            session_id="other-session",
            content=MemoryContent(
                title="Other session memory",
                body="Do not inject across session boundaries.",
            ),
        )

        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
            session_id="current-session",
        )

        assert result == ""

    async def test_fallback_includes_workspace_global_entries(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "fallback-global.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(service, MemoryTier.PERSISTENT)
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            role_id=None,
            scope=MemoryScope.WORKSPACE,
            content=MemoryContent(
                title="Workspace global memory",
                body="Global workspace guidance.",
            ),
        )

        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
        )

        assert "Test insight" in result
        assert "Workspace global memory" in result

    async def test_fallback_includes_role_workspace_entries(
        self, tmp_path: Path
    ) -> None:
        repo = MemoryBankRepository(tmp_path / "fallback-role-workspace.db")
        service = MemoryBankService(repository=repo)
        await _create_entry(
            service,
            MemoryTier.PERSISTENT,
            scope=MemoryScope.WORKSPACE,
            role_id="crafter",
            content=MemoryContent(
                title="Role workspace memory",
                body="Role-specific workspace guidance.",
            ),
        )

        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
        )

        assert "Role workspace memory" in result

    async def test_memory_section_respects_budget(self, tmp_path: Path) -> None:
        repo = MemoryBankRepository(tmp_path / "budget.db")
        service = MemoryBankService(repository=repo)
        for index in range(40):
            await _create_entry(
                service,
                MemoryTier.PERSISTENT,
                content=MemoryContent(
                    title=f"Budgeted memory {index} " + ("title " * 40),
                    body="Some body text",
                ),
            )

        result = await build_project_memory_section_async(
            memory_bank_service=service,
            workspace_id="ws-1",
            role_id="crafter",
        )

        assert len(result) <= _MEMORY_SECTION_CHAR_BUDGET
        assert "Budgeted memory" in result
