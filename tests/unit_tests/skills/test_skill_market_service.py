# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path

import pytest

from relay_teams.env.clawhub_config_models import ClawHubConfig
from relay_teams.skills.clawhub_models import ClawHubSkillSummary
from relay_teams.skills.skill_market_models import ClawHubSkillMarketInstallRequest
from relay_teams.skills.skill_market_service import ClawHubSkillMarketService
from relay_teams.skills.skill_models import SkillSource


def test_clawhub_market_search_marks_installed_results(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_search(
        *,
        query: str,
        limit: int,
        token: str | None = None,
        config_dir: Path | None = None,
    ) -> dict[str, object]:
        assert query == "skill creator"
        assert limit == 20
        assert token is None
        assert config_dir == tmp_path
        return {
            "ok": True,
            "query": query,
            "items": [
                {
                    "slug": "skill-creator-2",
                    "title": "Skill Creator",
                    "version": "v1.0.0",
                    "score": 3.2,
                }
            ],
        }

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_search",
        fake_search,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token=None),
        list_clawhub_skills=lambda: (
            ClawHubSkillSummary(
                skill_id="skill-creator-2",
                runtime_name="skill-creator",
                description="Create skills.",
                ref="skill-creator",
                source=SkillSource.USER_RELAY_TEAMS,
                directory="/tmp/skills/skill-creator-2",
                manifest_path="/tmp/skills/skill-creator-2/SKILL.md",
                valid=True,
                error=None,
            ),
        ),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: None,
    )

    response = service.search_clawhub_skills(query="skill creator", limit=20)

    assert response.ok is True
    assert response.items[0].installed is True


def test_clawhub_market_search_returns_runtime_failure_payload(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_search(
        *,
        query: str,
        limit: int,
        token: str | None = None,
        config_dir: Path | None = None,
    ) -> dict[str, object]:
        return {
            "ok": False,
            "query": query,
            "items": [],
            "error_message": "ClawHub skill search timed out.",
        }

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_search",
        fake_search,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token=None),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: None,
    )

    response = service.search_clawhub_skills(query="slow", limit=20)

    assert response.ok is False
    assert response.error_message == "ClawHub skill search timed out."


def test_clawhub_market_search_uses_backend_token_for_default_listing(
    monkeypatch,
    tmp_path: Path,
) -> None:
    captured: dict[str, object] = {}

    def fake_search(
        *,
        query: str,
        limit: int,
        token: str | None = None,
        config_dir: Path | None = None,
    ) -> dict[str, object]:
        captured.update(
            {
                "query": query,
                "limit": limit,
                "token": token,
                "config_dir": config_dir,
            }
        )
        return {
            "ok": True,
            "query": query,
            "items": [
                {
                    "slug": "skill-creator",
                    "title": "Skill Creator",
                }
            ],
        }

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_search",
        fake_search,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token="ch_secret"),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: None,
    )

    response = service.search_clawhub_skills(query="", limit=20)

    assert captured == {
        "query": "",
        "limit": 20,
        "token": "ch_secret",
        "config_dir": tmp_path,
    }
    assert response.ok is True
    assert response.items[0].slug == "skill-creator"


