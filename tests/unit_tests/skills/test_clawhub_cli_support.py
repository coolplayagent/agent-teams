# -*- coding: utf-8 -*-
from __future__ import annotations

from io import BytesIO
from pathlib import Path
import ssl
import subprocess
from typing import cast
from urllib.request import Request
from zipfile import ZipFile

import pytest

from relay_teams.env.clawhub_cli import ClawHubCliInstallResult
from relay_teams.skills.clawhub_cli_support import (
    _MAX_MARKET_DETAIL_MANIFEST_BYTES,
    _PATH_LIST_SEPARATOR,
    _extract_skill_manifest_from_archive,
    _float_field,
    _get_clawhub_bytes,
    _get_clawhub_json,
    _get_clawhub_text,
    _int_or_none,
    _load_clawhub_version_detail,
    _normalize_browse_sort,
    _normalize_optional_text,
    _parse_api_browse_items,
    _parse_api_files,
    _parse_api_search_items,
    _parse_explore_output,
    _parse_json_payload,
    _ssl_context_from_env,
    _url_opener_from_env,
    _urllib_proxy_map_from_env,
    run_clawhub_api_search,
    run_clawhub_browse,
    run_clawhub_install,
    run_clawhub_skill_detail,
)


def _zip_bytes(files: dict[str, str]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, mode="w") as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return buffer.getvalue()


def _zip_binary_bytes(files: dict[str, bytes]) -> bytes:
    buffer = BytesIO()
    with ZipFile(buffer, mode="w") as archive:
        for path, content in files.items():
            archive.writestr(path, content)
    return buffer.getvalue()


def test_run_clawhub_browse_uses_api_listing_and_parses_stats(
    monkeypatch,
    tmp_path: Path,
) -> None:
    resolved_config_dir = tmp_path / ".relay-teams"

    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        assert path == "/api/v1/skills"
        assert params == {
            "limit": "5",
            "sort": "installsCurrent",
            "cursor": "next-page",
            "nonSuspiciousOnly": "true",
        }
        assert token == "ch_secret"
        assert config_dir == resolved_config_dir
        return {
            "items": [
                None,
                {"displayName": "Missing Slug"},
                {
                    "slug": "skill-creator",
                    "displayName": "Skill Creator",
                    "summary": "Create skills.",
                    "stats": {
                        "downloads": 10,
                        "installsCurrent": 7,
                        "stars": 3,
                    },
                    "createdAt": 123,
                    "updatedAt": 456,
                    "latestVersion": {"version": "1.0.0"},
                },
                {
                    "slug": "tagged-skill",
                    "tags": {"latest": "2.0.0"},
                },
            ],
            "nextCursor": "next-2",
        }

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )

    result = run_clawhub_browse(
        limit=5,
        cursor="next-page",
        sort="popular",
        token="ch_secret",
        config_dir=resolved_config_dir,
    )

    assert result == {
        "ok": True,
        "query": "",
        "items": [
            {
                "slug": "skill-creator",
                "title": "Skill Creator",
                "summary": "Create skills.",
                "version": "1.0.0",
                "score": None,
                "stats": {
                    "comments": None,
                    "downloads": 10,
                    "installs_all_time": None,
                    "installs_current": 7,
                    "stars": 3,
                    "versions": None,
                },
                "owner_handle": None,
                "owner_display_name": None,
                "owner_image": None,
                "created_at_ms": 123,
                "updated_at_ms": 456,
            },
            {
                "slug": "tagged-skill",
                "title": "tagged-skill",
                "summary": "",
                "version": "2.0.0",
                "score": None,
                "stats": None,
                "owner_handle": None,
                "owner_display_name": None,
                "owner_image": None,
                "created_at_ms": None,
                "updated_at_ms": None,
            },
        ],
        "sort": "popular",
        "next_cursor": "next-2",
    }


def test_run_clawhub_search_uses_api_search_and_parses_owner(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        assert path == "/api/v1/search"
        assert params == {
            "q": "skill creator",
            "limit": "5",
            "nonSuspiciousOnly": "true",
        }
        assert token == "ch_secret"
        assert config_dir == tmp_path
        return {
            "results": [
                {
                    "slug": "skill-creator",
                    "displayName": "Skill Creator",
                    "summary": "Create skills.",
                    "score": 3.69,
                    "updatedAt": 456,
                    "owner": {
                        "handle": "alice",
                        "displayName": "Alice",
                        "image": "https://example.test/avatar.png",
                    },
                },
                {"displayName": "Missing Slug", "score": 1},
            ]
        }

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )

    result = run_clawhub_api_search(
        query="skill creator",
        limit=5,
        token="ch_secret",
        config_dir=tmp_path,
    )

    assert result["ok"] is True
    assert result["query"] == "skill creator"
    items = result["items"]
    assert isinstance(items, list)
    assert items[0]["summary"] == "Create skills."
    assert items[0]["score"] == 3.69
    assert items[0]["owner_handle"] == "alice"
    assert items[0]["owner_display_name"] == "Alice"


