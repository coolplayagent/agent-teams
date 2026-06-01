# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path


def test_legacy_index_contains_message_export_controls() -> None:
    source = (
        _repo_root()
        .joinpath("frontend", "dist", "index.html")
        .read_text(encoding="utf-8")
    )
    topbar_index = source.index('class="topbar-section topbar-section-right"')
    export_index = source.index('id="message-export-control"')
    chat_index = source.index('id="chat-container"')
    chat_open = source[
        chat_index : source.index("<!-- Coordinator chat messages -->", chat_index)
    ]

    assert topbar_index < export_index < chat_index
    assert "message-export-control" not in chat_open
    assert 'id="message-export-control"' in source
    assert 'id="message-export-btn"' in source
    assert 'id="message-export-menu"' in source
    assert 'data-export-format="html"' in source
    assert 'data-export-format="png"' in source
    assert 'data-i18n-title="message_export.label"' in source


def test_bootstrap_initializes_message_export() -> None:
    source = (
        _repo_root()
        .joinpath("frontend", "dist", "js", "app", "bootstrap.js")
        .read_text(encoding="utf-8")
    )

    assert 'from "../components/messageExport.js"' in source
    assert "initializeMessageExport();" in source


def test_message_export_i18n_keys_are_present_for_both_languages() -> None:
    source = (
        _repo_root()
        .joinpath("frontend", "dist", "js", "utils", "i18n.js")
        .read_text(encoding="utf-8")
    )

    for key in [
        "message_export.label",
        "message_export.html",
        "message_export.png",
        "message_export.no_session_message",
        "message_export.html_success",
        "message_export.png_split_success",
        "message_export.png_too_large_message",
        "message_export.turn_dialog_title",
        "message_export.turn_selected_count",
        "message_export.export_selected",
        "message_export.failed_message",
        "message_export.meta",
    ]:
        assert source.count(f"'{key}'") >= 2


def test_message_export_fetches_complete_round_pages() -> None:
    source = _message_export_source()

    assert "const EXPORT_ROUND_PAGE_LIMIT = 50;" in source
    assert "export async function collectCompleteSessionRounds" in source
    assert "while (hasMore)" in source
    assert "fetchSessionRounds(safeSessionId" in source
    assert "limit: EXPORT_ROUND_PAGE_LIMIT" in source
    assert "cursorRunId: cursorRunId || null" in source
    assert "return sortRoundsAscending(uniqueRoundsByRunId(allRounds));" in source


def test_message_export_html_is_standalone_transcript_only() -> None:
    source = _message_export_source()

    assert "async function buildStandaloneHtml" in source
    assert "<style>${cssText}</style>" in source
    assert "message-export-page" in source
    assert "buildExportPageCss()" in source
    assert "body.message-export-page" in source
    assert "exportThemeDeclarations()" in source
    assert "root.outerHTML" in source
    assert "'script'," in source
    assert "'link'," in source
    assert "prompt-input" not in source
    assert "sidebar" not in source
    assert "<script" not in source


def test_message_export_reuses_legacy_round_timeline_renderer() -> None:
    source = _message_export_source()
    timeline_source = (
        _repo_root()
        .joinpath(
            "frontend",
            "dist",
            "js",
            "components",
            "rounds",
            "timeline.js",
        )
        .read_text(encoding="utf-8")
    )

    assert "import { renderRoundSection } from './rounds/timeline.js';" in source
    assert "roundsEl.className = 'message-export-timeline';" in source
    assert "renderRoundSection(round, index, {" in source
    assert "includeDomId: false" in source
    assert "isLatestRound: index === rounds.length - 1" in source
    assert (
        "export function renderRoundSection(round, index, options = {})"
        in timeline_source
    )
    assert (
        "header.appendChild(buildRoundIntentBlock(round.run_id, round.intent, round.intent_parts));"
        in timeline_source
    )
    assert "renderHistoricalMessageList(section, mainMessages" in timeline_source
    assert "message-export-turn" not in source
    assert "message-export-user" not in source
    assert "message-export-agent" not in source
    assert "message_export.round" not in source
    assert "message_export.status" not in source


def test_message_export_prompts_for_turn_selection_before_rendering() -> None:
    source = _message_export_source()

    assert "async function resolveSelectedExportRounds" in source
    assert "showRoundSelectionDialog(items" in source
    assert "options.promptForRoundSelection === false" in source
    assert "Array.isArray(options.selectedRunIds)" in source
    assert "Array.isArray(options.turnIndexes)" in source
    assert "message_export.turn_selected_count" in source
    assert "message-export-selection-list" in source


