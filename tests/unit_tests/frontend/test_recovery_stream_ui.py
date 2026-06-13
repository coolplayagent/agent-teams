# -*- coding: utf-8 -*-
from __future__ import annotations

from pathlib import Path


def test_recovery_ui_uses_automatic_stream_reconnect_without_connect_button() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    recovery_script = (
        repo_root / "frontend" / "dist" / "js" / "app" / "recovery.js"
    ).read_text(encoding="utf-8")
    session_script = (
        repo_root / "frontend" / "dist" / "js" / "app" / "session.js"
    ).read_text(encoding="utf-8")
    prompt_script = (
        repo_root / "frontend" / "dist" / "js" / "app" / "prompt.js"
    ).read_text(encoding="utf-8")
    index_html = (repo_root / "frontend" / "dist" / "index.html").read_text(
        encoding="utf-8"
    )
    dom_script = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "dom.js"
    ).read_text(encoding="utf-8")
    timeline_script = (
        repo_root / "frontend" / "dist" / "js" / "components" / "rounds" / "timeline.js"
    ).read_text(encoding="utf-8")
    stream_script = (
        repo_root / "frontend" / "dist" / "js" / "core" / "stream.js"
    ).read_text(encoding="utf-8")
    sidebar_script = (
        repo_root / "frontend" / "dist" / "js" / "components" / "sidebar.js"
    ).read_text(encoding="utf-8")
    renderer_stream_script = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "stream.js"
    ).read_text(encoding="utf-8")
    history_script = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "history.js"
    ).read_text(encoding="utf-8")

    assert "Connect Stream" not in recovery_script
    assert "t('recovery.background_task.panel_label')" in recovery_script
    assert "const host = ensureBackgroundTaskHost();" in recovery_script
    assert "const approvalsHost = ensureRecoveryApprovalHost();" in recovery_script
    assert "const resumeBtn = ensureResumeRunButton();" in recovery_script
    assert "function ensureRecoveryApprovalHost()" in recovery_script
    assert "function ensureResumeRunButton()" in recovery_script
    assert 'type="text"' in recovery_script
    assert "compositionstart" in recovery_script
    assert "restoreFocusedUserQuestionSupplement(" in recovery_script
    assert (
        "handleUserQuestionSubmit(userQuestion.runId || runId, userQuestion);"
        in recovery_script
    )
    assert (
        "function shouldShowResumeAction(activeRun, approvals, userQuestions, pausedSubagent)"
        in recovery_script
    )
    assert "resumeBtn.style.display = 'inline-flex';" in recovery_script
    assert "approvalsHost.style.display = 'flex';" in recovery_script
    assert "renderApprovalList(activeRun, approvals)" in recovery_script
    assert 'class="recovery-approval-card"' in recovery_script
    assert (
        'class="recovery-approval-action recovery-approval-action-approve"'
        in recovery_script
    )
    assert (
        'class="recovery-approval-action recovery-approval-action-deny"'
        in recovery_script
    )
    assert "t('stream.approval_required')" in recovery_script
    assert (
        "isDisplayableBackgroundTask(task) && isBackgroundTaskActive(task)"
        in recovery_script
    )
    assert (
        "const hidePanel = !runId || activeBackgroundTasks.length === 0;"
        in recovery_script
    )
    assert (
        "activeRun.status === 'stopping' || activeRun.phase === 'stopping'"
        in recovery_script
    )
    assert "t('recovery.run_still_stopping')" in recovery_script
    assert "activeRun.status === 'paused'" in recovery_script
    assert "activeRun.phase === 'awaiting_recovery'" in recovery_script
    assert "action: 'resume-run'" in recovery_script
    assert "isPrimaryOrReservedRoleId(roleId)" in recovery_script
    assert "await ensureAutomaticRecoveryStream(snapshot," in recovery_script
    assert "resumeRunStream(activeRun.run_id, safeSessionId, null," in recovery_script
    assert "await reconcileMissingActiveRun(normalized, {" in recovery_script
    assert "const previousActiveRunId = String(" in recovery_script
    assert "!isCriticalContinuityRefreshReason(options.reason)" in recovery_script
    assert "function requiresFreshContinuitySnapshot(reason)" in recovery_script
    assert "'tool_approval_resolved'," in recovery_script
    assert "'user_question_answered'," in recovery_script
    assert "localTerminalRunStates.delete(runId);" in recovery_script
    assert (
        "const forceRecoveryRefresh = request.forceRefresh === true" in recovery_script
    )
    assert "forceRefresh: forceRecoveryRefresh," in recovery_script
    assert "reason: request.reason || 'continuity-refresh'," in recovery_script
    assert (
        "endStream({ preserveRunStreamState: true, focusPrompt: false });"
        in recovery_script
    )
    assert (
        "function shouldPreserveActiveSubagentView(sessionId = state.currentSessionId)"
        in recovery_script
    )
    assert "await loadSessionRounds(safeSessionId, {" in recovery_script
    assert "render: canRenderMainSessionView(safeSessionId)," in recovery_script
    assert "canRenderMainSessionView," in recovery_script
    assert "clearRunStreamState(safePreviousActiveRunId);" in recovery_script
    assert "clearRunPrimaryRole(safePreviousActiveRunId);" in recovery_script
    assert (
        "const lastEventId = Number(activeRun.last_event_id || 0);" in recovery_script
    )
    assert (
        "const checkpointEventId = Number(activeRun.checkpoint_event_id || 0);"
        in recovery_script
    )
    assert (
        "if (e?.status === 404 && state.currentSessionId === safeSessionId) {"
        in recovery_script
    )
    assert "stopSessionContinuity(safeSessionId);" in recovery_script
    assert (
        "const hasActiveBackgroundTasks = (state.currentRecoverySnapshot?.backgroundTasks || [])"
        in recovery_script
    )
    assert "|| hasActiveBackgroundTasks" in recovery_script
    assert (
        "detachActiveStreamForSessionSwitch({ focusPrompt: false });" in session_script
    )
    assert "autoConnectRunningStream(sessionId);" not in session_script
    assert "function autoConnectRunningStream(sessionId) {" not in session_script
    assert "clearAllStreamState({ preserveOverlay: true });" in session_script
    assert "clearAllStreamState({ preserveOverlay: true });" in prompt_script
    assert "clearAllStreamState({ preserveOverlay: true });" in timeline_script
    assert "export function attachRunStream(" in stream_script
    assert "const backgroundStreams = new Map();" in stream_script
    assert "const MAX_MULTIPLEX_RUN_STREAMS = 32;" in stream_script
    assert "const unavailableSessionCooldownUntil = new Map();" in stream_script
    assert "const SESSION_NOT_FOUND_COOLDOWN_MS = 30000;" in stream_script
    assert (
        "export function detachActiveStreamForSessionSwitch(options = {}) {"
        in stream_script
    )
    assert (
        "function promoteBackgroundStream(connection, options = {}) {" in stream_script
    )
    assert (
        "function applyBackgroundRunEvent(connection, evType, payload, eventMeta) {"
        in stream_script
    )
    assert "reason: 'background-reconnect'," in stream_script
    assert (
        "export function syncBackgroundStreamsForSessions(sessionRecords = []) {"
        in stream_script
    )
    assert "const sessions = await fetchSessions({ sidebar: true });" in stream_script
    assert "reason: 'background-discovery'," in stream_script
    assert "function attachBackgroundStreamForSession(record) {" in stream_script
    assert (
        "const attentionDelta = Number(runStreamAttention.get(rightRunId) || 0)"
        in stream_script
    )
    assert (
        "const focusedRunId = String(activeConnection?.runId || '').trim();"
        in stream_script
    )
    assert "|| String(state.currentSessionId || '').trim()" not in stream_script
    assert "|| pendingBackgroundAttachRunIds.size > 0" in stream_script
    assert "|| pendingRunStart" in stream_script
    assert "const backgroundRunIds = new Set();" in stream_script
    assert "if (focusedRunId && runId === focusedRunId) {" in stream_script
    assert "if (backgroundRunIds.has(runId)) {" in stream_script
    assert "if (desiredRunIds.size >= MAX_MULTIPLEX_RUN_STREAMS) {" in stream_script
    assert "requestMultiplexRunConnection('finish-active');" in stream_script
    assert "const unavailableRunCooldownUntil = new Map();" in stream_script
    assert "const RUN_NOT_FOUND_COOLDOWN_MS = 30000;" in stream_script
    assert "function forgetLocallyTerminalRun(runId)" in stream_script
    assert "evType === 'run_started' || evType === 'run_resumed'" in stream_script
    assert "forgetLocallyTerminalRun(runId);" in stream_script
    assert "status: 'stopped'," in stream_script
    assert "phase: 'stopped'," in stream_script
    assert "should_show_recover: true," in stream_script
    assert "pending_user_question_count: 0," in stream_script
    assert "pending_user_questions: []," in stream_script
    assert "if (isRunNotFoundError(data.error)) {" in stream_script
    assert "markSessionUnavailable(connection.sessionId);" in stream_script
    assert "if (isSessionUnavailable(sessionId)) {" in stream_script
    assert "if (!ignoreUnavailable && isRunUnavailable(safeRunId)) {" in stream_script
    assert "const nextMetadata = {};" in sidebar_script
    assert "const nextMetadata = { ...metadata };" not in sidebar_script
    assert "nextMetadata.title = null;" in sidebar_script
    assert "const streamCore = await import('../core/stream.js');" in sidebar_script
    assert "streamCore.syncBackgroundStreamsForSessions(sessions);" in sidebar_script
    assert "export function clearRenderedStreamState()" in renderer_stream_script
    assert "export function clearAllStreamState(options = {})" in renderer_stream_script
    assert (
        "export function applyStreamOverlayEvent(evType, payload, options = {}) {"
        in renderer_stream_script
    )
    assert "const overlayCleanupTimers = new Map();" in renderer_stream_script
    assert (
        "export function clearRunRenderedStreamState(runId)" in renderer_stream_script
    )
    assert (
        "scheduleOverlayEntryCleanup(runId, streamKey, roleId, cleanupDelayMs);"
        not in renderer_stream_script
    )
    assert (
        "scheduleRunOverlayCleanup(runId, cleanupDelayMs);"
        not in renderer_stream_script
    )
    assert "messageRenderer.clearRunStreamState(finishedRunId);" in stream_script
    assert "overlaySeenEventIdsByRun.delete(safeRunId);" in renderer_stream_script
    assert "clearTimelineRun(safeRunId);" in renderer_stream_script
    assert "st = createStreamState({" in renderer_stream_script
    assert "function findReusableStreamState({" in renderer_stream_script
    assert (
        "const overlayEntry = resolveOverlayEntry(runId, instanceId, roleId, label);"
        in renderer_stream_script
    )
    assert "getRunPrimaryRoleId," in renderer_stream_script
    assert (
        "const runPrimaryRoleId = safeRunId ? String(getRunPrimaryRoleId(safeRunId) || '').trim() : '';"
        in renderer_stream_script
    )
    assert (
        "const isPrimaryForRun = !!(safeRoleId && runPrimaryRoleId && safeRoleId === runPrimaryRoleId);"
        in renderer_stream_script
    )
    assert (
        "syncStreamingCursor(activeTextEl, overlayEntry?.textStreaming === true);"
        in renderer_stream_script
    )
    assert "textStreaming: false," in renderer_stream_script
    assert "entry.textStreaming = true;" in renderer_stream_script
    assert (
        "function setOverlayTextStreaming(runId, instanceId, roleId, label, isStreaming) {"
        in renderer_stream_script
    )
    assert "function findReusableMessageWrapper({" in renderer_stream_script
    assert (
        "function resolveOverlayEntry(runId, instanceId, roleId, label) {"
        in renderer_stream_script
    )
    assert (
        "const thinkingBinding = bindReusableThinkingState(contentEl, overlayEntry);"
        in renderer_stream_script
    )
    assert (
        "function bindReusableThinkingState(contentEl, overlayEntry) {"
        in renderer_stream_script
    )
    assert (
        "function findReusableThinkingTextElement(contentEl, key, partIndex) {"
        in renderer_stream_script
    )
    assert "function findLastReusableTextElement(contentEl) {" in renderer_stream_script
    assert "function resolveReusableTextPart(overlayEntry) {" in renderer_stream_script
    assert (
        "const reusableTextPart = resolveReusableTextPart(overlayEntry);"
        in renderer_stream_script
    )
    assert (
        "const canReuseText = overlayEntry?.textStreaming === true && !!reusableTextPart;"
        in renderer_stream_script
    )
    assert (
        "if (part.closed === true || part.streaming === false) {"
        in renderer_stream_script
    )
    assert "let lastRenderedMessage = null;" in history_script
    assert "renderStreamOverlayEntry(" in history_script
    assert "pendingToolBlocks," in history_script
    assert "lastRenderedMessage," in history_script
    assert "runId," in history_script
    assert "options," in history_script
    assert (
        "Object.prototype.hasOwnProperty.call(options, 'isLatestRound')"
        in timeline_script
    )
    assert ": index === roundsState.currentRounds.length - 1;" in timeline_script
    assert (
        "export async function loadSessionRounds(sessionId, options = {}) {"
        in timeline_script
    )
    assert (
        "if (options.render !== false && !shouldPreserveSubagentView(sessionId)) {"
        in timeline_script
    )
    assert (
        "if (!shouldPreserveSubagentView(state.currentSessionId)) {" in timeline_script
    )
    assert "runStatus: effectiveRoundStatus(round)," in timeline_script
    assert "runPhase: round.run_phase," in timeline_script
    assert "isLatestRound," in timeline_script
    assert (
        "const streamKey = resolveStreamKey(instanceId, roleId, runId);"
        in renderer_stream_script
    )
    assert "wrapper.dataset.streamKey = streamKey;" in (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "helpers"
        / "block.js"
    ).read_text(encoding="utf-8")
    assert (
        "const lastMessageContentEl = findLastCompatibleMessageContent(container, safeLabel, {"
        in history_script
    )
    assert (
        "function findLastCompatibleMessageContent(container, label, options = {}) {"
        in history_script
    )
    assert 'id="recovery-approval-host"' in index_html
    assert 'id="resume-run-btn"' in index_html
    assert 'recoveryApprovalHost: qs("#recovery-approval-host")' in dom_script
    assert 'resumeRunBtn: qs("#resume-run-btn")' in dom_script