def test_run_clawhub_skill_detail_loads_manifest_file(
    monkeypatch,
    tmp_path: Path,
) -> None:
    captured_file: dict[str, object] = {}

    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        assert params == {}
        assert token == "ch_secret"
        assert config_dir == tmp_path
        if path == "/api/v1/skills/skill-creator":
            return {
                "skill": {
                    "slug": "skill-creator",
                    "displayName": "Skill Creator",
                    "summary": "Create skills.",
                    "tags": {"latest": "0.1.0"},
                    "stats": {
                        "downloads": 10,
                        "installsCurrent": 7,
                        "stars": 3,
                    },
                    "createdAt": 123,
                    "updatedAt": 456,
                },
                "owner": {
                    "handle": "alice",
                    "displayName": "Alice",
                    "image": "https://example.test/avatar.png",
                },
            }
        if path == "/api/v1/skills/skill-creator/versions/0.1.0":
            return {
                "version": {
                    "version": "0.1.0",
                    "changelog": "Initial release.",
                    "license": "MIT",
                    "files": [
                        {
                            "path": "SKILL.md",
                            "size": 24,
                            "sha256": "abc123",
                            "contentType": "text/plain",
                        }
                    ],
                }
            }
        raise AssertionError(path)

    def fake_get_text(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
        max_bytes: int,
    ) -> str:
        captured_file.update(
            {
                "path": path,
                "params": params,
                "token": token,
                "config_dir": config_dir,
                "max_bytes": max_bytes,
            }
        )
        return "# Skill Creator\n\nUse this skill."

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_text",
        fake_get_text,
    )

    result = run_clawhub_skill_detail(
        slug="skill-creator",
        token="ch_secret",
        config_dir=tmp_path,
    )

    assert result["ok"] is True
    assert result["slug"] == "skill-creator"
    assert result["version"] == "0.1.0"
    assert result["manifest_content"] == "# Skill Creator\n\nUse this skill."
    assert result["owner_handle"] == "alice"
    assert result["changelog"] == "Initial release."
    assert result["files"] == [
        {
            "path": "SKILL.md",
            "size": 24,
            "sha256": "abc123",
            "content_type": "text/plain",
        }
    ]
    assert captured_file == {
        "path": "/api/v1/skills/skill-creator/file",
        "params": {"path": "SKILL.md", "version": "0.1.0"},
        "token": "ch_secret",
        "config_dir": tmp_path,
        "max_bytes": 1048576,
    }


def test_clawhub_api_parsers_skip_bad_items_and_coerce_fields() -> None:
    search_items = _parse_api_search_items(
        [
            None,
            {"displayName": "Missing slug"},
            {
                "slug": "search-skill",
                "displayName": "Search Skill",
                "score": True,
                "updatedAt": 12.9,
                "ownerHandle": "direct-owner",
            },
        ]
    )
    browse_items = _parse_api_browse_items(
        [
            None,
            {"displayName": "Missing slug"},
            {
                "slug": "browse-skill",
                "latestVersion": {"version": "  "},
                "tags": {"latest": "2.0.0"},
                "stats": {
                    "comments": True,
                    "downloads": 4.8,
                    "installsAllTime": 9,
                    "installsCurrent": "not-a-number",
                    "stars": 3,
                    "versions": 2.1,
                },
                "createdAt": True,
                "updatedAt": 123.9,
            },
        ]
    )
    files = _parse_api_files(
        [
            None,
            {"size": 1},
            {
                "path": "SKILL.md",
                "size": 24.9,
                "sha256": "abc123",
                "contentType": "text/markdown",
            },
        ]
    )

    assert search_items == [
        {
            "slug": "search-skill",
            "title": "Search Skill",
            "summary": "",
            "version": None,
            "score": None,
            "stats": None,
            "owner_handle": "direct-owner",
            "owner_display_name": None,
            "owner_image": None,
            "created_at_ms": None,
            "updated_at_ms": 12,
        }
    ]
    assert browse_items == [
        {
            "slug": "browse-skill",
            "title": "browse-skill",
            "summary": "",
            "version": "2.0.0",
            "score": None,
            "stats": {
                "comments": None,
                "downloads": 4,
                "installs_all_time": 9,
                "installs_current": None,
                "stars": 3,
                "versions": 2,
            },
            "owner_handle": None,
            "owner_display_name": None,
            "owner_image": None,
            "created_at_ms": None,
            "updated_at_ms": 123,
        }
    ]
    assert files == [
        {
            "path": "SKILL.md",
            "size": 24,
            "sha256": "abc123",
            "content_type": "text/markdown",
        }
    ]