def test_clawhub_market_install_uses_backend_token_and_reloads(
    monkeypatch,
    tmp_path: Path,
) -> None:
    captured: dict[str, object] = {}
    reload_calls: list[str] = []

    def fake_install(
        *,
        slug: str,
        version: str | None = None,
        force: bool = False,
        token: str | None = None,
        config_dir: Path | None = None,
        timeout_seconds: float = 180.0,
    ) -> dict[str, object]:
        captured.update(
            {
                "slug": slug,
                "version": version,
                "force": force,
                "token": token,
                "config_dir": config_dir,
                "timeout_seconds": timeout_seconds,
            }
        )
        return {
            "ok": True,
            "slug": slug,
            "requested_version": version,
            "installed_skill": {
                "skill_id": slug,
                "runtime_name": "skill-creator",
                "description": "Create skills.",
                "ref": "skill-creator",
                "source": "user_relay_teams",
                "directory": str(tmp_path / "skills" / slug),
                "manifest_path": str(tmp_path / "skills" / slug / "SKILL.md"),
                "valid": True,
                "error": None,
            },
            "clawhub_path": "/usr/bin/clawhub",
            "latency_ms": 4,
            "checked_at": "2026-06-03T00:00:00Z",
            "diagnostics": {
                "binary_available": True,
                "token_configured": True,
                "installation_attempted": False,
                "installed_during_install": False,
                "registry": None,
                "endpoint_fallback_used": False,
                "workdir": str(tmp_path),
                "skills_reloaded": False,
            },
            "retryable": False,
            "error_code": None,
            "error_message": None,
        }

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_install",
        fake_install,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token="ch_secret"),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: reload_calls.append("reload"),
    )

    response = service.install_clawhub_skill(
        ClawHubSkillMarketInstallRequest(
            slug="skill-creator-2",
            version="v1.0.0",
            force=True,
        )
    )

    assert captured["slug"] == "skill-creator-2"
    assert captured["version"] == "v1.0.0"
    assert captured["force"] is True
    assert captured["token"] == "ch_secret"
    assert captured["config_dir"] == tmp_path
    assert reload_calls == ["reload"]
    assert response.ok is True
    assert response.diagnostics.skills_reloaded is True


def test_clawhub_market_install_reports_reload_failure(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_install(
        *,
        slug: str,
        version: str | None = None,
        force: bool = False,
        token: str | None = None,
        config_dir: Path | None = None,
        timeout_seconds: float = 180.0,
    ) -> dict[str, object]:
        return {
            "ok": True,
            "slug": slug,
            "requested_version": version,
            "installed_skill": None,
            "clawhub_path": "/usr/bin/clawhub",
            "latency_ms": 4,
            "checked_at": "2026-06-03T00:00:00Z",
            "diagnostics": {
                "binary_available": True,
                "token_configured": True,
                "installation_attempted": False,
                "installed_during_install": False,
                "endpoint_fallback_used": False,
                "skills_reloaded": False,
            },
            "retryable": False,
            "error_code": None,
            "error_message": None,
        }

    def fail_reload() -> None:
        raise RuntimeError("Invalid skills config")

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_install",
        fake_install,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token="ch_secret"),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=fail_reload,
    )

    response = service.install_clawhub_skill(
        ClawHubSkillMarketInstallRequest(slug="skill-creator")
    )

    assert response.ok is True
    assert response.error_code == "skills_reload_failed"
    assert response.error_message == "Invalid skills config"
    assert response.diagnostics.skills_reloaded is False


def test_clawhub_market_install_returns_runtime_failure_without_reload(
    monkeypatch,
    tmp_path: Path,
) -> None:
    reload_calls: list[str] = []

    def fake_install(
        *,
        slug: str,
        version: str | None = None,
        force: bool = False,
        token: str | None = None,
        config_dir: Path | None = None,
        timeout_seconds: float = 180.0,
    ) -> dict[str, object]:
        return {
            "ok": False,
            "slug": slug,
            "diagnostics": {"binary_available": False},
            "retryable": True,
            "error_code": "clawhub_missing",
            "error_message": "ClawHub CLI is not installed.",
        }

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_install",
        fake_install,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token=None),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: reload_calls.append("reload"),
    )

    response = service.install_clawhub_skill(
        ClawHubSkillMarketInstallRequest(slug="skill-creator")
    )

    assert response.ok is False
    assert response.retryable is True
    assert response.error_code == "clawhub_missing"
    assert reload_calls == []


def test_clawhub_market_search_skips_invalid_items_and_numeric_score(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_search(
        *,
        query: str,
        limit: int,
        token: str | None = None,
        config_dir: Path | None = None,
    ) -> dict[str, object]:
        return {
            "ok": True,
            "query": query,
            "items": [
                "not-a-mapping",
                {"title": "Missing Slug"},
                {"slug": "valid-skill", "title": "Valid Skill", "score": 7},
            ],
        }

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_search",
        fake_search,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token=None),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: None,
    )

    response = service.search_clawhub_skills(query="valid", limit=20)

    assert tuple(item.slug for item in response.items) == ("valid-skill",)
    assert response.items[0].score == 7.0


