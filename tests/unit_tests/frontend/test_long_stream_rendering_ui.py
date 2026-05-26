# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess


def test_long_stream_text_uses_plain_append_renderer(tmp_path: Path) -> None:
    payload = _run_block_helper_script(
        tmp_path,
        """
const { updateMessageText, updateThinkingText } = await import('./block.mjs');

const shortEl = document.createElement('div');
updateMessageText(shortEl, 'short **markdown**', { streaming: true });

const longEl = document.createElement('div');
const longText = 'x'.repeat(13000);
updateMessageText(longEl, longText, { streaming: true });
updateMessageText(longEl, `${longText}y`, { streaming: true });
syncTextContent(longEl);
const longTextLengthBeforeFlush = longEl.textContent.length;
flushFrames();
syncTextContent(longEl);

const thinkingEl = document.createElement('div');
const thinkingText = 'z'.repeat(100000);
updateThinkingText(thinkingEl, thinkingText, { streaming: true });
syncTextContent(thinkingEl);
const thinkingTextLengthBeforeFlush = thinkingEl.textContent.length;
flushFrames();
syncTextContent(thinkingEl);

console.log(JSON.stringify({
    richCalls: globalThis.__richCalls,
    longMode: longEl.dataset.renderMode,
    longTextLengthBeforeFlush,
    longTextLength: longEl.textContent.length,
    longTextNodes: countTextNodes(longEl),
    thinkingMode: thinkingEl.dataset.renderMode,
    thinkingTextLengthBeforeFlush,
    thinkingTextLength: thinkingEl.textContent.length,
    thinkingTextNodes: countTextNodes(thinkingEl),
}));
""",
    )

    assert payload == {
        "richCalls": [18],
        "longMode": "plain-stream",
        "longTextLengthBeforeFlush": 13001,
        "longTextLength": 13001,
        "longTextNodes": 1,
        "thinkingMode": "plain-stream",
        "thinkingTextLengthBeforeFlush": 12000,
        "thinkingTextLength": 100000,
        "thinkingTextNodes": 1,
    }


def test_progressive_text_append_delta_preserves_unflushed_source(
    tmp_path: Path,
) -> None:
    payload = _run_block_helper_script(
        tmp_path,
        """
const { updateMessageText } = await import('./block.mjs');

const textEl = document.createElement('div');
const initial = 'a'.repeat(50000);
const delta = 'b'.repeat(5000);
updateMessageText(textEl, initial, { streaming: true });
syncTextContent(textEl);
const beforeDeltaLength = textEl.textContent.length;
updateMessageText(textEl, delta, { streaming: true, appendDelta: true });
syncTextContent(textEl);
const afterDeltaLength = textEl.textContent.length;
flushFrames();
syncTextContent(textEl);

console.log(JSON.stringify({
    beforeDeltaLength,
    afterDeltaLength,
    finalLength: textEl.textContent.length,
    startsWithInitial: textEl.textContent.startsWith('a'.repeat(50000)),
    endsWithDelta: textEl.textContent.endsWith(delta),
}));
""",
    )

    assert payload == {
        "beforeDeltaLength": 12000,
        "afterDeltaLength": 12000,
        "finalLength": 55000,
        "startsWithInitial": True,
        "endsWithDelta": True,
    }


def test_stream_crossing_plain_threshold_keeps_rendered_prefix(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "stream.js"
    ).read_text(encoding="utf-8")
    (tmp_path / "stream.mjs").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() { return ""; }