def test_clawhub_api_scalar_helpers_handle_edge_values() -> None:
    payload = {
        "bool": True,
        "int": 4,
        "float": 4.9,
        "text": "5",
    }

    assert _int_or_none(payload, "bool") is None
    assert _int_or_none(payload, "int") == 4
    assert _int_or_none(payload, "float") == 4
    assert _int_or_none(payload, "text") is None
    assert _int_or_none(payload, "missing") is None
    assert _float_field(payload, "bool") is None
    assert _float_field(payload, "int") == 4.0
    assert _float_field(payload, "float") == 4.9
    assert _float_field(payload, "text") is None
    assert _normalize_optional_text(None) is None
    assert _normalize_optional_text("  ") is None
    assert _normalize_optional_text(" 0.1.0 ") == "0.1.0"


def test_clawhub_api_entrypoints_return_structured_errors(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_browse(
        *,
        limit: int,
        cursor: str = "",
        sort: str = "popular",
        token: str | None = None,
        config_dir: Path | None = None,
        timeout_seconds: float = 20.0,
    ) -> dict[str, object]:
        return {
            "ok": True,
            "query": "",
            "items": [{"slug": "browse-fallback"}],
            "sort": sort,
            "next_cursor": cursor,
            "limit": limit,
            "token": token,
            "config_dir": str(config_dir),
            "timeout_seconds": timeout_seconds,
        }

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.run_clawhub_browse",
        fake_browse,
    )
    assert run_clawhub_api_search(
        query="  ",
        limit=3,
        token="ch_secret",
        config_dir=tmp_path,
        timeout_seconds=4,
    )["items"] == [{"slug": "browse-fallback"}]

    def failing_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        raise ValueError(f"offline {path}")

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        failing_get_json,
    )

    search_error = run_clawhub_api_search(query="skill", limit=2)
    browse_error = run_clawhub_browse(limit=2, sort="popular")
    detail_error = run_clawhub_skill_detail(slug="skill-creator")

    assert search_error["ok"] is False
    assert "offline /api/v1/search" in str(search_error["error_message"])
    assert browse_error["ok"] is False
    assert "offline /api/v1/skills" in str(browse_error["error_message"])
    assert detail_error["ok"] is False
    assert "offline /api/v1/skills/skill-creator" in str(detail_error["error_message"])


def test_clawhub_api_entrypoints_reject_unexpected_payloads(
    monkeypatch,
) -> None:
    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        if path == "/api/v1/search":
            return {"results": "not-a-list"}
        return {"items": "not-a-list"}

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )

    assert run_clawhub_api_search(query="skill", limit=2) == {
        "ok": False,
        "query": "skill",
        "items": [],
        "error_message": "ClawHub search returned an unexpected output format.",
    }
    assert run_clawhub_browse(limit=2) == {
        "ok": False,
        "query": "",
        "items": [],
        "sort": "popular",
        "next_cursor": None,
        "error_message": "ClawHub market listing returned an unexpected output format.",
    }


def test_clawhub_browse_and_detail_validate_inputs_and_missing_versions(
    monkeypatch,
) -> None:
    browse_error = run_clawhub_browse(limit=2, sort="unsupported")
    invalid_detail = run_clawhub_skill_detail(slug="org/skill-creator")

    assert browse_error["ok"] is False
    assert browse_error["sort"] == "unsupported"
    assert "Unsupported ClawHub skill market sort" in str(browse_error["error_message"])
    assert invalid_detail["ok"] is False
    assert invalid_detail["slug"] == "org/skill-creator"

    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        return {
            "skill": {
                "slug": "skill-creator",
                "displayName": "Skill Creator",
            }
        }

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )

    detail = run_clawhub_skill_detail(slug="skill-creator")

    assert detail["ok"] is True
    assert detail["manifest_content"] is None
    assert detail["error_message"] == "ClawHub skill detail does not include a version."