def test_clawhub_market_install_defaults_unknown_skill_source(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_install(
        *,
        slug: str,
        version: str | None = None,
        force: bool = False,
        token: str | None = None,
        config_dir: Path | None = None,
        timeout_seconds: float = 180.0,
    ) -> dict[str, object]:
        return {
            "ok": True,
            "slug": slug,
            "installed_skill": {
                "skill_id": slug,
                "directory": str(tmp_path / slug),
                "manifest_path": str(tmp_path / slug / "SKILL.md"),
                "source": "unknown-source",
            },
            "diagnostics": {},
        }

    monkeypatch.setattr(
        "relay_teams.skills.skill_market_service.run_clawhub_install",
        fake_install,
    )
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token=None),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: None,
    )

    response = service.install_clawhub_skill(
        ClawHubSkillMarketInstallRequest(slug="skill-creator")
    )

    assert response.installed_skill is not None
    assert response.installed_skill.source == SkillSource.USER_RELAY_TEAMS


def test_clawhub_market_uninstall_rejects_blank_slug(tmp_path: Path) -> None:
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token=None),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: None,
        reload_skills_config=lambda: None,
    )

    with pytest.raises(ValueError, match="ClawHub skill slug is required"):
        service.uninstall_clawhub_skill(slug=" ")


def test_clawhub_market_uninstall_deletes_installed_skill(tmp_path: Path) -> None:
    deleted: list[str] = []
    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token="ch_secret"),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: deleted.append(skill_id),
        reload_skills_config=lambda: None,
    )

    response = service.uninstall_clawhub_skill(slug=" skill-creator ")

    assert deleted == ["skill-creator"]
    assert response.ok is True
    assert response.slug == "skill-creator"
    assert response.skills_reloaded is True


def test_clawhub_market_uninstall_reports_reload_failure_after_delete(
    tmp_path: Path,
) -> None:
    deleted: list[str] = []

    def fail_reload() -> None:
        raise RuntimeError("Invalid skills config")

    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token="ch_secret"),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=lambda skill_id: deleted.append(skill_id),
        reload_skills_config=fail_reload,
    )

    response = service.uninstall_clawhub_skill(slug="skill-creator")

    assert deleted == ["skill-creator"]
    assert response.ok is True
    assert response.slug == "skill-creator"
    assert response.skills_reloaded is False
    assert response.error_code == "skills_reload_failed"
    assert response.error_message == "Invalid skills config"


def test_clawhub_market_uninstall_reports_missing_skill(tmp_path: Path) -> None:
    def fail_delete(skill_id: str) -> None:
        raise KeyError(skill_id)

    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token="ch_secret"),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=fail_delete,
        reload_skills_config=lambda: None,
    )

    response = service.uninstall_clawhub_skill(slug="skill-creator")

    assert response.ok is False
    assert response.slug == "skill-creator"
    assert response.skills_reloaded is False
    assert response.error_code == "skill_not_installed"


def test_clawhub_market_uninstall_reports_delete_failure(tmp_path: Path) -> None:
    def fail_delete(skill_id: str) -> None:
        raise RuntimeError(f"Cannot delete {skill_id}")

    service = ClawHubSkillMarketService(
        config_dir=tmp_path,
        get_clawhub_config=lambda: ClawHubConfig(token="ch_secret"),
        list_clawhub_skills=lambda: (),
        delete_clawhub_skill=fail_delete,
        reload_skills_config=lambda: None,
    )

    response = service.uninstall_clawhub_skill(slug="skill-creator")

    assert response.ok is False
    assert response.slug == "skill-creator"
    assert response.error_code == "uninstall_failed"
    assert response.error_message == "Cannot delete skill-creator"
