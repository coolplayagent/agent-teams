# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess


def test_markdown_fallback_renders_without_marked_or_highlight(
    tmp_path: Path,
) -> None:
    payload = _run_markdown_script(
        tmp_path=tmp_path,
        runner_source="""
import { renderMarkdownToHtml } from "./markdown.mjs";

const source = [
    "# Release Notes",
    "",
    "- Added offline markdown rendering",
    "- Removed CDN hard dependency",
    "",
    "> Works without external scripts.",
    "",
    "| Name | Status |",
    "| --- | --- |",
    "| markdown | local |",
    "",
    "```python",
    "print(\\"ok\\")",
    "```",
    "",
    "Open the [docs](/docs).",
].join("\\n");

const html = renderMarkdownToHtml(source);

console.log(JSON.stringify({ html }));
""".strip(),
    )

    html = payload["html"]
    assert "<h1>Release Notes</h1>" in html
    assert "<ul><li>Added offline markdown rendering</li>" in html
    assert "<blockquote><p>Works without external scripts.</p></blockquote>" in html
    assert "<table><thead><tr><th>Name</th><th>Status</th></tr></thead>" in html
    assert '<code class="language-python">print(&quot;ok&quot;)\n</code>' in html
    assert '<a href="/docs" target="_blank" rel="noreferrer">docs</a>' in html


def test_markdown_frontmatter_can_be_stripped_before_rendering(
    tmp_path: Path,
) -> None:
    payload = _run_markdown_script(
        tmp_path=tmp_path,
        runner_source="""
import { renderMarkdownToHtml, stripMarkdownFrontmatter } from "./markdown.mjs";

const source = [
    "---",
    "name: skill-creator",
    "description: Create skills.",
    "---",
    "# Skill Creator",
    "",
    "## Quick Start",
    "Use this skill.",
].join("\\n");
const stripped = stripMarkdownFrontmatter(source);
const html = renderMarkdownToHtml(stripped);

console.log(JSON.stringify({ stripped, html }));
""".strip(),
    )

    assert "name: skill-creator" not in payload["stripped"]
    assert payload["stripped"].startswith("# Skill Creator")
    assert "<h1>Skill Creator</h1>" in payload["html"]
    assert "description: Create skills." not in payload["html"]


def test_marked_renderer_escapes_raw_html_without_breaking_markdown(
    tmp_path: Path,
) -> None:
    payload = _run_markdown_script(
        tmp_path=tmp_path,
        include_marked=True,
        runner_source="""
const { renderMarkdownToHtml, parseMarkdown } = await import("./markdown.mjs");

globalThis.document = {
    addEventListener() {
        return undefined;
    },
    createElement(tagName) {
        if (tagName !== "template") {
            throw new Error(`unexpected element ${tagName}`);
        }
        return {
            _innerHTML: "",
            content: {
                querySelectorAll() {
                    return [];
                },
            },
            set innerHTML(value) {
                this._innerHTML = value;
            },
            get innerHTML() {
                return this._innerHTML;
            },
        };
    },
};

const html = renderMarkdownToHtml([
    "Model returned <a/> ok.",
    "Raw pair: <review>xxx</review>.",
    "Custom self tags: <div/> and <foo/>.",
    "Markdown link: [docs](/docs).",
    "Autolink: <https://example.com>.",
    "",
    "```",
    "<a/>",
    "```",
].join("\\n"));
const thinkingHtml = parseMarkdown("<think>plan</think>Visible");

console.log(JSON.stringify({ html, thinkingHtml }));
""".strip(),
    )

    html = payload["html"]
    assert "&lt;a/&gt;" in html
    assert "&lt;review&gt;xxx&lt;/review&gt;" in html
    assert "&lt;div/&gt;" in html
    assert "&lt;foo/&gt;" in html
    assert "<review>" not in html
    assert "<foo" not in html
    assert '<a href="/docs">docs</a>' in html
    assert '<a href="https://example.com">https://example.com</a>' in html
    assert "<code>&lt;a/&gt;\n</code>" in html

    thinking_html = payload["thinkingHtml"]
    assert 'class="thinking-block"' in thinking_html
    assert "plan" in thinking_html
    assert "&lt;think&gt;" not in thinking_html


def test_frontend_index_avoids_external_markdown_and_font_cdns() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    index_html = (repo_root / "frontend" / "dist" / "index.html").read_text(
        encoding="utf-8"
    )

    assert "fonts.googleapis.com" not in index_html
    assert "cdn.jsdelivr.net/npm/marked" not in index_html
    assert "cdnjs.cloudflare.com/ajax/libs/highlight.js" not in index_html


def _run_markdown_script(
    tmp_path: Path,
    runner_source: str,
    include_marked: bool = False,
) -> dict[str, str]:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = repo_root / "frontend" / "dist" / "js" / "utils" / "markdown.js"

    mock_feedback_path = tmp_path / "mockFeedback.mjs"
    mock_i18n_path = tmp_path / "mockI18n.mjs"
    module_under_test_path = tmp_path / "markdown.mjs"
    runner_path = tmp_path / "runner.mjs"

    mock_feedback_path.write_text(
        """
export function showToast() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )
    mock_i18n_path.write_text(
        """
const translations = {
    "composer.thinking": "Thinking",
    "thinking.live": "Live",
    "markdown.copy": "Copy",
    "markdown.copied": "Copied",
};

export function t(key) {
    return translations[key] || key;
}
""".strip(),
        encoding="utf-8",
    )

    source_text = (
        source_path.read_text(encoding="utf-8")
        .replace("./feedback.js", "./mockFeedback.mjs")
        .replace("./i18n.js", "./mockI18n.mjs")
    )
    module_under_test_path.write_text(source_text, encoding="utf-8")

    if include_marked:
        marked_runtime_path = tmp_path / "marked.cjs"
        marked_source_path = (
            repo_root / "frontend" / "dist" / "js" / "vendor" / "marked.min.js"
        )
        marked_runtime_path.write_text(
            marked_source_path.read_text(encoding="utf-8"),
            encoding="utf-8",
        )
        runner_source = f"""
import {{ createRequire }} from "node:module";

const require = createRequire(import.meta.url);
globalThis.marked = require("./{marked_runtime_path.name}");

{runner_source}
""".strip()

    runner_path.write_text(runner_source, encoding="utf-8")

    completed = subprocess.run(
        ["node", str(runner_path)],
        capture_output=True,
        check=False,
        cwd=str(repo_root),
        text=True,
        timeout=30,
    )
    if completed.returncode != 0:
        raise AssertionError(
            "Node runner failed:\n"
            f"STDOUT:\n{completed.stdout}\n"
            f"STDERR:\n{completed.stderr}"
        )
    return json.loads(completed.stdout)