def test_clawhub_skill_detail_keeps_manifest_download_errors(
    monkeypatch,
) -> None:
    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        if "/versions/" in path:
            return {"version": {"files": []}}
        return {
            "skill": {
                "slug": "skill-creator",
                "displayName": "Skill Creator",
            },
            "latestVersion": {"version": "1.0.0"},
        }

    def fake_get_text(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
        max_bytes: int,
    ) -> str:
        raise ValueError("file unavailable")

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_text",
        fake_get_text,
    )

    detail = run_clawhub_skill_detail(slug="skill-creator")

    assert detail["ok"] is True
    assert detail["version"] == "1.0.0"
    assert detail["manifest_content"] is None
    assert detail["error_message"] == "file unavailable"


def test_clawhub_proxy_helpers_cover_http_all_and_opener() -> None:
    assert _urllib_proxy_map_from_env(
        {"HTTP_PROXY": "http://proxy.example.test:8080"}
    ) == {
        "http": "http://proxy.example.test:8080",
        "https": "http://proxy.example.test:8080",
    }
    assert _urllib_proxy_map_from_env(
        {"HTTP_PROXY": "http://proxy.example.test:8080"},
        "https://registry.example.test/api/v1/skills",
    ) == {
        "http": "http://proxy.example.test:8080",
        "https": "http://proxy.example.test:8080",
    }
    assert _urllib_proxy_map_from_env(
        {"ALL_PROXY": "http://all-proxy.example.test:8080"}
    ) == {
        "http": "http://all-proxy.example.test:8080",
        "https": "http://all-proxy.example.test:8080",
        "all": "http://all-proxy.example.test:8080",
    }
    assert _url_opener_from_env({}) is not None


def test_ssl_context_from_env_applies_ssl_verify_false() -> None:
    context = _ssl_context_from_env({"SSL_VERIFY": "false"})

    assert context is not None
    assert context.check_hostname is False
    assert context.verify_mode == ssl.CERT_NONE
    assert _ssl_context_from_env({"SSL_VERIFY": "true"}) is None


def test_clawhub_parser_and_sort_helpers_cover_error_edges() -> None:
    assert _parse_api_files("not-a-list") == []
    assert _parse_api_files([None, {"size": 5}]) == []
    assert _normalize_browse_sort("newest") == "createdAt"
    with pytest.raises(ValueError, match="Unsupported ClawHub skill market sort"):
        _normalize_browse_sort("unknown")


def test_extract_skill_manifest_from_archive_rejects_bad_archives() -> None:
    with pytest.raises(ValueError, match="not a valid zip archive"):
        _extract_skill_manifest_from_archive(b"not a zip")

    with pytest.raises(ValueError, match="does not contain SKILL.md"):
        _extract_skill_manifest_from_archive(_zip_bytes({"README.md": "No skill"}))

    with pytest.raises(ValueError, match="manifest is too large"):
        _extract_skill_manifest_from_archive(
            _zip_binary_bytes(
                {"SKILL.md": b"x" * (_MAX_MARKET_DETAIL_MANIFEST_BYTES + 1)}
            )
        )

    with pytest.raises(ValueError, match="not valid UTF-8"):
        _extract_skill_manifest_from_archive(
            _zip_binary_bytes({"SKILL.md": bytes([0xFF])})
        )


def test_parse_explore_output_handles_json_payload_edges() -> None:
    items = _parse_explore_output(
        'noise {"items":[null,{"displayName":"Missing slug"},'
        '{"slug":"skill-creator","displayName":"Skill Creator",'
        '"latestVersion":{"version":"1.0.0"}},'
        '{"slug":"tagged-skill","tags":{"latest":"2.0.0"}}]}'
    )

    assert items == [
        {
            "slug": "skill-creator",
            "title": "Skill Creator",
            "version": "1.0.0",
            "score": None,
        },
        {
            "slug": "tagged-skill",
            "title": "tagged-skill",
            "version": "2.0.0",
            "score": None,
        },
    ]
    assert _parse_explore_output('{"items":"not-a-list"}') == []
    with pytest.raises(ValueError, match="unexpected output format"):
        _parse_json_payload("no json here")
    with pytest.raises(ValueError, match="unexpected output format"):
        _parse_json_payload("{")
    with pytest.raises(ValueError, match="unexpected output format"):
        _parse_json_payload("[1, 2]")


