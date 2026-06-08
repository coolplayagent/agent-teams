# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess


def test_diagnostics_text_is_hidden_until_enabled(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = repo_root / "frontend" / "dist" / "js" / "utils" / "diagnostics.js"
    module_under_test_path = tmp_path / "diagnostics.mjs"
    runner_path = tmp_path / "runner.mjs"

    source_text = source_path.read_text(encoding="utf-8").replace(
        "./i18n.js", "./mockI18n.mjs"
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) {
    const translations = {
        'rounds.verification.user_message': 'Verification not passed.',
    };
    return translations[key] || key;
}
""".strip(),
        encoding="utf-8",
    )
    runner_path.write_text(
        """
const storage = new Map();
globalThis.localStorage = {
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    setItem(key, value) { storage.set(key, String(value)); },
};
globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail || {};
    }
};
globalThis.document = {
    body: { dataset: {} },
    dispatchEvent(event) {
        globalThis.__diagnosticEventCount = (globalThis.__diagnosticEventCount || 0) + 1;
        globalThis.__lastDiagnosticEvent = event;
    },
};

const {
    applyDiagnosticsVisibility,
    buildDiagnosticPresentation,
    sanitizeDiagnosticText,
} = await import('./diagnostics.mjs');
applyDiagnosticsVisibility(false);
applyDiagnosticsVisibility(false);
const raw = 'verification_failedruntime_guardrail:pre_execution_boundary';
const hidden = sanitizeDiagnosticText(raw);
const ordinaryExplanation = sanitizeDiagnosticText('The verification_failed error code means the run did not satisfy a verifier.');
const suppressedPublicMessage = buildDiagnosticPresentation('Verification not passed.', { suppressUserMessage: true });
const suppressedBackendEnglishMessage = buildDiagnosticPresentation(
    'The task finished, but verification did not pass. Review the result and continue with corrections if needed.',
    { suppressUserMessage: true },
);
const legacy = `Kept answer.

Verification failed.
5 check(s): 3 passed, 2 failed.

Failed:
[FAIL] runtime_guardrail:pre_execution_boundary -- 3 pre-execution guardrail block(s) recorded.
[FAIL] runtime_guardrail_status -- Runtime guardrail report contains blocked actions.

Passed:
[PASS] non_empty_response
[PASS] runtime_guardrail:execution_monitoring

Review the task spec and evidence expectations, then continue with corrected output.`;
const legacyHidden = buildDiagnosticPresentation(legacy);
const suppressedLegacyHidden = buildDiagnosticPresentation(legacy, { suppressUserMessage: true });
const suppressedRawHidden = buildDiagnosticPresentation(raw, { suppressUserMessage: true });
applyDiagnosticsVisibility(true);
applyDiagnosticsVisibility(true);
localStorage.setItem('agent_teams_appearance', JSON.stringify({ showDiagnostics: true }));
delete document.body.dataset.showDiagnostics;
const visible = sanitizeDiagnosticText(raw);
const legacyVisible = buildDiagnosticPresentation(legacy);
const suppressedLegacyVisible = buildDiagnosticPresentation(legacy, { suppressUserMessage: true });
const suppressedRawVisible = buildDiagnosticPresentation(raw, { suppressUserMessage: true });

console.log(JSON.stringify({
    hidden,
    visible,
    ordinaryExplanation,
    suppressedPublicMessage,
    suppressedBackendEnglishMessage,
    legacyHidden,
    legacyVisible,
    suppressedLegacyHidden,
    suppressedRawHidden,
    suppressedLegacyVisible,
    suppressedRawVisible,
    diagnosticEventCount: globalThis.__diagnosticEventCount,
    lastDiagnosticEventDetail: globalThis.__lastDiagnosticEvent.detail,
}));
""".strip(),
        encoding="utf-8",
    )

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        encoding="utf-8",
        timeout=3,
    )

    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )

    payload = json.loads(completed.stdout)
    assert payload["hidden"] == "Verification not passed."
    assert (
        payload["visible"]
        == "verification_failedruntime_guardrail:pre_execution_boundary"
    )
    assert (
        payload["ordinaryExplanation"]
        == "The verification_failed error code means the run did not satisfy a verifier."
    )
    assert payload["suppressedPublicMessage"] == {
        "text": "",
        "hasDetails": False,
        "detail": "",
        "detailMode": "",
    }
    assert payload["suppressedBackendEnglishMessage"] == {
        "text": "",
        "hasDetails": False,
        "detail": "",
        "detailMode": "",
    }
    assert payload["legacyHidden"]["text"] == "Kept answer.\n\nVerification not passed."
    assert payload["legacyHidden"] == {
        "text": "Kept answer.\n\nVerification not passed.",
        "hasDetails": False,
        "detail": "",
        "detailMode": "",
    }
    assert payload["suppressedLegacyHidden"] == {
        "text": "Kept answer.",
        "hasDetails": False,
        "detail": "",
        "detailMode": "",
    }
    assert payload["suppressedRawHidden"] == {
        "text": "",
        "hasDetails": False,
        "detail": "",
        "detailMode": "",
    }
    assert payload["legacyVisible"]["hasDetails"] is True
    assert payload["legacyVisible"]["detailMode"] == "raw"
    assert (
        "runtime_guardrail:pre_execution_boundary" in payload["legacyVisible"]["detail"]
    )
    assert payload["suppressedLegacyVisible"] == {
        "text": "Kept answer.",
        "hasDetails": False,
        "detail": "",
        "detailMode": "",
    }
    assert payload["suppressedRawVisible"] == {
        "text": "",
        "hasDetails": False,
        "detail": "",
        "detailMode": "",
    }
    assert payload["diagnosticEventCount"] == 2
    assert payload["lastDiagnosticEventDetail"] == {"enabled": True}


def test_diagnostics_renders_from_rich_text_source_and_general_settings() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    block_source = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "helpers"
        / "block.js"
    ).read_text(encoding="utf-8")
    settings_source = (
        repo_root / "frontend" / "dist" / "js" / "components" / "settings" / "index.js"
    ).read_text(encoding="utf-8")
    timeline_source = (
        repo_root / "frontend" / "dist" / "js" / "components" / "rounds" / "timeline.js"
    ).read_text(encoding="utf-8")

    assert "renderRichContent(textEl, source," in block_source
    assert "renderRichContent(textEl, String(text || '')," not in block_source
    assert (
        "const suppressDiagnosticUserMessage = String(round?.verification_status || '')"
        in timeline_source
    )
    assert "suppressDiagnosticUserMessage," in timeline_source
    assert "round-verification-details" in timeline_source
    assert "if (!areDiagnosticsVisible())" in timeline_source
    assert (
        "const diagnosticMessage = collectVerificationDiagnosticMessage(round, messages);"
        in timeline_source
    )
    assert (
        "section.insertAdjacentHTML('beforeend', verificationNotice)" in timeline_source
    )
    assert (
        "header.insertAdjacentHTML('beforeend', verificationNotice)"
        not in timeline_source
    )
    assert 'id="settings-show-diagnostics"' in settings_source
    general_panel_index = settings_source.index('id="general-panel"')
    diagnostics_index = settings_source.index('id="settings-show-diagnostics"')
    shell_policy_index = settings_source.index(
        'id="settings-shell-safety-policy-toggle"'
    )
    appearance_panel_index = settings_source.index('id="appearance-panel"')
    assert general_panel_index < diagnostics_index < shell_policy_index
    assert diagnostics_index < appearance_panel_index
