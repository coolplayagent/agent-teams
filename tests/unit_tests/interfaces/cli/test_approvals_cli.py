# -*- coding: utf-8 -*-
from __future__ import annotations

import json

from typer.testing import CliRunner

from relay_teams.interfaces.cli.approvals_cli import build_approvals_app

runner = CliRunner()


def test_approvals_resolve_sends_acp_option_id() -> None:
    requests: list[tuple[str, str, str, dict[str, object] | None]] = []
    autostart_calls: list[tuple[str, bool, bool, bool]] = []

    def request_json(
        base_url: str,
        method: str,
        path: str,
        payload: dict[str, object] | None,
    ) -> dict[str, object] | list[object]:
        requests.append((base_url, method, path, payload))
        return {"status": "ok"}

    def auto_start_if_needed(
        base_url: str,
        autostart: bool,
        daemon: bool,
        force: bool,
    ) -> None:
        autostart_calls.append((base_url, autostart, daemon, force))

    app = build_approvals_app(
        request_json=request_json,
        auto_start_if_needed=auto_start_if_needed,
        default_base_url="http://127.0.0.1:8000",
    )

    result = runner.invoke(
        app,
        [
            "resolve",
            "--run-id",
            "run-1",
            "--tool-call-id",
            "tool-1",
            "--action",
            "approve",
            "--feedback",
            "ok",
            "--option-id",
            "allow_always",
        ],
    )

    assert result.exit_code == 0
    assert json.loads(result.output) == {"status": "ok"}
    assert autostart_calls == [("http://127.0.0.1:8000", True, False, False)]
    assert requests == [
        (
            "http://127.0.0.1:8000",
            "POST",
            "/api/runs/run-1/tool-approvals/tool-1/resolve",
            {
                "action": "approve",
                "feedback": "ok",
                "option_id": "allow_always",
            },
        )
    ]
