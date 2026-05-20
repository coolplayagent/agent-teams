# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path


def test_agent_panel_history_has_no_right_panel_auxiliary_tabs() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    history_source = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "agentPanel"
        / "history.js"
    ).read_text(encoding="utf-8")

    assert "export async function renderInstanceHistoryInto" in history_source
    assert "export async function loadAgentHistory" not in history_source
    assert "syncAgentPanelState" not in history_source
    assert "fetchMemories" not in history_source
    assert "fetchRunTokenUsage" not in history_source
    assert "agent-panel-runtime" not in history_source
    assert "agent-panel-memory" not in history_source
    assert "agent-panel-summary" not in history_source