def test_load_clawhub_version_detail_tolerates_missing_payload(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        assert path == "/api/v1/skills/skill-creator/versions/0.1.0"
        assert params == {}
        assert token == "ch_secret"
        assert config_dir == tmp_path
        return {"version": "not-an-object"}

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )

    result = _load_clawhub_version_detail(
        slug="skill-creator",
        version="0.1.0",
        token="ch_secret",
        config_dir=tmp_path,
        timeout_seconds=3,
    )

    assert result == {}


def test_load_clawhub_version_detail_tolerates_api_failure(
    monkeypatch,
    tmp_path: Path,
) -> None:
    def fake_get_json(
        *,
        path: str,
        params: dict[str, str],
        token: str | None,
        config_dir: Path | None,
        timeout_seconds: float,
    ) -> dict[str, object]:
        raise ValueError("offline")

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._get_clawhub_json",
        fake_get_json,
    )

    result = _load_clawhub_version_detail(
        slug="skill-creator",
        version="0.1.0",
        token="ch_secret",
        config_dir=tmp_path,
        timeout_seconds=3,
    )

    assert result == {}


def test_get_clawhub_bytes_builds_registry_token_and_proxy(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(
            self,
            exc_type: object,
            exc: object,
            traceback: object,
        ) -> None:
            return None

        def read(self, size: int = -1) -> bytes:
            captured["read_size"] = size
            return b"PK\x03\x04"

    class FakeOpener:
        def open(self, request: Request, timeout: float) -> FakeResponse:
            captured["url"] = getattr(request, "full_url", "")
            captured["authorization"] = request.get_header("Authorization")
            captured["accept"] = request.get_header("Accept")
            captured["timeout"] = timeout
            return FakeResponse()

    def fake_env(
        token: str | None,
        *,
        config_dir: Path | None = None,
        base_env: dict[str, str] | None = None,
        site: str | None = None,
        registry: str | None = None,
    ) -> dict[str, str]:
        return {
            "CLAWHUB_TOKEN": token or "ch_env",
            "CLAWHUB_REGISTRY": "https://registry.example.test",
            "HTTPS_PROXY": "http://proxy.example.test:8080",
        }

    def fake_opener(env: dict[str, str], target_url: str | None = None) -> FakeOpener:
        captured["proxy_env"] = env
        captured["target_url"] = target_url
        return FakeOpener()

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.build_clawhub_subprocess_env",
        fake_env,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._url_opener_from_env",
        fake_opener,
    )

    payload = _get_clawhub_bytes(
        path="/api/v1/download",
        params={"slug": "skill-creator", "version": "0.1.0"},
        token="ch_secret",
        config_dir=Path("/tmp/config"),
        timeout_seconds=7.0,
        max_bytes=100,
    )

    assert payload == b"PK\x03\x04"
    assert captured["url"] == (
        "https://registry.example.test/api/v1/download?slug=skill-creator&version=0.1.0"
    )
    assert captured["target_url"] == captured["url"]
    assert captured["authorization"] == "Bearer ch_secret"
    assert captured["accept"] == "application/zip,application/octet-stream"
    assert captured["timeout"] == 7.0
    assert captured["read_size"] == 101


def test_get_clawhub_json_builds_registry_token_and_proxy(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(
            self,
            exc_type: object,
            exc: object,
            traceback: object,
        ) -> None:
            return None

        def read(self) -> bytes:
            return b'{"items":[]}'

    class FakeOpener:
        def open(self, request: Request, timeout: float) -> FakeResponse:
            captured["url"] = getattr(request, "full_url", "")
            captured["authorization"] = request.get_header("Authorization")
            captured["timeout"] = timeout
            return FakeResponse()

    def fake_env(
        token: str | None,
        *,
        config_dir: Path | None = None,
        base_env: dict[str, str] | None = None,
        site: str | None = None,
        registry: str | None = None,
    ) -> dict[str, str]:
        return {
            "CLAWHUB_TOKEN": token or "ch_env",
            "CLAWHUB_REGISTRY": "https://registry.example.test",
            "HTTPS_PROXY": "http://proxy.example.test:8080",
        }

    def fake_opener(env: dict[str, str], target_url: str | None = None) -> FakeOpener:
        captured["proxy_env"] = env
        captured["target_url"] = target_url
        return FakeOpener()

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.build_clawhub_subprocess_env",
        fake_env,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._url_opener_from_env",
        fake_opener,
    )

    result = _get_clawhub_json(
        path="/api/v1/skills",
        params={"limit": "2", "sort": "downloads"},
        token="ch_secret",
        config_dir=None,
        timeout_seconds=12,
    )

    assert result == {"items": []}
    assert captured["url"] == (
        "https://registry.example.test/api/v1/skills?limit=2&sort=downloads"
    )
    assert captured["target_url"] == captured["url"]
    assert captured["authorization"] == "Bearer ch_secret"
    assert captured["proxy_env"] == {
        "CLAWHUB_TOKEN": "ch_secret",
        "CLAWHUB_REGISTRY": "https://registry.example.test",
        "HTTPS_PROXY": "http://proxy.example.test:8080",
    }
    assert _urllib_proxy_map_from_env(cast(dict[str, str], captured["proxy_env"])) == {
        "https": "http://proxy.example.test:8080"
    }


