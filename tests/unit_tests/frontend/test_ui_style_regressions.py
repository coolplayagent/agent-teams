from __future__ import annotations

from pathlib import Path


FRONTEND = Path("frontend/dist")


def test_connectors_styles_use_theme_variables_that_exist_in_dark_mode() -> None:
    css = (FRONTEND / "css" / "components" / "connectors.css").read_text(
        encoding="utf-8"
    )

    assert "--surface-panel" not in css
    assert "--surface-subtle" not in css
    assert "--text-muted" not in css
    assert "var(--bg-surface" in css
    assert "var(--bg-surface-muted" in css
    assert "var(--text-secondary" in css


def test_observability_styles_stay_plain_and_theme_compatible() -> None:
    css = (FRONTEND / "css" / "components" / "observability.css").read_text(
        encoding="utf-8"
    )

    assert "radial-gradient" not in css
    assert "filter: blur" not in css
    assert "border-radius: 999px" not in css
    assert "--tone-glow" not in css
    assert ".observability-scope-btn.active" in css
    assert "background: var(--button-primary-bg);" in css
    assert "color: var(--button-primary-text);" in css


def test_observability_charts_use_small_central_palette() -> None:
    source = (FRONTEND / "js" / "components" / "observability.js").read_text(
        encoding="utf-8"
    )

    assert "const OBSERVABILITY_CHART_COLORS = Object.freeze({" in source
    assert "const OBSERVABILITY_BREAKDOWN_PALETTE = Object.freeze([" in source
    assert "function chartColor(tone)" in source
    assert "function resolveChartTheme()" in source
    assert "'--text-primary'" in source
    assert "'--text-secondary'" in source
    assert "rgba(37, 99, 235" not in source
    assert "rgba(124, 58, 237" not in source


def test_settings_empty_states_use_shared_settings_empty_component() -> None:
    commands_source = (
        FRONTEND / "js" / "components" / "settings" / "commandsSettings.js"
    ).read_text(encoding="utf-8")
    plugins_source = (
        FRONTEND / "js" / "components" / "settings" / "pluginsSettings.js"
    ).read_text(encoding="utf-8")
    settings_css = (FRONTEND / "css" / "components" / "settings.css").read_text(
        encoding="utf-8"
    )
    plugins_css = (
        FRONTEND / "css" / "components" / "settings" / "plugins.css"
    ).read_text(encoding="utf-8")

    assert 'class="settings-empty-state commands-empty-card"' in commands_source
    assert "commands-empty-icon" not in commands_source
    assert "commands-empty-icon" not in settings_css
    assert 'class="settings-empty-state plugins-empty-state"' in plugins_source
    assert "plugins-empty-state h5" not in plugins_css


def test_settings_list_pages_share_record_and_form_primitives() -> None:
    commands_source = (
        FRONTEND / "js" / "components" / "settings" / "commandsSettings.js"
    ).read_text(encoding="utf-8")
    plugins_source = (
        FRONTEND / "js" / "components" / "settings" / "pluginsSettings.js"
    ).read_text(encoding="utf-8")
    orchestration_source = (
        FRONTEND / "js" / "components" / "settings" / "orchestrationSettings.js"
    ).read_text(encoding="utf-8")
    triggers_source = (
        FRONTEND / "js" / "components" / "settings" / "triggerSettings.js"
    ).read_text(encoding="utf-8")
    github_source = (
        FRONTEND / "js" / "components" / "settings" / "githubSettings.js"
    ).read_text(encoding="utf-8")
    hooks_source = (
        FRONTEND / "js" / "components" / "settings" / "hooksSettings.js"
    ).read_text(encoding="utf-8")
    environment_source = (
        FRONTEND / "js" / "components" / "settings" / "environmentVariables.js"
    ).read_text(encoding="utf-8")
    system_source = (
        FRONTEND / "js" / "components" / "settings" / "systemStatus.js"
    ).read_text(encoding="utf-8")

    for source in [
        commands_source,
        plugins_source,
        orchestration_source,
        triggers_source,
        environment_source,
        system_source,
    ]:
        assert "settings-record-list" in source
        assert "settings-record" in source
        assert "settings-record-title" in source
        assert "settings-record-meta" in source

    for source in [
        github_source,
        hooks_source,
        plugins_source,
        environment_source,
        system_source,
    ]:
        assert "settings-form-section-header" in source

    assert (
        "settings-record general-setting-card mcp-status-card hooks-runtime-card"
        in hooks_source
    )
    assert (
        "settings-form-section general-setting-card mcp-status-card hooks-config-card"
        in hooks_source
    )
    assert "settings-form-section hooks-handler-card" in hooks_source
    assert (
        "proxy-form-section settings-form-section"
        not in hooks_source[
            hooks_source.index("function renderEventGroup") : hooks_source.index(
                "function renderNoHooksState"
            )
        ]
    )
    assert 'class="settings-form-section plugins-editor-panel"' in plugins_source
    assert "commands-table" not in commands_source
    assert "commands-table-head" not in commands_source
    assert "commands-total" not in commands_source
    assert 'class="settings-record-list commands-list"' in commands_source
    assert 'class="settings-record plugin-detail-item"' in plugins_source
    assert 'class="settings-form-section plugin-detail-section"' in plugins_source
    assert "plugins-toolbar" not in plugins_source
    assert "settings.plugins.total_loaded" not in plugins_source
    assert "settings.plugins.enabled_count" not in plugins_source
    assert "settings.plugins.diagnostics_count" not in plugins_source
    assert "plugins-inline-hint" not in plugins_source
    assert "settings.plugins.git_ref_help" not in plugins_source
    assert (
        "<small>${escapeHtml(t('settings.plugins.git_ref_help'))}</small>"
        not in plugins_source
    )
    assert 'class="settings-form-section env-scope-section"' in environment_source
    assert 'class="settings-record-list mcp-status-list"' in system_source
    assert (
        'class="settings-empty-state settings-empty-state-compact mcp-tools-empty'
        in system_source
    )