def test_user_question_answered_forces_fresh_event_router_recovery() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    event_router_script = (
        repo_root / "frontend" / "dist" / "js" / "core" / "eventRouter" / "index.js"
    ).read_text(encoding="utf-8")
    fresh_block_start = event_router_script.index(
        "function requiresFreshContinuitySnapshot(evType)"
    )
    fresh_block = event_router_script[fresh_block_start : fresh_block_start + 320]

    assert "evType === 'user_question_answered'" in fresh_block


def test_background_discovery_fetches_once_before_busy_deferral() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    stream_script = (
        repo_root / "frontend" / "dist" / "js" / "core" / "stream.js"
    ).read_text(encoding="utf-8")
    defer_block_start = stream_script.index(
        "function shouldDeferBackgroundDiscoveryFetch"
    )
    defer_block = stream_script[defer_block_start : defer_block_start + 520]

    assert (
        "if (backgroundDiscoveryLastFetchAt <= 0) {\n        return false;\n    }"
        in defer_block
    )
    assert (
        "backgroundDiscoveryLastFetchAt = now;\n        return true;" not in defer_block
    )


def test_frontend_logs_use_keepalive_only_for_unload_flush() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    logger_script = (
        repo_root / "frontend" / "dist" / "js" / "utils" / "logger.js"
    ).read_text(encoding="utf-8")

    assert logger_script.count("flushFrontendLogs({ useKeepalive: true") == 1
    assert "beforeunload" in logger_script
    assert "void flushFrontendLogs();" in logger_script


def test_detached_run_creation_forces_sidebar_refresh() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    stream_script = (
        repo_root / "frontend" / "dist" / "js" / "core" / "stream.js"
    ).read_text(encoding="utf-8")
    detached_start = stream_script.index("async function startDetachedIntentStream")
    detached_block = stream_script[detached_start : detached_start + 1500]

    assert (
        "scheduleSessionsRefresh(RUN_CREATED_SIDEBAR_REFRESH_DELAY_MS, {\n"
        "            forceRefresh: true,\n"
        "        });" in detached_block
    )