def test_get_clawhub_json_uses_site_when_registry_missing(
    monkeypatch,
) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(
            self,
            exc_type: object,
            exc: object,
            traceback: object,
        ) -> None:
            return None

        def read(self) -> bytes:
            return b'{"items":[]}'

    class FakeOpener:
        def open(self, request: Request, timeout: float) -> FakeResponse:
            _ = timeout
            captured["url"] = request.full_url
            return FakeResponse()

    def fake_env(
        token: str | None,
        *,
        config_dir: Path | None = None,
        base_env: dict[str, str] | None = None,
        site: str | None = None,
        registry: str | None = None,
    ) -> dict[str, str]:
        _ = token, config_dir, base_env, site, registry
        return {"CLAWHUB_SITE": "https://site.example.test"}

    def fake_opener(env: dict[str, str], target_url: str | None = None) -> FakeOpener:
        captured["proxy_env"] = env
        captured["target_url"] = target_url
        return FakeOpener()

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.build_clawhub_subprocess_env",
        fake_env,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._url_opener_from_env",
        fake_opener,
    )

    result = _get_clawhub_json(
        path="/api/v1/skills",
        params={"limit": "2"},
        token=None,
        config_dir=None,
        timeout_seconds=12,
    )

    assert result == {"items": []}
    assert captured["url"] == "https://site.example.test/api/v1/skills?limit=2"
    assert captured["target_url"] == captured["url"]


def test_get_clawhub_text_builds_registry_token_and_proxy(monkeypatch) -> None:
    captured: dict[str, object] = {}

    class FakeResponse:
        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(
            self,
            exc_type: object,
            exc: object,
            traceback: object,
        ) -> None:
            return None

        def read(self, size: int = -1) -> bytes:
            captured["read_size"] = size
            return b"# Skill Creator\n\nUse this skill."

    class FakeOpener:
        def open(self, request: Request, timeout: float) -> FakeResponse:
            captured["url"] = getattr(request, "full_url", "")
            captured["authorization"] = request.get_header("Authorization")
            captured["accept"] = request.get_header("Accept")
            captured["timeout"] = timeout
            return FakeResponse()

    def fake_env(
        token: str | None,
        *,
        config_dir: Path | None = None,
        base_env: dict[str, str] | None = None,
        site: str | None = None,
        registry: str | None = None,
    ) -> dict[str, str]:
        return {
            "CLAWHUB_TOKEN": token or "ch_env",
            "CLAWHUB_REGISTRY": "https://registry.example.test",
            "HTTPS_PROXY": "http://proxy.example.test:8080",
        }

    def fake_opener(env: dict[str, str], target_url: str | None = None) -> FakeOpener:
        captured["proxy_env"] = env
        captured["target_url"] = target_url
        return FakeOpener()

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.build_clawhub_subprocess_env",
        fake_env,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._url_opener_from_env",
        fake_opener,
    )

    content = _get_clawhub_text(
        path="/api/v1/skills/skill-creator/file",
        params={"path": "SKILL.md", "version": "0.1.0"},
        token="ch_secret",
        config_dir=Path("/tmp/config"),
        timeout_seconds=7.0,
        max_bytes=100,
    )

    assert content == "# Skill Creator\n\nUse this skill."
    assert captured["url"] == (
        "https://registry.example.test/api/v1/skills/skill-creator/file?"
        "path=SKILL.md&version=0.1.0"
    )
    assert captured["target_url"] == captured["url"]
    assert captured["authorization"] == "Bearer ch_secret"
    assert captured["accept"] == "text/markdown,text/plain,*/*"
    assert captured["timeout"] == 7.0
    assert captured["read_size"] == 101