def test_message_export_warns_before_splitting_large_png() -> None:
    source = _message_export_source()

    assert "const DEFAULT_PNG_CHUNK_HEIGHT = 6000;" in source
    assert "function measurePngRenderPlan" in source
    assert "function confirmLargePngExport" in source
    assert "renderPlan.chunkCount > 1" in source
    assert "options.allowSplitPng !== true" in source
    assert "options.download !== false" in source
    assert "message_export.png_too_large_message" in source
    assert "message_export.png_split_confirm" in source
    assert ": Math.min(safeHeight, DEFAULT_PNG_CHUNK_HEIGHT);" in source


def test_message_export_turn_preview_uses_structured_intent_parts() -> None:
    source = _message_export_source()

    assert "normalizePromptContentParts" in source
    assert "summarizePromptContentParts" in source
    assert (
        "const intentParts = normalizePromptContentParts(round?.intent_parts);"
        in source
    )
    assert "fallback: String(round?.intent || '')," in source


def test_message_export_styles_are_loaded_from_messages_bundle() -> None:
    aggregate = (
        _repo_root()
        .joinpath("frontend", "dist", "css", "components", "messages.css")
        .read_text(encoding="utf-8")
    )
    export_css = (
        _repo_root()
        .joinpath("frontend", "dist", "css", "components", "messages", "export.css")
        .read_text(encoding="utf-8")
    )

    assert '@import url("./messages/export.css");' in aggregate
    assert ".message-export-control {\n    position: relative;" in export_css
    assert ".message-export-trigger" in export_css
    assert ".message-export-root" in export_css
    assert ".message-export-timeline" in export_css
    assert ".message-export-dialog" in export_css
    assert ".message-export-selection-list" in export_css
    assert ".message-export-turn" not in export_css
    assert ".message-export-user" not in export_css
    assert ".message-export-agent" not in export_css
    assert ".message-export-round" not in export_css
    assert ".message-export-capture-host" in export_css
    assert "top: 0.9rem" not in export_css
    assert "right: 1.1rem" not in export_css


def test_message_export_png_uses_serialized_svg_dom() -> None:
    source = _message_export_source()

    assert "document.implementation.createDocument" in source
    assert "createElementNS" in source
    assert "svgDocument.importNode(root, true)" in source
    assert "new XMLSerializer().serializeToString(svgDocument)" in source
    assert "svgTextToDataUrl(svgText)" in source
    assert "data:image/svg+xml;base64" in source
    assert "URL.createObjectURL(new Blob([svgText]" not in source
    assert "html: clone.outerHTML" not in source
    assert "${html}" not in source


def test_message_export_title_uses_explicit_sidebar_label_not_metadata() -> None:
    source = _message_export_source()

    assert "function resolveSessionTitle(sessionId)" in source
    assert "sessionItem?.querySelector?.('.session-label-text')?.textContent" in source
    assert "sessionItem?.querySelector?.('.session-title')?.textContent" in source
    assert "sessionItem?.textContent" not in source
    assert "function sanitizeExportTitle" in source
    assert (
        ".replace(/\\s+\\d+\\s*(?:秒|分|分钟|小时|时|天|日|周|星期|个月|月|年)"
        in source
    )


def test_main_agent_message_label_is_not_rendered_visibly() -> None:
    block_source = (
        _repo_root()
        .joinpath(
            "frontend",
            "dist",
            "js",
            "components",
            "messageRenderer",
            "helpers",
            "block.js",
        )
        .read_text(encoding="utf-8")
    )
    stream_source = (
        _repo_root()
        .joinpath(
            "frontend",
            "dist",
            "js",
            "components",
            "messageRenderer",
            "stream.js",
        )
        .read_text(encoding="utf-8")
    )
    history_source = (
        _repo_root()
        .joinpath(
            "frontend",
            "dist",
            "js",
            "components",
            "messageRenderer",
            "history.js",
        )
        .read_text(encoding="utf-8")
    )
    timeline_source = (
        _repo_root()
        .joinpath(
            "frontend",
            "dist",
            "js",
            "components",
            "messageTimeline",
            "renderer.js",
        )
        .read_text(encoding="utf-8")
    )

    assert "wrapper.dataset.roleLabel = safeLabel;" in block_source
    assert "shouldRenderMessageRoleLabel(role, safeLabel, options)" in block_source
    assert "function isMainAgentVisibleLabel" in block_source
    assert "return normalized === 'mainagent';" in block_source
    assert "return true;" in block_source
    assert "wrapper.dataset.roleLabel || roleEl?.textContent" in stream_source
    assert "message.dataset.roleLabel || roleEl?.textContent" in history_source
    assert "shouldRenderMessageRoleLabel" in timeline_source
    assert "header?.remove();" in timeline_source


def _message_export_source() -> str:
    return (
        _repo_root()
        .joinpath("frontend", "dist", "js", "components", "messageExport.js")
        .read_text(encoding="utf-8")
    )


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]