export function isPrimaryRoleId() { return false; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function formatMessage(key) { return key; }
export function t(key) { return key; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return {}; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock(container, _role, _label, _parts = [], options = {}) {
  const contentEl = document.createElement("div");
  const wrapper = document.createElement("div");
  wrapper.dataset = {
    runId: String(options.runId || ""),
    roleId: String(options.roleId || ""),
    instanceId: String(options.instanceId || ""),
    streamKey: String(options.streamKey || ""),
  };
  wrapper.querySelector = selector => selector === ".msg-content" ? contentEl : null;
  container.appendChild(wrapper);
  return { wrapper, contentEl };
}
export function resolvePendingToolBlock() { return null; }
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateThinkingText() {}
export function updateMessageText(textEl, text, options = {}) {
  globalThis.__textUpdates.push({
    length: String(text || "").length,
    appendDelta: options.appendDelta === true,
    streaming: options.streaming === true,
  });
  textEl.textContent = String(text || "");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "runner.mjs").write_text(
        """
globalThis.__textUpdates = [];
globalThis.document = {
  createElement() {
    return {
      className: "",
      dataset: {},
      textContent: "",
      children: [],
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
    };
  },
};

const { appendStreamChunk, getOrCreateStreamBlock } = await import("./stream.mjs");
const container = document.createElement("div");
container.scrollHeight = 1000;
container.clientHeight = 500;
container.scrollTop = 500;
container.addEventListener = () => {};
getOrCreateStreamBlock(container, "inst-1", "Writer", "Writer", "run-1");
appendStreamChunk("inst-1", "x".repeat(10000), "run-1", "Writer", "Writer");
appendStreamChunk("inst-1", "y".repeat(3000), "run-1", "Writer", "Writer");

console.log(JSON.stringify(globalThis.__textUpdates));
""".strip(),
        encoding="utf-8",
    )

    result = subprocess.run(
        ["node", str(tmp_path / "runner.mjs")],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
        timeout=10,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"Node runner failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )

    assert json.loads(result.stdout) == [
        {"length": 10000, "appendDelta": False, "streaming": True},
        {"length": 13000, "appendDelta": False, "streaming": True},
    ]


def test_streaming_thinking_chunks_are_frame_batched(tmp_path: Path) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "stream.js"
    ).read_text(encoding="utf-8")
    (tmp_path / "stream.mjs").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (tmp_path / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() { return ""; }
export function isPrimaryRoleId() { return false; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function formatMessage(key) { return key; }
export function t(key) { return key; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return { textContent: "" }; }
export function buildPendingToolBlock() { return {}; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock(container, _role, _label, _parts = [], options = {}) {
  const contentEl = document.createElement("div");
  const wrapper = document.createElement("div");
  wrapper.dataset = {
    runId: String(options.runId || ""),
    roleId: String(options.roleId || ""),
    instanceId: String(options.instanceId || ""),
    streamKey: String(options.streamKey || ""),
  };
  wrapper.querySelector = selector => selector === ".msg-content" ? contentEl : null;
  container.appendChild(wrapper);
  return { wrapper, contentEl };
}
export function resolvePendingToolBlock() { return null; }
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateMessageText() {}
export function updateThinkingText(textEl, text, options = {}) {
  globalThis.__thinkingUpdates.push({
    text: String(text || ""),
    streaming: options.streaming === true,
    appendDelta: options.appendDelta === true,
  });
  textEl.textContent = String(text || "");
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "runner.mjs").write_text(
        """
const frames = [];
globalThis.window = {
  requestAnimationFrame(callback) {
    frames.push(callback);
    return frames.length;
  },
  cancelAnimationFrame() {},
};
globalThis.performance = { now: () => 1000 };
globalThis.__thinkingUpdates = [];
globalThis.document = {
  createElement() {
    return {
      className: "",
      dataset: {},
      textContent: "",
      children: [],
      appendChild(child) {
        this.children.push(child);
        child.parentNode = this;
        return child;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
    };
  },
};

function flushFrames() {
  while (frames.length) {
    frames.shift()(1000);
  }
}

const {
  appendThinkingChunk,
  getOrCreateStreamBlock,
} = await import("./stream.mjs");

const container = document.createElement("div");
container.scrollHeight = 1000;
container.clientHeight = 500;
container.scrollTop = 500;
container.addEventListener = () => {};

getOrCreateStreamBlock(container, "inst-1", "Writer", "Writer", "run-1");
appendThinkingChunk("inst-1", 0, "first", {
  runId: "run-1",
  roleId: "Writer",
  label: "Writer",
});
appendThinkingChunk("inst-1", 0, "second", {
  runId: "run-1",
  roleId: "Writer",
  label: "Writer",
});

const beforeFlush = globalThis.__thinkingUpdates.length;
flushFrames();

console.log(JSON.stringify({
  beforeFlush,
  updates: globalThis.__thinkingUpdates,
}));
""".strip(),
        encoding="utf-8",
    )

    result = subprocess.run(
        ["node", str(tmp_path / "runner.mjs")],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
        timeout=10,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"Node runner failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )

    assert json.loads(result.stdout) == {
        "beforeFlush": 0,
        "updates": [{"text": "firstsecond", "streaming": True, "appendDelta": False}],
    }


def test_progressive_helper_splits_large_text_and_line_batches(
    tmp_path: Path,
) -> None:
    repo_root = Path(__file__).resolve().parents[3]
    source = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "helpers"
        / "progressiveText.js"
    ).read_text(encoding="utf-8")
    (tmp_path / "progressiveText.mjs").write_text(source, encoding="utf-8")
    (tmp_path / "runner.mjs").write_text(
        """
const frames = [];
globalThis.window = {
  requestAnimationFrame(callback) {
    frames.push(callback);
    return frames.length;
  },
};
globalThis.performance = { now: () => 1000 };

class FakeText {
  constructor(text = "") {
    this.nodeType = 3;
    this.textContent = String(text || "");
    this.parentNode = null;
  }
}

class FakeElement {
  constructor() {
    this.children = [];
    this.childNodes = this.children;
    this.textContent = "";
    this.innerHTML = "";
    this.dataset = {};
    this.className = "";
  }
  appendChild(node) {
    node.parentNode = this;
    this.children.push(node);
    this.childNodes = this.children;
    this.syncText();
    return node;
  }
  replaceChildren() {
    this.children.forEach(child => { child.parentNode = null; });
    this.children = [];
    this.childNodes = this.children;
    this.textContent = "";
    this.innerHTML = "";
  }
  querySelector() { return null; }
  insertAdjacentHTML(_position, html) {
    this.innerHTML += String(html || "");
  }
  syncText() {
    this.textContent = this.children.map(child => String(child.textContent || "")).join("");
  }
}

function flushOneFrame() {
  if (frames.length) frames.shift()(1000);
}

function flushAllFrames() {
  while (frames.length) flushOneFrame();
}

globalThis.document = {
  createTextNode(text) { return new FakeText(text); },
};

const {
  renderProgressiveHtmlBatches,
  renderProgressivePlainText,
} = await import("./progressiveText.mjs");

const textTarget = new FakeElement();
const source = "x".repeat(50000);
renderProgressivePlainText(textTarget, source, { chunkChars: 10000 });
renderProgressivePlainText(textTarget, source + "y".repeat(20000), { chunkChars: 10000 });
textTarget.syncText();
const textAfterSync = textTarget.textContent.length;
flushOneFrame();
textTarget.syncText();
const textAfterOneFrame = textTarget.textContent.length;
flushAllFrames();
textTarget.syncText();

const resetTarget = new FakeElement();
renderProgressivePlainText(resetTarget, source, { chunkChars: 10000 });
resetTarget.replaceChildren();
renderProgressivePlainText(resetTarget, source + "z".repeat(1000), { chunkChars: 10000 });
flushAllFrames();
resetTarget.syncText();

const htmlTarget = new FakeElement();
renderProgressiveHtmlBatches(
  htmlTarget,
  300,
  (start, end) => Array.from({ length: end - start }, (_, index) => `<i>${start + index}</i>`).join(""),
  { batchSize: 50 },
);
const htmlAfterSync = (htmlTarget.innerHTML.match(/<i>/g) || []).length;
flushOneFrame();
const htmlAfterOneFrame = (htmlTarget.innerHTML.match(/<i>/g) || []).length;
flushAllFrames();

console.log(JSON.stringify({
  textAfterSync,
  textAfterOneFrame,
  textFinal: textTarget.textContent.length,
  resetFinal: resetTarget.textContent.length,
  resetEndsWith: resetTarget.textContent.endsWith("z".repeat(1000)),
  htmlAfterSync,
  htmlAfterOneFrame,
  htmlFinal: (htmlTarget.innerHTML.match(/<i>/g) || []).length,
}));
""".strip(),
        encoding="utf-8",
    )

    result = subprocess.run(
        ["node", str(tmp_path / "runner.mjs")],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
        timeout=10,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"Node runner failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )

    assert json.loads(result.stdout) == {
        "textAfterSync": 10000,
        "textAfterOneFrame": 20000,
        "textFinal": 70000,
        "resetFinal": 51000,
        "resetEndsWith": True,
        "htmlAfterSync": 50,
        "htmlAfterOneFrame": 100,
        "htmlFinal": 300,
    }


def _run_block_helper_script(tmp_path: Path, runner_source: str) -> dict[str, object]:
    repo_root = Path(__file__).resolve().parents[3]
    source_path = (
        repo_root
        / "frontend"
        / "dist"
        / "js"
        / "components"
        / "messageRenderer"
        / "helpers"
        / "block.js"
    )
    source = (
        source_path.read_text(encoding="utf-8")
        .replace("../../../core/state.js", "./mockState.mjs")
        .replace("../../../utils/i18n.js", "./mockI18n.mjs")
        .replace("./toolBlocks.js", "./mockToolBlocks.mjs")
        .replace("./content.js", "./mockContent.mjs")
        .replace("./prompt.js", "./mockPrompt.mjs")
        .replace("./progressiveText.js", "./progressiveText.mjs")
    )
    (tmp_path / "block.mjs").write_text(source, encoding="utf-8")
    (tmp_path / "mockState.mjs").write_text(
        """
export function getPrimaryRoleLabel() { return 'Main Agent'; }
export function isCoordinatorRoleId() { return false; }
export function isMainAgentRoleId() { return false; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockI18n.mjs").write_text(
        """
export function t(key) { return String(key || ''); }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockToolBlocks.mjs").write_text(
        """
export function applyToolReturn() {}
export function buildToolBlock() { return document.createElement('div'); }
export function indexPendingToolBlock() {}
export function resolvePendingToolBlock() { return null; }
export function setToolValidationFailureState() {}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockContent.mjs").write_text(
        """
export function appendStructuredContentPart() { return null; }
export function renderRichContent(targetEl, source) {
    globalThis.__richCalls.push(String(source || '').length);
    targetEl.replaceChildren(document.createTextNode(String(source || '')));
    return targetEl;
}
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "mockPrompt.mjs").write_text(
        """
export function appendPromptContentBlock() { return document.createElement('div'); }
export function normalizePromptContentPart(item) { return item; }
export function updatePromptContentBlock() { return null; }
""".strip(),
        encoding="utf-8",
    )
    (tmp_path / "progressiveText.mjs").write_text(
        (
            repo_root
            / "frontend"
            / "dist"
            / "js"
            / "components"
            / "messageRenderer"
            / "helpers"
            / "progressiveText.js"
        ).read_text(encoding="utf-8"),
        encoding="utf-8",
    )
    runner_path = tmp_path / "runner.mjs"
    runner_path.write_text(
        f"""
globalThis.__richCalls = [];
globalThis.Node = {{ TEXT_NODE: 3, ELEMENT_NODE: 1 }};
globalThis.__frames = [];
globalThis.performance = {{ now: () => 1000 }};
globalThis.window = {{
    requestAnimationFrame(callback) {{
        globalThis.__frames.push(callback);
        return globalThis.__frames.length;
    }},
}};

class FakeClassList {{
    constructor(owner) {{ this.owner = owner; }}
    add(...classes) {{
        const next = new Set(String(this.owner.className || '').split(/\\s+/).filter(Boolean));
        classes.forEach(cls => next.add(cls));
        this.owner.className = Array.from(next).join(' ');
    }}
    remove(...classes) {{
        const blocked = new Set(classes);
        this.owner.className = String(this.owner.className || '')
            .split(/\\s+/)
            .filter(cls => cls && !blocked.has(cls))
            .join(' ');
    }}
    contains(cls) {{
        return String(this.owner.className || '').split(/\\s+/).includes(cls);
    }}
}}

class FakeText {{
    constructor(text = '') {{
        this.nodeType = 3;
        this.textContent = String(text || '');
        this.parentNode = null;
    }}
    remove() {{
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode.childNodes = this.parentNode.children;
        this.parentNode = null;
    }}
}}

class FakeElement {{
    constructor(tagName = 'div') {{
        this.nodeType = 1;
        this.tagName = String(tagName || 'div').toUpperCase();
        this.children = [];
        this.childNodes = this.children;
        this.parentNode = null;
        this.dataset = {{}};
        this.className = '';
        this.classList = new FakeClassList(this);
        this.textContent = '';
    }}
    appendChild(node) {{
        node.parentNode = this;
        this.children.push(node);
        this.childNodes = this.children;
        syncTextContent(this);
        return node;
    }}
    replaceChildren(...nodes) {{
        this.children.forEach(child => {{ child.parentNode = null; }});
        this.children = [];
        this.childNodes = this.children;
        nodes.forEach(node => this.appendChild(node));
        syncTextContent(this);
    }}
    querySelector(selector) {{
        return this.querySelectorAll(selector)[0] || null;
    }}
    querySelectorAll(selector) {{
        const results = [];
        const className = String(selector || '').startsWith('.')
            ? String(selector).slice(1)
            : '';
        walk(this, node => {{
            if (node.nodeType === 1 && className && node.classList.contains(className)) {{
                results.push(node);
            }}
        }});
        return results;
    }}
    closest() {{ return null; }}
    setAttribute() {{}}
    remove() {{
        if (!this.parentNode) return;
        this.parentNode.children = this.parentNode.children.filter(child => child !== this);
        this.parentNode.childNodes = this.parentNode.children;
        this.parentNode = null;
    }}
}}

function walk(root, visit) {{
    (root.children || []).forEach(child => {{
        visit(child);
        if (child.nodeType === 1) walk(child, visit);
    }});
}}

function countTextNodes(root) {{
    let count = 0;
    walk(root, node => {{
        if (node.nodeType === 3 && String(node.textContent || '').length > 0) count += 1;
    }});
    return count;
}}

function syncTextContent(root) {{
    if (!root || root.nodeType !== 1) return;
    root.textContent = (root.children || []).map(child => {{
        if (child.nodeType === 3) return String(child.textContent || '');
        syncTextContent(child);
        return String(child.textContent || '');
    }}).join('');
}}

function flushFrames(limit = 1000) {{
    let count = 0;
    while (globalThis.__frames.length && count < limit) {{
        const frame = globalThis.__frames.shift();
        frame(1000 + count);
        count += 1;
    }}
}}

globalThis.document = {{
    createElement(tagName) {{ return new FakeElement(tagName); }},
    createTextNode(text) {{ return new FakeText(text); }},
}};

{runner_source}
""",
        encoding="utf-8",
    )
    result = subprocess.run(
        ["node", str(runner_path)],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
        timeout=10,
    )
    if result.returncode != 0:
        raise AssertionError(
            f"Node runner failed:\nSTDOUT:\n{result.stdout}\nSTDERR:\n{result.stderr}"
        )
    return json.loads(result.stdout)