def test_get_clawhub_text_rejects_failed_large_and_invalid_payloads(
    monkeypatch,
) -> None:
    payloads: list[bytes | OSError] = [
        OSError("offline"),
        b"abcdef",
        bytes([0xFF]),
    ]

    class FakeResponse:
        def __init__(self, payload: bytes) -> None:
            self._payload = payload

        def __enter__(self) -> FakeResponse:
            return self

        def __exit__(
            self,
            exc_type: object,
            exc: object,
            traceback: object,
        ) -> None:
            return None

        def read(self, size: int = -1) -> bytes:
            return self._payload

    class FakeOpener:
        def open(self, request: Request, timeout: float) -> FakeResponse:
            result = payloads.pop(0)
            if isinstance(result, OSError):
                raise result
            return FakeResponse(result)

    def fake_env(
        token: str | None,
        *,
        config_dir: Path | None = None,
        base_env: dict[str, str] | None = None,
        site: str | None = None,
        registry: str | None = None,
    ) -> dict[str, str]:
        return {
            "CLAWHUB_TOKEN": token or "ch_env",
            "CLAWHUB_REGISTRY": "https://registry.example.test",
        }

    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.build_clawhub_subprocess_env",
        fake_env,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support._url_opener_from_env",
        lambda env, target_url=None: FakeOpener(),
    )

    def load_text() -> str:
        return _get_clawhub_text(
            path="/api/v1/skills/skill-creator/file",
            params={"path": "SKILL.md", "version": "0.1.0"},
            token="ch_secret",
            config_dir=None,
            timeout_seconds=7.0,
            max_bytes=5,
        )

    with pytest.raises(ValueError, match="Failed to load ClawHub skill file"):
        load_text()
    with pytest.raises(ValueError, match="too large"):
        load_text()
    with pytest.raises(ValueError, match="not valid UTF-8"):
        load_text()


def test_urllib_proxy_map_from_env_respects_no_proxy_for_target_url() -> None:
    env = {
        "HTTPS_PROXY": "http://proxy.example.test:8080",
        "NO_PROXY": "registry.example.test",
    }

    assert (
        _urllib_proxy_map_from_env(
            env,
            "https://registry.example.test/api/v1/skills",
        )
        == {}
    )
    assert _urllib_proxy_map_from_env(
        env,
        "https://public.example.test/api/v1/skills",
    ) == {"https": "http://proxy.example.test:8080"}