def test_settings_foundation_uses_card_surfaces_for_forms_and_records() -> None:
    foundation_css = (
        FRONTEND / "css" / "components" / "settings" / "foundation.css"
    ).read_text(encoding="utf-8")

    assert ".settings-form-section {" in foundation_css
    assert "padding: 0.95rem 1rem 1rem;" in foundation_css
    assert "border: 1px solid var(--settings-border-soft);" in foundation_css
    assert "border-radius: var(--radius-md);" in foundation_css
    assert ".settings-record-list {" in foundation_css
    assert "padding: 0 1rem;" in foundation_css
    assert ".settings-record:last-child" in foundation_css


def test_settings_uncodixfy_high_risk_visual_patterns_are_restrained() -> None:
    settings_css = (FRONTEND / "css" / "components" / "settings.css").read_text(
        encoding="utf-8"
    )
    model_css = (
        FRONTEND / "css" / "components" / "settings" / "model-profiles.css"
    ).read_text(encoding="utf-8")
    plugins_css = (
        FRONTEND / "css" / "components" / "settings" / "plugins.css"
    ).read_text(encoding="utf-8")

    web_link_block = settings_css[
        settings_css.index(".web-provider-link-card {") : settings_css.index(
            ".proxy-inline-field-test {"
        )
    ]
    assert "linear-gradient" not in web_link_block
    assert "translateY" not in web_link_block
    assert "border-radius: 999px" not in web_link_block

    commands_block = settings_css[
        settings_css.index(".commands-group {") : settings_css.index(
            ".command-editor-panel {"
        )
    ]
    assert "border-radius: 999px" not in commands_block
    assert "commands-table" not in commands_block
    assert "commands-table-head" not in commands_block
    assert "commands-total" not in commands_block
    assert "grid-template-columns: minmax(0, 1fr) auto;" in commands_block

    editor_block = settings_css[
        settings_css.index(".role-editor-sections {") : settings_css.index(
            ".role-prompt-textarea {"
        )
    ]
    assert "gap: 0.85rem;" in editor_block
    assert "border: 1px solid var(--settings-border-soft);" in editor_block
    assert "border-radius: var(--radius-md);" in editor_block

    assert "border-radius: 50%;" not in model_css
    assert ".model-provider-choice-icon {\n    display: none;" in model_css
    assert "border-radius: 999px" not in plugins_css
    assert "plugins-toolbar" not in plugins_css
    assert "plugins-toolbar-stats" not in plugins_css
    assert ".settings-option-list {" in settings_css
    assert ".settings-option-list,\n.role-option-picker {" not in settings_css


def test_role_option_picker_keeps_vertical_scrolling() -> None:
    settings_css = (FRONTEND / "css" / "components" / "settings.css").read_text(
        encoding="utf-8"
    )

    picker_block = settings_css[
        settings_css.index(".role-option-picker {") : settings_css.index(
            ".settings-option-list {"
        )
    ]
    settings_list_block = settings_css[
        settings_css.index(".settings-option-list {") : settings_css.index(
            ".role-option-picker::-webkit-scrollbar"
        )
    ]

    assert settings_css.count(".role-option-picker {") == 1
    assert "max-height: 260px;" in picker_block
    assert "overflow-x: hidden;" in picker_block
    assert "overflow-y: auto;" in picker_block
    assert "overflow: hidden;" not in picker_block
    assert "overflow-x: hidden;" in settings_list_block