def test_run_clawhub_install_reports_runtime_identity(
    monkeypatch,
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / ".relay-teams"
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.resolve_existing_clawhub_path",
        lambda: Path("/usr/bin/clawhub"),
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.os.environ",
        {
            "LANG": "zh_CN.UTF-8",
            "PATH": "/usr/bin",
            "CLAWHUB_TOKEN": "ch_secret",
        },
    )

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        command = cast(list[str], args[0])
        env = kwargs.get("env")
        assert command == [
            str(Path("/usr/bin/clawhub")),
            "--workdir",
            str(config_dir.resolve()),
            "--no-input",
            "install",
            "skill-creator-2",
            "--version",
            "v1.2.3",
            "--force",
        ]
        assert isinstance(env, dict)
        assert env["CLAWHUB_TOKEN"] == "ch_secret"
        assert env["CLAWHUB_REGISTRY"] == "https://mirror-cn.clawhub.com"
        skill_dir = config_dir / "skills" / "skill-creator-2"
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(
            "---\n"
            "name: skill-creator\n"
            "description: Create skills.\n"
            "---\n"
            "Use skill creator.\n",
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(
            args=command,
            returncode=0,
            stdout="installed",
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", fake_run)

    result = run_clawhub_install(
        slug="skill-creator-2",
        version="v1.2.3",
        force=True,
        config_dir=config_dir,
    )

    assert result["ok"] is True
    assert result["slug"] == "skill-creator-2"
    assert result["requested_version"] == "v1.2.3"
    installed_skill = result.get("installed_skill")
    assert isinstance(installed_skill, dict)
    assert installed_skill["skill_id"] == "skill-creator-2"
    assert installed_skill["runtime_name"] == "skill-creator"
    assert installed_skill["ref"] == "skill-creator"
    diagnostics = result.get("diagnostics")
    assert isinstance(diagnostics, dict)
    assert diagnostics["registry"] == "https://mirror-cn.clawhub.com"
    assert diagnostics["skills_reloaded"] is False


def test_run_clawhub_install_installs_missing_binary(
    monkeypatch,
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / ".relay-teams"
    installed_path = Path("/opt/tools/clawhub/bin/clawhub")
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.resolve_existing_clawhub_path",
        lambda: None,
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.install_clawhub_via_npm",
        lambda *, timeout_seconds, base_env=None: ClawHubCliInstallResult(
            ok=True,
            attempted=True,
            clawhub_path=str(installed_path),
            npm_path="/usr/bin/npm",
            registry="https://mirrors.huaweicloud.com/repository/npm/",
        ),
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.os.environ",
        {"PATH": "/usr/bin"},
    )

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        command = cast(list[str], args[0])
        env = kwargs.get("env")
        assert command == [
            str(installed_path),
            "--workdir",
            str(config_dir.resolve()),
            "--no-input",
            "install",
            "skill-creator",
        ]
        assert isinstance(env, dict)
        assert env["PATH"].split(_PATH_LIST_SEPARATOR)[0] == str(installed_path.parent)
        skill_dir = config_dir / "skills" / "skill-creator"
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: skill-creator\ndescription: Create skills.\n---\nUse skill creator.\n",
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(
            args=command,
            returncode=0,
            stdout="installed",
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", fake_run)

    result = run_clawhub_install(
        slug="skill-creator",
        config_dir=config_dir,
    )

    assert result["ok"] is True
    assert result["clawhub_path"] == str(installed_path)
    diagnostics = result.get("diagnostics")
    assert isinstance(diagnostics, dict)
    assert diagnostics["installation_attempted"] is True
    assert diagnostics["installed_during_install"] is True


def test_run_clawhub_install_reports_runtime_discovery_failure(
    monkeypatch,
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / ".relay-teams"
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.resolve_existing_clawhub_path",
        lambda: Path("/usr/bin/clawhub"),
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.os.environ",
        {"PATH": "/usr/bin"},
    )
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *args, **kwargs: subprocess.CompletedProcess(
            args=args[0],
            returncode=0,
            stdout="installed",
            stderr="",
        ),
    )

    result = run_clawhub_install(
        slug="missing-runtime-skill",
        config_dir=config_dir,
    )

    assert result["ok"] is False
    assert result["error_code"] == "runtime_skill_unavailable"


def test_run_clawhub_install_rejects_unsupported_slug(tmp_path: Path) -> None:
    config_dir = tmp_path / ".relay-teams"

    result = run_clawhub_install(
        slug="org/skill-creator",
        config_dir=config_dir,
    )

    assert result["ok"] is False
    assert result["error_code"] == "unsupported_slug"


def test_run_clawhub_install_retries_without_endpoint_overrides(
    monkeypatch,
    tmp_path: Path,
) -> None:
    config_dir = tmp_path / ".relay-teams"
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.resolve_existing_clawhub_path",
        lambda: Path("/usr/bin/clawhub"),
    )
    monkeypatch.setattr(
        "relay_teams.skills.clawhub_cli_support.os.environ",
        {"LANG": "zh_CN.UTF-8", "PATH": "/usr/bin"},
    )
    observed_envs: list[dict[str, str]] = []

    def fake_run(*args: object, **kwargs: object) -> subprocess.CompletedProcess[str]:
        command = cast(list[str], args[0])
        env = kwargs.get("env")
        assert isinstance(env, dict)
        observed_envs.append(dict(env))
        if len(observed_envs) == 1:
            assert env["CLAWHUB_REGISTRY"] == "https://mirror-cn.clawhub.com"
            return subprocess.CompletedProcess(
                args=command,
                returncode=1,
                stdout="",
                stderr="- Installing\nValidation error\nuser: invalid value",
            )
        assert "CLAWHUB_REGISTRY" not in env
        assert "CLAWHUB_SITE" not in env
        skill_dir = config_dir / "skills" / "skill-creator"
        skill_dir.mkdir(parents=True, exist_ok=True)
        (skill_dir / "SKILL.md").write_text(
            "---\nname: skill-creator\ndescription: Create skills.\n---\nUse skill creator.\n",
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(
            args=command,
            returncode=0,
            stdout="installed",
            stderr="",
        )

    monkeypatch.setattr(subprocess, "run", fake_run)

    result = run_clawhub_install(
        slug="skill-creator",
        config_dir=config_dir,
    )

    assert result["ok"] is True
    installed_skill = result.get("installed_skill")
    assert isinstance(installed_skill, dict)
    assert installed_skill["skill_id"] == "skill-creator"
    diagnostics = result.get("diagnostics")
    assert isinstance(diagnostics, dict)
    assert diagnostics["registry"] == "https://mirror-cn.clawhub.com"
    assert diagnostics["endpoint_fallback_used"] is True
