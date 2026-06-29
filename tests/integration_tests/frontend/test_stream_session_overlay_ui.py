# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import subprocess


def _write_transcript_grouping_module(temp_dir: Path) -> None:
    source = Path(
        "frontend/dist/js/components/messageRenderer/transcriptGrouping.js"
    ).read_text(encoding="utf-8")
    (temp_dir / "transcriptGrouping.js").write_text(
        source.replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )


def _write_stream_overlay_test_modules(temp_dir: Path, source: str) -> None:
    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId(runId) {
    return runId === "run-primary" ? "main-role" : "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function clearThinkingOpenStateForRun() {}
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
    return {
        wrapper: {
            dataset: {},
            querySelector() { return null; },
            closest() { return null; },
        },
        contentEl: {
            appendChild() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
        },
    };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateThinkingText() {}
export function updateMessageText() {}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "injectionMarker.js").write_text(
        """
export function injectionContentText(rawMessage) {
    return String(rawMessage?.content || '').trim();
}

export function renderInjectionMarker(container, rawMessage) {
    const marker = {
        dataset: {
            status: String(rawMessage?.status || 'applied'),
            injectionId: String(rawMessage?.injection_id || rawMessage?.message_id || ''),
        },
        className: 'message-inject-marker',
    };
    container.appendChild?.(marker);
    return marker;
}
""".strip(),
        encoding="utf-8",
    )


def _write_live_injection_test_modules(temp_dir: Path, source: str) -> None:
    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId(runId) {
    return runId === "run-primary" ? "main-role" : "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function makeElement(tagName = "div") {
  return {
    tagName,
    className: "",
    dataset: {},
    children: [],
    textContent: "",
    nextSibling: null,
    append(...items) {
      items.forEach(item => this.appendChild(item));
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    appendChild(child) {
      child.__parent = this;
      this.children.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === ".msg-content") return this.contentEl || null;
      if (selector === ".msg-role") return { textContent: "" };
      if (selector === ".tool-status") return { innerHTML: "" };
      return null;
    },
    querySelectorAll(selector) {
      if (selector !== ".tool-block") return [];
      return this.children.filter(child => child?.className === "tool-block");
    },
    remove() {
      const parent = this.__parent;
      if (!parent?.children) return;
      const index = parent.children.indexOf(this);
      if (index !== -1) parent.children.splice(index, 1);
    },
  };
}

export function applyToolReturn(block) {
  block.dataset.status = "completed";
}
export function appendStructuredContentPart(contentEl, part) {
  const el = makeElement("div");
  el.kind = part.kind || "structured";
  contentEl.appendChild(el);
  return el;
}
export function appendThinkingText(contentEl, text) {
  const el = makeElement("div");
  el.className = "thinking-block";
  el.textContent = text;
  contentEl.appendChild(el);
  return el;
}
export function buildPendingToolBlock(toolName, _args, toolCallId) {
  const block = makeElement("details");
  block.className = "tool-block";
  block.dataset.toolName = toolName;
  block.dataset.toolCallId = toolCallId || "";
  block.dataset.status = "running";
  return block;
}
export function findToolBlock(contentEl, toolName, toolCallId) {
  return contentEl.children.find(child => (
    child.className === "tool-block"
    && child.dataset.toolName === toolName
    && (!toolCallId || child.dataset.toolCallId === toolCallId)
  )) || null;
}
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock(pendingToolBlocks, toolBlock, toolName, toolCallId) {
  if (toolCallId) pendingToolBlocks[`${toolName}:${toolCallId}`] = toolBlock;
  pendingToolBlocks[`${toolName}:`] = [toolBlock];
}
export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const wrapper = makeElement("div");
  wrapper.kind = "message";
  wrapper.dataset = {
    runId: String(options.runId || ""),
    roleId: String(options.roleId || ""),
    instanceId: String(options.instanceId || ""),
    streamKey: String(options.streamKey || ""),
    label: String(label || ""),
  };
  const contentEl = makeElement("div");
  contentEl.className = "msg-content";
  wrapper.contentEl = contentEl;
  wrapper.appendChild(contentEl);
  container.appendChild(wrapper);
  return { wrapper, contentEl };
}
export function resolvePendingToolBlock(pendingToolBlocks, toolName, toolCallId) {
  return pendingToolBlocks[`${toolName}:${toolCallId || ""}`]?.[0]
    || pendingToolBlocks[`${toolName}:${toolCallId || ""}`]
    || null;
}
export function setToolStatus(block, status) { block.dataset.status = status; }
export function setToolValidationFailureState(block) { block.dataset.status = "validation_failed"; }
export function syncStreamingCursor() {}
export function updateThinkingText(el, text) { el.textContent += text; }
export function updateMessageText(el, text, options = {}) {
  if (options.appendDelta) el.textContent += text;
  else el.textContent = text;
}
""".strip(),
        encoding="utf-8",
    )


def _write_mock_message_actions(temp_dir: Path) -> None:
    (temp_dir / "mockMessageActions.mjs").write_text(
        """
export function syncLastAnswerCopyButton() {
    return undefined;
}
""".strip(),
        encoding="utf-8",
    )


def test_history_overlay_renders_live_cursor_placeholder_for_stream_tail(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/history.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "history_overlay"
    temp_dir.mkdir()

    (temp_dir / "history.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("./messageActions.js", "./mockMessageActions.mjs"),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    _write_mock_message_actions(temp_dir)
    (temp_dir / "mockState.mjs").write_text(
        """
export function isRunPrimaryRoleId(roleId, runId) {
    return roleId === "external-role" && runId === "run-1";
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(key, values = {}) {
    return `${key}:${JSON.stringify(values)}`;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function createContentEl() {
  return {
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

export function applyToolReturn() {}
export function appendStructuredContentPart() { return null; }
export function appendThinkingText() {}
export function buildToolBlock() {
  return { dataset: {}, querySelector() { return null; } };
}
export function decoratePendingApprovalBlock() {}
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function labelFromRole(_role, roleId, instanceId) {
  return roleId || instanceId || "Agent";
}
export function parseApprovalArgsPreview() { return {}; }
export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const contentEl = createContentEl();
  const wrapper = {
    dataset: {
      runId: String(options.runId || ""),
      roleId: String(options.roleId || ""),
      instanceId: String(options.instanceId || ""),
      streamKey: String(options.streamKey || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-role") {
        return { textContent: String(label || "").toUpperCase() };
      }
      if (selector === ".msg-content") {
        return contentEl;
      }
      return null;
    },
  };
  container.messages.push(wrapper);
  return { wrapper, contentEl };
}
export function renderParts() {}
export function resolvePendingToolBlock() { return null; }
export function forceScrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}

export function appendMessageText(contentEl, text, options = {}) {
  globalThis.__appendCalls.push({
    text,
    streaming: options.streaming === true,
  });
  const block = {
    type: "msg-text",
    text,
    streaming: options.streaming === true,
  };
  contentEl.appendChild(block);
  return block;
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import { renderHistoricalMessageList } from "./history.js";

globalThis.__appendCalls = [];

const container = {
  dataset: {},
  messages: [],
  appendChild(child) {
    this.messages.push(child);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(container, [], {
  runId: "run-1",
  pendingToolApprovals: [],
  streamOverlayEntry: {
    roleId: "external-role",
    instanceId: "external-instance",
    label: "External ACP",
    parts: [],
    textStreaming: true,
  },
});

const duplicateContainer = {
  dataset: {},
  messages: [],
  appendChild(child) {
    this.messages.push(child);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(duplicateContainer, [{
  role: "assistant",
  role_id: "external-role",
  instance_id: "external-instance",
  message: {
    parts: [{ part_kind: "text", content: "already persisted" }],
  },
}], {
  runId: "run-1",
  pendingToolApprovals: [],
  streamOverlayEntry: {
    roleId: "external-role",
    instanceId: "external-instance",
    streamKey: "primary",
    label: "External ACP",
    parts: [{ kind: "text", content: "already persisted" }],
    textStreaming: true,
  },
});

console.log(JSON.stringify(globalThis.__appendCalls));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload == [
        {"text": "", "streaming": True},
        {"text": "", "streaming": True},
    ]


def test_history_overlay_renders_live_cursor_placeholder_for_idle_gap(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/history.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "history_overlay_idle_gap"
    temp_dir.mkdir()

    (temp_dir / "history.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("./messageActions.js", "./mockMessageActions.mjs"),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    _write_mock_message_actions(temp_dir)
    (temp_dir / "mockState.mjs").write_text(
        """
export function isRunPrimaryRoleId(roleId, runId) {
    return roleId === "external-role" && runId === "run-1";
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(key, values = {}) {
    return `${key}:${JSON.stringify(values)}`;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function createContentEl() {
  return {
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

export function applyToolReturn() {}
export function appendStructuredContentPart() { return null; }
export function appendThinkingText() {}
export function buildToolBlock() {
  return { dataset: {}, querySelector() { return null; } };
}
export function decoratePendingApprovalBlock() {}
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function labelFromRole(_role, roleId, instanceId) {
  return roleId || instanceId || "Agent";
}
export function parseApprovalArgsPreview() { return {}; }
export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const contentEl = createContentEl();
  const wrapper = {
    dataset: {
      runId: String(options.runId || ""),
      roleId: String(options.roleId || ""),
      instanceId: String(options.instanceId || ""),
      streamKey: String(options.streamKey || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-role") {
        return { textContent: String(label || "").toUpperCase() };
      }
      if (selector === ".msg-content") {
        return contentEl;
      }
      return null;
    },
  };
  container.messages.push(wrapper);
  return { wrapper, contentEl };
}
export function renderParts() {}
export function resolvePendingToolBlock() { return null; }
export function forceScrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}

export function appendMessageText(contentEl, text, options = {}) {
  globalThis.__appendCalls.push({
    text,
    streaming: options.streaming === true,
  });
  const block = {
    type: "msg-text",
    text,
    streaming: options.streaming === true,
  };
  contentEl.appendChild(block);
  return block;
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import { renderHistoricalMessageList } from "./history.js";

globalThis.__appendCalls = [];

const container = {
  dataset: {},
  messages: [],
  appendChild(child) {
    this.messages.push(child);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(container, [], {
  runId: "run-1",
  pendingToolApprovals: [],
  streamOverlayEntry: {
    roleId: "external-role",
    instanceId: "external-instance",
    label: "External ACP",
    parts: [],
    textStreaming: false,
    idleCursor: true,
  },
});

console.log(JSON.stringify(globalThis.__appendCalls));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload == [{"text": "", "streaming": True}]


def test_history_overlay_does_not_replay_parts_already_persisted_in_history(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/history.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "history_overlay_dedupe"
    temp_dir.mkdir()

    (temp_dir / "history.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("./messageActions.js", "./mockMessageActions.mjs"),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    _write_mock_message_actions(temp_dir)
    (temp_dir / "mockState.mjs").write_text(
        """
export function isRunPrimaryRoleId() {
    return true;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(key, values = {}) {
    return `${key}:${JSON.stringify(values)}`;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText(contentEl, text, options = {}) {
  contentEl.children.push({
    type: "thinking",
    text,
    streaming: options.streaming === true,
  });
  return { closest() { return null; } };
}
export function buildToolBlock(toolName, args, toolCallId) {
  return { type: "tool", toolName, args, toolCallId, dataset: {}, querySelector() { return null; } };
}
export function decoratePendingApprovalBlock() {}
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function labelFromRole(_role, roleId) { return roleId || "Agent"; }
export function parseApprovalArgsPreview() { return {}; }
export function renderMessageBlock(container, role, label, _parts = [], options = {}) {
  const contentEl = {
    children: [],
    childNodes: [],
    appendChild(child) { this.children.push(child); this.childNodes.push(child); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const wrapper = {
    dataset: {
      createdAt: String(options.createdAt || ""),
      runId: String(options.runId || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-content") return contentEl;
      return null;
    },
    querySelectorAll() { return []; },
  };
  container.messages.push({ wrapper, contentEl, role, label });
  return { wrapper, contentEl };
}
export function renderParts(contentEl, parts) {
  contentEl.children.push({ type: "history-parts", parts });
}
export function resolvePendingToolBlock() { return null; }
export function forceScrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function appendMessageText(contentEl, text, options = {}) {
  contentEl.children.push({ type: "text", text, streaming: options.streaming === true });
  return { closest() { return null; } };
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import { renderHistoricalMessageList } from "./history.js";

const container = {
  dataset: {},
  messages: [],
  appendChild() {},
  querySelectorAll() {
    return this.messages.map(item => item.wrapper);
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(container, [
  {
    role: "assistant",
    role_id: "Main Agent",
    instance_id: "primary",
    created_at: "2026-04-25T12:00:00",
    message: {
      parts: [
        { part_kind: "thinking", content: "same thought" },
        { part_kind: "tool-call", tool_name: "shell", tool_call_id: "call-1", args: { command: "date" } },
        { part_kind: "tool-return", tool_name: "shell", tool_call_id: "call-1", result: { ok: true } },
        { part_kind: "text", content: "done" },
      ],
    },
  },
], {
  runId: "run-1",
  streamOverlayEntry: {
    roleId: "Main Agent",
    instanceId: "primary",
    label: "Main Agent",
    parts: [
      { kind: "thinking", content: "same thought", finished: true, part_index: 0 },
      { kind: "tool", tool_name: "shell", tool_call_id: "call-1", args: { command: "date" }, status: "completed", result: { ok: true } },
      { kind: "text", content: "done" },
    ],
    textStreaming: true,
    idleCursor: true,
  },
  isLatestRound: true,
  runStatus: "running",
});

const tailContainer = {
  dataset: {},
  messages: [],
  appendChild() {},
  querySelectorAll() {
    return this.messages.map(item => item.wrapper);
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(tailContainer, [
  {
    role: "assistant",
    role_id: "Main Agent",
    instance_id: "primary",
    created_at: "2026-04-25T12:00:00",
    message: {
      parts: [{ part_kind: "text", content: "done" }],
    },
  },
  {
    role: "assistant",
    role_id: "Main Agent",
    instance_id: "primary",
    created_at: "2026-04-25T12:00:01",
    message: {
      parts: [{ part_kind: "text", content: "different tail" }],
    },
  },
], {
  runId: "run-1",
  streamOverlayEntry: {
    roleId: "Main Agent",
    instanceId: "primary",
    label: "Main Agent",
    parts: [{ kind: "text", content: "done" }],
    textStreaming: true,
  },
  isLatestRound: true,
  runStatus: "running",
});

const repeatedContainer = {
  dataset: {},
  messages: [],
  appendChild() {},
  querySelectorAll() {
    return this.messages.map(item => item.wrapper);
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(repeatedContainer, [
  {
    role: "assistant",
    role_id: "Main Agent",
    instance_id: "primary",
    created_at: "2026-04-25T12:00:00",
    message: {
      parts: [{ part_kind: "text", content: "repeat" }],
    },
  },
], {
  runId: "run-1",
  streamOverlayEntry: {
    roleId: "Main Agent",
    instanceId: "primary",
    label: "Main Agent",
    parts: [
      { kind: "text", content: "repeat" },
      { kind: "tool", tool_name: "shell", tool_call_id: "call-repeat", args: { command: "date" }, status: "pending" },
      { kind: "text", content: "repeat" },
    ],
    textStreaming: true,
  },
  isLatestRound: true,
  runStatus: "running",
});

const terminalContainer = {
  dataset: {},
  messages: [],
  appendChild() {},
  querySelectorAll() {
    return this.messages.map(item => item.wrapper);
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(terminalContainer, [
  {
    role: "assistant",
    role_id: "Main Agent",
    instance_id: "primary",
    created_at: "2026-04-25T12:00:00",
    message: {
      parts: [{ part_kind: "text", content: "persisted" }],
    },
  },
], {
  runId: "run-1",
  streamOverlayEntry: {
    roleId: "Main Agent",
    instanceId: "primary",
    label: "Main Agent",
    parts: [
      { kind: "thinking", content: "late thought", finished: false, part_index: 0 },
      { kind: "text", content: "late chunk" },
    ],
    textStreaming: true,
    idleCursor: true,
  },
  isLatestRound: true,
  runStatus: "completed",
});

console.log(JSON.stringify({
  wrapperCount: container.messages.length,
  children: container.messages[0].contentEl.children,
  tailChildren: tailContainer.messages[1].contentEl.children,
  repeatedChildren: repeatedContainer.messages[1].contentEl.children,
  terminalMessageCount: terminalContainer.messages.length,
  terminalChildren: terminalContainer.messages[terminalContainer.messages.length - 1].contentEl.children,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["wrapperCount"] == 1
    assert payload["children"] == [
        {
            "type": "history-parts",
            "parts": [
                {"part_kind": "thinking", "content": "same thought"},
                {
                    "part_kind": "tool-call",
                    "tool_name": "shell",
                    "tool_call_id": "call-1",
                    "args": {"command": "date"},
                },
                {
                    "part_kind": "tool-return",
                    "tool_name": "shell",
                    "tool_call_id": "call-1",
                    "result": {"ok": True},
                },
                {"part_kind": "text", "content": "done"},
            ],
        },
        {"type": "text", "text": "", "streaming": True},
    ]
    assert payload["tailChildren"] == [
        {
            "type": "history-parts",
            "parts": [{"part_kind": "text", "content": "different tail"}],
        },
        {"type": "text", "text": "", "streaming": True},
    ]
    assert payload["repeatedChildren"] == [
        {
            "type": "tool",
            "toolName": "shell",
            "args": {"command": "date"},
            "toolCallId": "call-repeat",
            "dataset": {},
        },
        {"type": "text", "text": "repeat", "streaming": True},
    ]
    assert payload["terminalMessageCount"] == 2
    assert payload["terminalChildren"] == [
        {"type": "thinking", "text": "late thought", "streaming": False},
        {"type": "text", "text": "late chunk", "streaming": False},
    ]


def test_history_overlay_renders_media_refs_from_stream_overlay(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/history.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "history_overlay_media_ref"
    temp_dir.mkdir()

    (temp_dir / "history.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("./messageActions.js", "./mockMessageActions.mjs"),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    _write_mock_message_actions(temp_dir)
    (temp_dir / "mockState.mjs").write_text(
        """
export function isRunPrimaryRoleId(roleId, runId) {
    return roleId === "external-role" && runId === "run-1";
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(key, values = {}) {
    return `${key}:${JSON.stringify(values)}`;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function createContentEl() {
  return {
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

export function applyToolReturn() {}
export function appendStructuredContentPart(contentEl, part) {
  globalThis.__structuredCalls.push(part);
  const block = {
    type: "structured",
    part,
  };
  contentEl.appendChild(block);
  return block;
}
export function appendThinkingText() {}
export function buildToolBlock() {
  return { dataset: {}, querySelector() { return null; } };
}
export function decoratePendingApprovalBlock() {}
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function labelFromRole(_role, roleId, instanceId) {
  return roleId || instanceId || "Agent";
}
export function parseApprovalArgsPreview() { return {}; }
export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const contentEl = createContentEl();
  const wrapper = {
    dataset: {
      runId: String(options.runId || ""),
      roleId: String(options.roleId || ""),
      instanceId: String(options.instanceId || ""),
      streamKey: String(options.streamKey || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-role") {
        return { textContent: String(label || "").toUpperCase() };
      }
      if (selector === ".msg-content") {
        return contentEl;
      }
      return null;
    },
  };
  container.messages.push({ wrapper, contentEl });
  return { wrapper, contentEl };
}
export function renderParts() {}
export function resolvePendingToolBlock() { return null; }
export function forceScrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function appendMessageText(contentEl, text, options = {}) {
  const block = {
    type: "msg-text",
    text,
    streaming: options.streaming === true,
  };
  contentEl.appendChild(block);
  return block;
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import { renderHistoricalMessageList } from "./history.js";

globalThis.__structuredCalls = [];

const container = {
  dataset: {},
  messages: [],
  appendChild(child) {
    this.messages.push(child);
  },
  querySelectorAll() {
    return [];
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(container, [], {
  runId: "run-1",
  pendingToolApprovals: [],
  streamOverlayEntry: {
    roleId: "external-role",
    instanceId: "external-instance",
    label: "External ACP",
    parts: [
      {
        kind: "media_ref",
        modality: "image",
        mime_type: "image/png",
        url: "data:image/png;base64,AAA",
        name: "image.png",
      },
    ],
    textStreaming: false,
  },
});

console.log(JSON.stringify({
  structuredCalls: globalThis.__structuredCalls,
  wrapperCount: container.messages.length,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload == {
        "structuredCalls": [
            {
                "kind": "media_ref",
                "modality": "image",
                "mime_type": "image/png",
                "url": "data:image/png;base64,AAA",
                "name": "image.png",
            }
        ],
        "wrapperCount": 1,
    }


def test_history_overlay_can_render_as_separate_live_message(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/history.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "history_overlay_separate"
    temp_dir.mkdir()

    (temp_dir / "history.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("./messageActions.js", "./mockMessageActions.mjs"),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    _write_mock_message_actions(temp_dir)
    (temp_dir / "mockState.mjs").write_text(
        """
export function isRunPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(key, values = {}) {
    return `${key}:${JSON.stringify(values)}`;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function createContentEl(wrapperId) {
  return {
    wrapperId,
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

export function applyToolReturn() {}
export function appendStructuredContentPart() { return null; }
export function appendThinkingText(contentEl, text, options = {}) {
  contentEl.children.push({
    type: "thinking",
    text,
    streaming: options.streaming === true,
  });
}
export function buildToolBlock() {
  return { dataset: {}, querySelector() { return null; } };
}
export function decoratePendingApprovalBlock() {}
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function labelFromRole(_role, roleId, instanceId) {
  return roleId || instanceId || "Agent";
}
export function parseApprovalArgsPreview() { return {}; }
export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const wrapperId = `wrapper-${container.messages.length + 1}`;
  const contentEl = createContentEl(wrapperId);
  const wrapper = {
    id: wrapperId,
    dataset: {
      runId: String(options.runId || ""),
      roleId: String(options.roleId || ""),
      instanceId: String(options.instanceId || ""),
      streamKey: String(options.streamKey || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-role") {
        return { textContent: String(label || "").toUpperCase() };
      }
      if (selector === ".msg-content") {
        return contentEl;
      }
      return null;
    },
  };
  container.messages.push({ wrapper, contentEl });
  return { wrapper, contentEl };
}
export function renderParts(contentEl, parts) {
  contentEl.children.push({
    type: "history-parts",
    parts,
  });
}
export function resolvePendingToolBlock() { return null; }
export function forceScrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function appendMessageText(contentEl, text, options = {}) {
  contentEl.children.push({
    type: "text",
    text,
    streaming: options.streaming === true,
  });
  return {
    closest() { return null; },
  };
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import { renderHistoricalMessageList } from "./history.js";

const container = {
  dataset: {},
  messages: [],
  appendChild() {},
  querySelectorAll() {
    return this.messages.map(item => item.wrapper);
  },
  querySelector() {
    return null;
  },
};

renderHistoricalMessageList(container, [
  {
    role: "assistant",
    role_id: "Writer",
    instance_id: "inst-1",
    message: {
      parts: [{ part_kind: "text", content: "persisted" }],
    },
  },
], {
  runId: "subagent_run_1",
  streamOverlayEntry: {
    roleId: "Writer",
    instanceId: "inst-1",
    label: "Writer",
    parts: [{ kind: "thinking", content: "live thought", finished: false, part_index: 0, _key: "0:0" }],
    textStreaming: true,
  },
  separateOverlayMessage: true,
});

console.log(JSON.stringify({
  wrapperCount: container.messages.length,
  firstWrapperChildren: container.messages[0].contentEl.children,
  secondWrapperChildren: container.messages[1].contentEl.children,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["wrapperCount"] == 2
    assert payload["firstWrapperChildren"] == [
        {
            "type": "history-parts",
            "parts": [{"part_kind": "text", "content": "persisted"}],
        }
    ]
    assert payload["secondWrapperChildren"] == [
        {
            "type": "thinking",
            "text": "live thought",
            "streaming": True,
        },
        {
            "type": "text",
            "text": "",
            "streaming": True,
        },
    ]


def test_finalize_stream_preserves_unpersisted_overlay_without_live_state(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_finalize_overlay"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
    return {
        wrapper: {
            dataset: {},
            querySelector() { return null; },
            closest() { return null; },
        },
        contentEl: {
            appendChild() {},
            querySelector() { return null; },
            querySelectorAll() { return []; },
        },
    };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateThinkingText() {}
export function updateMessageText() {}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)

    runner = """
import {
  applyStreamOverlayEvent,
  finalizeStream,
  getRunStreamOverlaySnapshot,
} from "./stream.js";

applyStreamOverlayEvent(
  "text_delta",
  { text: "stale overlay" },
  {
    runId: "subagent_run_1",
    instanceId: "inst-sub-1",
    roleId: "Crafter",
    label: "Crafter",
  },
);

const before = getRunStreamOverlaySnapshot("subagent_run_1");
finalizeStream("inst-sub-1", "Crafter", { runId: "subagent_run_1" });
const after = getRunStreamOverlaySnapshot("subagent_run_1");

console.log(JSON.stringify({ before, after }));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["before"]["byInstance"] == {
        "inst-sub-1": {
            "instanceId": "inst-sub-1",
            "roleId": "Crafter",
            "streamKey": "inst-sub-1",
            "label": "Crafter",
            "parts": [{"kind": "text", "content": "stale overlay"}],
            "textStreaming": True,
            "idleCursor": False,
        }
    }
    assert payload["after"]["byInstance"] == {
        "inst-sub-1": {
            "instanceId": "inst-sub-1",
            "roleId": "Crafter",
            "streamKey": "inst-sub-1",
            "label": "Crafter",
            "parts": [{"kind": "text", "content": "stale overlay"}],
            "textStreaming": False,
            "idleCursor": False,
        }
    }


def test_finalize_stream_turns_off_streaming_cursor_for_live_subagent_text(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_finalize_cursor"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
    return {
        wrapper: {
            dataset: {},
            querySelector() { return null; },
            closest() { return null; },
        },
        contentEl: {
            childNodes: [],
            appendChild(child) { this.childNodes.push(child); },
            querySelector() { return null; },
            querySelectorAll() { return []; },
        },
    };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor(_textEl, active) {
    globalThis.__cursorStates.push(active === true);
}
export function updateThinkingText() {}
export function updateMessageText(_textEl, text, options = {}) {
    globalThis.__textUpdates.push({
        text: String(text || ""),
        streaming: options.streaming === true,
    });
    syncStreamingCursor(_textEl, options.streaming === true);
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)

    runner = """
globalThis.__textUpdates = [];
globalThis.__cursorStates = [];
globalThis.document = {
  createElement() {
    return {
      className: "",
      childNodes: [],
      appendChild(child) { this.childNodes.push(child); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
    };
  },
};

import {
  appendStreamChunk,
  finalizeStream,
  getOrCreateStreamBlock,
} from "./stream.js";

const container = {
  appendChild() {},
  querySelectorAll() { return []; },
};

getOrCreateStreamBlock(
  container,
  "inst-sub-1",
  "Crafter",
  "Crafter",
  "subagent_run_1",
);
appendStreamChunk(
  "inst-sub-1",
  "50159495496",
  "subagent_run_1",
  "Crafter",
  "Crafter",
);
finalizeStream("inst-sub-1", "Crafter", { runId: "subagent_run_1" });

console.log(JSON.stringify({
  textUpdates: globalThis.__textUpdates,
  cursorStates: globalThis.__cursorStates,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["textUpdates"] == [
        {"text": "50159495496", "streaming": True},
        {"text": "50159495496", "streaming": False},
    ]
    assert payload["cursorStates"] == [True, False]


def test_tool_result_materializes_overlay_tool_block_into_visible_container(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_tool_result_materialize"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function toolMatches(block, toolName, toolCallId) {
  const safeToolCallId = String(toolCallId || "");
  if (safeToolCallId) {
    return String(block?.dataset?.toolCallId || "") === safeToolCallId;
  }
  return String(block?.dataset?.toolName || "") === String(toolName || "");
}

function findInContent(contentEl, toolName, toolCallId) {
  if (!contentEl || !Array.isArray(contentEl.children)) {
    return null;
  }
  for (let index = contentEl.children.length - 1; index >= 0; index -= 1) {
    const child = contentEl.children[index];
    if (toolMatches(child, toolName, toolCallId)) {
      return child;
    }
  }
  return null;
}

export function applyToolReturn(toolBlock, content) {
  toolBlock.__result = content;
}

export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }

export function buildPendingToolBlock(toolName, args, toolCallId = null) {
  const outputEl = { classList: { add() {}, remove() {} }, innerHTML: "", textContent: "" };
  return {
    dataset: {
      toolName: String(toolName || ""),
      toolCallId: String(toolCallId || ""),
      status: "running",
    },
    __args: args || {},
    __result: null,
    querySelector(selector) {
      if (selector === ".tool-output") {
        return outputEl;
      }
      return null;
    },
    closest() { return null; },
  };
}

export function findToolBlock(contentEl, toolName, toolCallId) {
  return findInContent(contentEl, toolName, toolCallId);
}

export function findToolBlockInContainer(container, toolName, toolCallId) {
  const messages = Array.isArray(container?.__messages) ? container.__messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const found = findInContent(messages[index].contentEl, toolName, toolCallId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function indexPendingToolBlock(pendingToolBlocks, toolBlock, toolName, toolCallId) {
  const key = `${toolName || ""}::${toolCallId || ""}`;
  pendingToolBlocks[key] = toolBlock;
  if (toolName) {
    pendingToolBlocks[`${toolName}::`] = toolBlock;
  }
}

export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const contentEl = {
    children: [],
    appendChild(child) {
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
  const wrapper = {
    dataset: {
      runId: String(options.runId || ""),
      roleId: String(options.roleId || ""),
      instanceId: String(options.instanceId || ""),
      streamKey: String(options.streamKey || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-role") {
        return { textContent: String(label || "").toUpperCase() };
      }
      if (selector === ".msg-content") {
        return contentEl;
      }
      return null;
    },
    closest() { return null; },
  };
  container.__messages.push({ wrapper, contentEl });
  return { wrapper, contentEl };
}

export function resolvePendingToolBlock(pendingToolBlocks, toolName, toolCallId) {
  const byId = pendingToolBlocks[`${toolName || ""}::${toolCallId || ""}`];
  if (byId) {
    return byId;
  }
  return pendingToolBlocks[`${toolName || ""}::`] || null;
}

export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateThinkingText() {}
export function updateMessageText() {}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import {
  applyStreamOverlayEvent,
  getRunStreamOverlaySnapshot,
  updateToolResult,
} from "./stream.js";

globalThis.document = {
  createElement() {
    return {
      className: "",
      dataset: {},
      children: [],
      appendChild(child) { this.children.push(child); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
    };
  },
};

const container = {
  __messages: [],
  querySelectorAll() {
    return this.__messages.map(item => item.wrapper);
  },
};

applyStreamOverlayEvent(
  "tool_call",
  {
    tool_name: "shell",
    tool_call_id: "call-1",
    args: { command: "echo hi" },
  },
  {
    runId: "run-1",
    instanceId: "inst-1",
    roleId: "Writer",
    label: "Writer",
  },
);

updateToolResult(
  "inst-1",
  "shell",
  {
    ok: true,
    data: { text: "done" },
  },
  false,
  "call-1",
  {
    runId: "run-1",
    roleId: "Writer",
    label: "Writer",
    container,
  },
);

const snapshot = getRunStreamOverlaySnapshot("run-1");
const block = container.__messages[0].contentEl.children[0];

console.log(JSON.stringify({
  messageCount: container.__messages.length,
  blockArgs: block.__args,
  blockResult: block.__result,
  overlay: snapshot.byInstance["inst-1"],
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["messageCount"] == 1
    assert payload["blockArgs"] == {"command": "echo hi"}
    assert payload["blockResult"] == {"ok": True, "data": {"text": "done"}}
    assert payload["overlay"] == {
        "instanceId": "inst-1",
        "roleId": "Writer",
        "streamKey": "inst-1",
        "label": "Writer",
        "parts": [
            {
                "kind": "tool",
                "tool_call_id": "call-1",
                "tool_name": "shell",
                "args": {"command": "echo hi"},
                "status": "completed",
                "result": {"ok": True, "data": {"text": "done"}},
            }
        ],
        "textStreaming": False,
        "idleCursor": True,
    }


def test_tool_result_event_synthesizes_overlay_part_without_prior_tool_call(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_tool_result_overlay_only"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
  return {
    wrapper: {
      dataset: {},
      querySelector() { return null; },
      closest() { return null; },
    },
    contentEl: {
      appendChild() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateThinkingText() {}
export function updateMessageText() {}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import {
  applyStreamOverlayEvent,
  getRunStreamOverlaySnapshot,
} from "./stream.js";

applyStreamOverlayEvent(
  "tool_result",
  {
    tool_name: "read",
    tool_call_id: "call-9",
    result: {
      ok: false,
      error: { message: "boom" },
    },
  },
  {
    runId: "run-2",
    instanceId: "inst-2",
    roleId: "Researcher",
    label: "Researcher",
  },
);

console.log(JSON.stringify(getRunStreamOverlaySnapshot("run-2")));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload == {
        "coordinator": None,
        "byInstance": {
            "inst-2": {
                "instanceId": "inst-2",
                "roleId": "Researcher",
                "streamKey": "inst-2",
                "label": "Researcher",
                "parts": [
                    {
                        "kind": "tool",
                        "tool_call_id": "call-9",
                        "tool_name": "read",
                        "args": {},
                        "status": "error",
                        "result": {
                            "ok": False,
                            "error": {"message": "boom"},
                        },
                    }
                ],
                "textStreaming": False,
                "idleCursor": True,
            }
        },
    }


def test_overlay_snapshot_preserves_idle_cursor_state(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_idle_cursor_snapshot"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
  return {
    wrapper: {
      dataset: {},
      querySelector() { return null; },
      closest() { return null; },
    },
    contentEl: {
      appendChild() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateThinkingText() {}
export function updateMessageText() {}
""".strip(),
        encoding="utf-8",
    )

    runner = """
import {
  applyStreamOverlayEvent,
  getRunStreamOverlaySnapshot,
} from "./stream.js";

applyStreamOverlayEvent(
  "thinking_finished",
  { part_index: 0 },
  {
    runId: "run-3",
    instanceId: "inst-3",
    roleId: "Writer",
    label: "Writer",
  },
);

console.log(JSON.stringify(getRunStreamOverlaySnapshot("run-3")));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload == {
        "coordinator": None,
        "byInstance": {
            "inst-3": {
                "instanceId": "inst-3",
                "roleId": "Writer",
                "streamKey": "inst-3",
                "label": "Writer",
                "parts": [],
                "textStreaming": False,
                "idleCursor": True,
            }
        },
    }


def test_finalize_thinking_restores_idle_streaming_cursor_until_finalize(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_idle_cursor_after_thinking"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
  return {
    wrapper: {
      dataset: {},
      querySelector() { return null; },
      closest() { return null; },
    },
    contentEl: {
      children: [],
      appendChild(child) { this.children.push(child); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
    },
  };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor(_textEl, active) {
  globalThis.__cursorStates.push(active === true);
}
export function updateMessageText(_textEl, text, options = {}) {
  globalThis.__messageUpdates.push({
    text: String(text || ""),
    streaming: options.streaming === true,
  });
  syncStreamingCursor(_textEl, options.streaming === true);
}
export function appendThinkingText(contentEl, _text, options = {}) {
  const thinkingBlock = {
    dataset: {},
    open: true,
    querySelector() {
      return { style: {} };
    },
  };
  const textEl = {
    __partIndex: String(options.partIndex || ""),
    closest() {
      return thinkingBlock;
    },
  };
  contentEl.appendChild(textEl);
  return textEl;
}
export function updateThinkingText(_textEl, text, options = {}) {
  globalThis.__thinkingUpdates.push({
    text: String(text || ""),
    streaming: options.streaming === true,
  });
}
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.__cursorStates = [];
globalThis.__messageUpdates = [];
globalThis.__thinkingUpdates = [];
globalThis.document = {
  createElement() {
    return {
      className: "",
      childNodes: [],
      appendChild(child) { this.childNodes.push(child); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      remove() { this.__removed = true; },
    };
  },
};

import {
  appendThinkingChunk,
  finalizeStream,
  finalizeThinking,
  getOrCreateStreamBlock,
  startThinkingBlock,
} from "./stream.js";

const container = {
  appendChild() {},
  querySelectorAll() { return []; },
};

getOrCreateStreamBlock(container, "inst-1", "Crafter", "Crafter", "run-1");
startThinkingBlock("inst-1", 0, {
  container,
  runId: "run-1",
  roleId: "Crafter",
  label: "Crafter",
});
appendThinkingChunk("inst-1", 0, "working", {
  container,
  runId: "run-1",
  roleId: "Crafter",
  label: "Crafter",
});
finalizeThinking("inst-1", 0, { runId: "run-1", roleId: "Crafter" });
const beforeFinalize = globalThis.__cursorStates.slice();
finalizeStream("inst-1", "Crafter", { runId: "run-1" });

console.log(JSON.stringify({
  thinkingUpdates: globalThis.__thinkingUpdates,
  messageUpdates: globalThis.__messageUpdates,
  cursorStates: globalThis.__cursorStates,
  beforeFinalize,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["thinkingUpdates"] == [
        {"text": "working", "streaming": True},
        {"text": "working", "streaming": False},
        {"text": "working", "streaming": False},
    ]
    assert payload["messageUpdates"] == [{"text": "", "streaming": True}]
    assert payload["beforeFinalize"] == [True]
    assert payload["cursorStates"] == [True, False]


def test_tool_result_restores_idle_streaming_cursor_until_next_segment(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_idle_cursor_after_tool"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function scrollBottom() {}

export function buildPendingToolBlock(toolName, args, toolCallId = null) {
  return {
    dataset: {
      toolName: String(toolName || ""),
      toolCallId: String(toolCallId || ""),
    },
    __args: args || {},
    __result: null,
    querySelector() { return null; },
    closest() { return null; },
  };
}

export function applyToolReturn(toolBlock, content) {
  toolBlock.__result = content;
}

export function findToolBlock(contentEl, toolName, toolCallId) {
  return contentEl.children.find(child =>
    String(child?.dataset?.toolName || "") === String(toolName || "")
      && String(child?.dataset?.toolCallId || "") === String(toolCallId || "")
  ) || null;
}

export function findToolBlockInContainer(container, toolName, toolCallId) {
  return container.__messages
    .flatMap(item => item.contentEl.children)
    .find(child =>
      String(child?.dataset?.toolName || "") === String(toolName || "")
        && String(child?.dataset?.toolCallId || "") === String(toolCallId || "")
    ) || null;
}

export function indexPendingToolBlock(pendingToolBlocks, toolBlock, toolName, toolCallId) {
  pendingToolBlocks[`${toolName || ""}::${toolCallId || ""}`] = toolBlock;
  pendingToolBlocks[`${toolName || ""}::`] = toolBlock;
}

export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const contentEl = {
    children: [],
    appendChild(child) { this.children.push(child); },
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };
  const wrapper = {
    dataset: {
      runId: String(options.runId || ""),
      roleId: String(options.roleId || ""),
      instanceId: String(options.instanceId || ""),
      streamKey: String(options.streamKey || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-role") return { textContent: String(label || "").toUpperCase() };
      if (selector === ".msg-content") return contentEl;
      return null;
    },
    closest() { return null; },
  };
  container.__messages.push({ wrapper, contentEl });
  return { wrapper, contentEl };
}

export function resolvePendingToolBlock(pendingToolBlocks, toolName, toolCallId) {
  return pendingToolBlocks[`${toolName || ""}::${toolCallId || ""}`]
    || pendingToolBlocks[`${toolName || ""}::`]
    || null;
}

export function syncStreamingCursor(_textEl, active) {
  globalThis.__cursorStates.push(active === true);
}

export function updateMessageText(_textEl, text, options = {}) {
  globalThis.__messageUpdates.push({
    text: String(text || ""),
    streaming: options.streaming === true,
  });
  syncStreamingCursor(_textEl, options.streaming === true);
}

export function updateThinkingText() {}
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.__cursorStates = [];
globalThis.__messageUpdates = [];
globalThis.document = {
  createElement() {
    return {
      className: "",
      childNodes: [],
      appendChild(child) { this.childNodes.push(child); },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      remove() { this.__removed = true; },
    };
  },
};

import {
  appendToolCallBlock,
  getOrCreateStreamBlock,
  startThinkingBlock,
  updateToolResult,
} from "./stream.js";

const container = {
  __messages: [],
  appendChild() {},
  querySelectorAll() { return this.__messages.map(item => item.wrapper); },
};

getOrCreateStreamBlock(container, "inst-2", "Crafter", "Crafter", "run-2");
appendToolCallBlock(container, "inst-2", "shell", { command: "echo ok" }, "call-1", {
  runId: "run-2",
  roleId: "Crafter",
  label: "Crafter",
});
updateToolResult("inst-2", "shell", { ok: true, data: "ok" }, false, "call-1", {
  runId: "run-2",
  roleId: "Crafter",
  label: "Crafter",
  container,
});
const afterToolResult = globalThis.__cursorStates.slice();
startThinkingBlock("inst-2", 1, {
  container,
  runId: "run-2",
  roleId: "Crafter",
  label: "Crafter",
});

console.log(JSON.stringify({
  messageUpdates: globalThis.__messageUpdates,
  cursorStates: globalThis.__cursorStates,
  afterToolResult,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["messageUpdates"] == [{"text": "", "streaming": True}]
    assert payload["afterToolResult"] == [True]
    assert payload["cursorStates"] == [True, False]


def test_historical_injection_and_failed_tool_collapse_into_processed_group(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/history.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "history_failed_tool_refresh"
    temp_dir.mkdir()
    (temp_dir / "history.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs")
        .replace("./messageActions.js", "./mockMessageActions.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs"),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    _write_mock_message_actions(temp_dir)
    (temp_dir / "toolResultStatus.mjs").write_text(
        """
export function isToolResultError(result, options = {}) {
  return options?.isError === true
    || result?.ok === false
    || result?.error === true
    || result?.status === 'failed'
    || result?.data?.status === 'failed'
    || (typeof result?.data?.exit_code === 'number' && result.data.exit_code !== 0);
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function isRunPrimaryRoleId() {
  return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(key, values = {}) {
  return key === 'tool.group.processed' ? `processed${values.duration || ''}` : key;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockHelpers.mjs").write_text(
        """
import { isToolResultError } from './toolResultStatus.mjs';

function makeClassList(el) {
  return {
    add(...names) {
      const tokens = new Set(String(el.className || '').split(/\\s+/).filter(Boolean));
      names.forEach(name => tokens.add(name));
      el.className = Array.from(tokens).join(' ');
    },
    contains(name) {
      return String(el.className || '').split(/\\s+/).includes(name);
    },
  };
}

function makeElement(tagName = 'div') {
  const el = {
    tagName,
    className: '',
    dataset: {},
    children: [],
    childNodes: [],
    textContent: '',
    hidden: false,
    get classList() { return makeClassList(this); },
    get nextElementSibling() {
      const siblings = this.parentElement?.children || [];
      const index = siblings.indexOf(this);
      return index >= 0 ? siblings[index + 1] || null : null;
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      this.childNodes.push(child);
      return child;
    },
    querySelector(selector) {
      if (selector === '.msg-content') return this.contentEl || null;
      if (selector === '.msg-role') return { textContent: String(this.dataset.label || '').toUpperCase() };
      if (selector === '.tool-output') return this.outputEl || null;
      if (selector === '.tool-status') return this.statusEl || null;
      if (selector === ':scope .tool-block[data-status="error"]') return findFailedTool(this);
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ':scope > .message') {
        return this.children.filter(child => child.classList.contains('message'));
      }
      return [];
    },
    setAttribute(name, value) {
      this[name] = value;
    },
    remove() {
      if (this.parentElement?.children) {
        this.parentElement.children = this.parentElement.children.filter(child => child !== this);
      }
      if (this.parentElement?.childNodes) {
        this.parentElement.childNodes = this.parentElement.childNodes.filter(child => child !== this);
      }
      this.parentElement = null;
    },
  };
  return el;
}

function findFailedTool(root) {
  if (root.classList?.contains('tool-block') && root.dataset.status === 'error') {
    return root;
  }
  for (const child of root.children || []) {
    const found = findFailedTool(child);
    if (found) return found;
  }
  return null;
}

export { isToolResultError };
export function applyToolReturn(toolBlock, content, options = {}) {
  toolBlock.dataset.status = isToolResultError(content, options) ? 'error' : 'completed';
  toolBlock.__result = content;
}
export function appendMessageText(contentEl, text) {
  const el = makeElement('div');
  el.className = 'msg-text';
  el.textContent = String(text || '');
  contentEl.appendChild(el);
  return el;
}
export function appendStructuredContentPart() {}
export function appendThinkingText() {}
export function buildToolBlock(toolName, args, toolCallId) {
  const block = makeElement('details');
  block.className = 'tool-block';
  block.dataset.toolName = String(toolName || '');
  block.dataset.toolCallId = String(toolCallId || '');
  block.dataset.status = 'running';
  block.args = args;
  block.outputEl = makeElement('pre');
  block.statusEl = makeElement('span');
  block.appendChild(block.outputEl);
  return block;
}
export const buildPendingToolBlock = buildToolBlock;
export function decoratePendingApprovalBlock() {}
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock(pendingToolBlocks, toolBlock, toolName, toolCallId) {
  if (toolCallId) pendingToolBlocks[`${toolName || ''}::${toolCallId || ''}`] = toolBlock;
  pendingToolBlocks[`${toolName || ''}::`] = [toolBlock];
}
export function labelFromRole(role) { return role || 'agent'; }
export function parseApprovalArgsPreview() { return ''; }
export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const wrapper = makeElement('div');
  wrapper.className = 'message';
  wrapper.dataset.label = label;
  wrapper.dataset.runId = String(options.runId || '');
  wrapper.dataset.roleId = String(options.roleId || '');
  wrapper.dataset.instanceId = String(options.instanceId || '');
  const contentEl = makeElement('div');
  contentEl.className = 'msg-content';
  wrapper.contentEl = contentEl;
  wrapper.appendChild(contentEl);
  container.appendChild(wrapper);
  return { wrapper, contentEl };
}
export function renderParts(contentEl, parts, pendingToolBlocks) {
  parts.forEach(part => {
    const kind = part.part_kind || part.kind;
    if (kind === 'tool-call') {
      const block = buildToolBlock(part.tool_name, part.args || {}, part.tool_call_id);
      contentEl.appendChild(block);
      indexPendingToolBlock(pendingToolBlocks, block, part.tool_name, part.tool_call_id);
    } else if (kind === 'text') {
      appendMessageText(contentEl, part.content || '');
    }
  });
}
export function resolvePendingToolBlock(pendingToolBlocks, toolName, toolCallId) {
  return pendingToolBlocks[`${toolName || ''}::${toolCallId || ''}`]
    || pendingToolBlocks[`${toolName || ''}::`]?.[0]
    || null;
}
export function forceScrollBottom() {}
export function setToolStatus(block, status) { block.dataset.status = status; }
export function setToolValidationFailureState(block) { block.dataset.status = 'validation_failed'; }
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.__relayTeamsMessageTimelineApplyAction = () => {};
globalThis.document = {
  createElement() {
    return {
      className: '',
      dataset: {},
      children: [],
      childNodes: [],
      get nextElementSibling() {
        const siblings = this.parentElement?.children || [];
        const index = siblings.indexOf(this);
        return index >= 0 ? siblings[index + 1] || null : null;
      },
    appendChild(child) {
      if (child.parentElement?.children) {
        child.parentElement.children = child.parentElement.children.filter(item => item !== child);
      }
      if (child.parentElement?.childNodes) {
        child.parentElement.childNodes = child.parentElement.childNodes.filter(item => item !== child);
      }
      child.parentElement = this;
      this.children.push(child);
      this.childNodes.push(child);
        return child;
      },
      append(...nodes) {
        nodes.forEach(node => this.appendChild(node));
      },
      setAttribute(name, value) {
        this[name] = value;
      },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener() {},
    };
  },
};

import { renderHistoricalMessageList } from './history.js';

const container = {
  dataset: {},
  children: [],
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  },
  insertBefore(child, before) {
    const index = this.children.indexOf(before);
    child.parentElement = this;
    if (index >= 0) this.children.splice(index, 0, child);
    else this.children.push(child);
    return child;
  },
  querySelector(selector) {
    if (selector === ':scope > .tool-group') {
      return this.children.find(child => child.className === 'tool-group') || null;
    }
    if (selector === ':scope .tool-block[data-status="error"]') {
      const visit = node => {
        if (node?.className === 'tool-block' && node.dataset?.status === 'error') return node;
        for (const child of node?.children || []) {
          const found = visit(child);
          if (found) return found;
        }
        return null;
      };
      return visit(this);
    }
    return null;
  },
  querySelectorAll(selector) {
    if (selector === ':scope > .message') {
      return this.children.filter(child => String(child.className || '').split(/\\s+/).includes('message'));
    }
    return [];
  },
};

renderHistoricalMessageList(container, [
  {
    role: 'assistant',
    role_id: 'Main Agent',
    instance_id: 'primary',
    created_at: '2026-04-29T10:00:00',
    message: {
      parts: [
        { part_kind: 'tool-call', tool_name: 'shell', tool_call_id: 'call-1', args: { command: 'ls missing' } },
      ],
    },
  },
  {
    role: 'user',
    created_at: '2026-04-29T10:00:01',
    message: {
      parts: [
        {
          part_kind: 'tool-return',
          tool_name: 'shell',
          tool_call_id: 'call-1',
          content: 'Shell command failed',
          is_error: true,
        },
      ],
    },
  },
  {
    entry_type: 'injection',
    status: 'applied',
    injection_status: 'applied',
    injection_id: 'inj-1',
    content: 'change direction',
    created_at: '2026-04-29T10:00:01.500',
    occurred_at: '2026-04-29T10:00:01.500',
    message: { parts: [{ part_kind: 'text', content: 'change direction' }] },
  },
  {
    role: 'assistant',
    role_id: 'Main Agent',
    instance_id: 'primary',
    created_at: '2026-04-29T10:00:02',
    message: { parts: [{ part_kind: 'text', content: 'Now let me read more files.' }] },
  },
  {
    role: 'assistant',
    role_id: 'Main Agent',
    instance_id: 'primary',
    created_at: '2026-04-29T10:00:02.500',
    message: {
      parts: [
        { part_kind: 'tool-call', tool_name: 'read_file', tool_call_id: 'call-2', args: { path: 'plugin_cli.py' } },
      ],
    },
  },
  {
    role: 'user',
    created_at: '2026-04-29T10:00:02.750',
    message: {
      parts: [
        {
          part_kind: 'tool-return',
          tool_name: 'read_file',
          tool_call_id: 'call-2',
          content: 'file content',
        },
      ],
    },
  },
  {
    role: 'assistant',
    role_id: 'Main Agent',
    instance_id: 'primary',
    created_at: '2026-04-29T10:00:03',
    message: { parts: [{ part_kind: 'text', content: 'done' }] },
  },
], {
  runId: 'run-1',
  runStatus: 'completed',
  hasFinalOutput: true,
  isLatestRound: false,
});

console.log(JSON.stringify({
  childClasses: container.children.map(child => child.className),
  failedStatus: container.querySelector(':scope .tool-block[data-status="error"]')?.dataset?.status || '',
  groupBodyChildClasses: container.children
    .find(child => child.className === 'tool-group')
    ?.children
    ?.find(child => String(child.className || '').includes('tool-group-body'))
    ?.children
    ?.map(child => child.className) || [],
  groupBodyClass: container.children
    .find(child => child.className === 'tool-group')
    ?.children
    ?.find(child => String(child.className || '').includes('tool-group-body'))
    ?.className || '',
  groupCount: container.children.filter(child => child.className === 'tool-group').length,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["failedStatus"] == "error"
    assert payload["groupCount"] == 1
    assert payload["childClasses"] == ["tool-group", "message"]
    assert payload["groupBodyClass"] == "tool-group-body msg-content"
    assert payload["groupBodyChildClasses"] == [
        "tool-block",
        "message-inject-marker",
        "msg-text",
        "tool-block",
        "tool-group-final-divider",
    ]


def test_rebind_then_tool_result_keeps_existing_text_and_appends_idle_placeholder(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_rebind_tool_result_idle_tail"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function removeFromParent(node) {
  const parent = node?.__parent || null;
  if (!parent || !Array.isArray(parent.children)) {
    return;
  }
  const index = parent.children.indexOf(node);
  if (index >= 0) {
    parent.children.splice(index, 1);
  }
}

function createTextNode() {
  return {
    className: "msg-text",
    dataset: {},
    __text: "",
    __streaming: false,
    __parent: null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    remove() { removeFromParent(this); },
  };
}

function toolMatches(block, toolName, toolCallId) {
  const safeToolCallId = String(toolCallId || "");
  if (safeToolCallId) {
    return String(block?.dataset?.toolCallId || "") === safeToolCallId;
  }
  return String(block?.dataset?.toolName || "") === String(toolName || "");
}

function findInContent(contentEl, toolName, toolCallId) {
  if (!contentEl || !Array.isArray(contentEl.children)) {
    return null;
  }
  for (let index = contentEl.children.length - 1; index >= 0; index -= 1) {
    const child = contentEl.children[index];
    if (toolMatches(child, toolName, toolCallId)) {
      return child;
    }
  }
  return null;
}

export function applyToolReturn(toolBlock, content) {
  toolBlock.__result = content;
}

export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }

export function buildPendingToolBlock(toolName, args, toolCallId = null) {
  return {
    dataset: {
      toolName: String(toolName || ""),
      toolCallId: String(toolCallId || ""),
      status: "running",
    },
    __args: args || {},
    __result: null,
    __parent: null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    remove() { removeFromParent(this); },
  };
}

export function findToolBlock(contentEl, toolName, toolCallId) {
  return findInContent(contentEl, toolName, toolCallId);
}

export function findToolBlockInContainer(container, toolName, toolCallId) {
  const messages = Array.isArray(container?.__messages) ? container.__messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const found = findInContent(messages[index].contentEl, toolName, toolCallId);
    if (found) {
      return found;
    }
  }
  return null;
}

export function indexPendingToolBlock(pendingToolBlocks, toolBlock, toolName, toolCallId) {
  pendingToolBlocks[`${toolName || ""}::${toolCallId || ""}`] = toolBlock;
  if (toolName) {
    pendingToolBlocks[`${toolName}::`] = toolBlock;
  }
}

export function renderMessageBlock(container, _role, label, _parts = [], options = {}) {
  const contentEl = {
    children: [],
    appendChild(child) {
      child.__parent = this;
      this.children.push(child);
    },
    querySelector() {
      return null;
    },
    querySelectorAll(selector) {
      if (selector === ".msg-text") {
        return this.children.filter(child => child?.className === "msg-text");
      }
      return [];
    },
  };
  const wrapper = {
    dataset: {
      runId: String(options.runId || ""),
      roleId: String(options.roleId || ""),
      instanceId: String(options.instanceId || ""),
      streamKey: String(options.streamKey || ""),
    },
    querySelector(selector) {
      if (selector === ".msg-role") {
        return { textContent: String(label || "").toUpperCase() };
      }
      if (selector === ".msg-content") {
        return contentEl;
      }
      return null;
    },
    closest() { return null; },
  };
  container.__messages.push({ wrapper, contentEl });
  return { wrapper, contentEl };
}

export function resolvePendingToolBlock(pendingToolBlocks, toolName, toolCallId) {
  return pendingToolBlocks[`${toolName || ""}::${toolCallId || ""}`]
    || pendingToolBlocks[`${toolName || ""}::`]
    || null;
}

export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor(_textEl, active) {
  globalThis.__cursorStates.push(active === true);
}
export function updateThinkingText() {}
export function updateMessageText(textEl, text, options = {}) {
  textEl.__text = String(text || "");
  textEl.__streaming = options.streaming === true;
  syncStreamingCursor(textEl, options.streaming === true);
}

globalThis.__createTextNode = createTextNode;
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.__cursorStates = [];
globalThis.document = {
  createElement() {
    return globalThis.__createTextNode();
  },
};

import {
  appendStreamChunk,
  appendToolCallBlock,
  bindStreamOverlayToContainer,
  clearRenderedStreamState,
  getOrCreateStreamBlock,
  updateToolResult,
} from "./stream.js";

const container = {
  __messages: [],
  appendChild() {},
  querySelectorAll() {
    return this.__messages.map(item => item.wrapper);
  },
};

getOrCreateStreamBlock(container, "inst-1", "Writer", "Writer", "run-1");
appendStreamChunk("inst-1", "hello", "run-1", "Writer", "Writer");
appendToolCallBlock(container, "inst-1", "shell", { command: "echo hi" }, "call-1", {
  runId: "run-1",
  roleId: "Writer",
  label: "Writer",
});
clearRenderedStreamState();
bindStreamOverlayToContainer(container, {
  instanceId: "inst-1",
  roleId: "Writer",
  label: "Writer",
  runId: "run-1",
});
updateToolResult("inst-1", "shell", { ok: true, data: "done" }, false, "call-1", {
  runId: "run-1",
  roleId: "Writer",
  label: "Writer",
  container,
});

const children = container.__messages[0].contentEl.children.map(child => ({
  className: String(child.className || ""),
  text: String(child.__text || ""),
  toolName: String(child?.dataset?.toolName || ""),
  toolCallId: String(child?.dataset?.toolCallId || ""),
  idleCursor: String(child?.dataset?.idleCursor || ""),
}));

console.log(JSON.stringify(children));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload == [
        {
            "className": "msg-text",
            "text": "hello",
            "toolName": "",
            "toolCallId": "",
            "idleCursor": "",
        },
        {
            "className": "",
            "text": "",
            "toolName": "shell",
            "toolCallId": "call-1",
            "idleCursor": "",
        },
        {
            "className": "msg-text",
            "text": "",
            "toolName": "",
            "toolCallId": "",
            "idleCursor": "true",
        },
    ]


def test_idle_cursor_rebind_resets_live_buffer_before_next_text_delta(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_idle_rebind_text_delta"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function createTextNode(text = "", idle = false) {
  return {
    className: "msg-text",
    dataset: idle ? { idleCursor: "true" } : {},
    __idleCursor: idle,
    __text: String(text || ""),
    __streaming: false,
    __parent: null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    remove() {
      const parent = this.__parent || null;
      if (!parent || !Array.isArray(parent.children)) return;
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
    },
  };
}

export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
  return {
    wrapper: {
      dataset: {},
      querySelector() { return null; },
      closest() { return null; },
    },
    contentEl: {
      children: [],
      appendChild(child) {
        child.__parent = this;
        this.children.push(child);
      },
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === ".msg-text") {
          return this.children.filter(child => child?.className === "msg-text");
        }
        return [];
      },
    },
  };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor() {}
export function updateThinkingText() {}
export function updateMessageText(textEl, text, options = {}) {
  textEl.__text = String(text || "");
  textEl.__streaming = options.streaming === true;
}

globalThis.__createTextNode = createTextNode;
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.document = {
  createElement() {
    return globalThis.__createTextNode();
  },
};

import {
  applyStreamOverlayEvent,
  appendStreamChunk,
  bindStreamOverlayToContainer,
} from "./stream.js";

const contentEl = {
  children: [
    globalThis.__createTextNode("hello", false),
    globalThis.__createTextNode("", true),
  ],
  appendChild(child) {
    child.__parent = this;
    this.children.push(child);
  },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === ".msg-text") {
      return this.children.filter(child => child?.className === "msg-text");
    }
    return [];
  },
};
contentEl.children.forEach(child => {
  child.__parent = contentEl;
});

const wrapper = {
  dataset: {
    runId: "run-2",
    roleId: "Writer",
    instanceId: "inst-2",
    streamKey: "inst-2",
  },
  querySelector(selector) {
    if (selector === ".msg-role") {
      return { textContent: "WRITER" };
    }
    if (selector === ".msg-content") {
      return contentEl;
    }
    return null;
  },
  closest() { return null; },
};

const container = {
  __messages: [{ wrapper, contentEl }],
  querySelectorAll() {
    return this.__messages.map(item => item.wrapper);
  },
};

applyStreamOverlayEvent(
  "text_delta",
  { text: "hello" },
  {
    runId: "run-2",
    instanceId: "inst-2",
    roleId: "Writer",
    label: "Writer",
  },
);
applyStreamOverlayEvent(
  "thinking_started",
  { part_index: 0 },
  {
    runId: "run-2",
    instanceId: "inst-2",
    roleId: "Writer",
    label: "Writer",
  },
);
applyStreamOverlayEvent(
  "thinking_finished",
  { part_index: 0 },
  {
    runId: "run-2",
    instanceId: "inst-2",
    roleId: "Writer",
    label: "Writer",
  },
);

bindStreamOverlayToContainer(container, {
  instanceId: "inst-2",
  roleId: "Writer",
  label: "Writer",
  runId: "run-2",
});
appendStreamChunk("inst-2", " world", "run-2", "Writer", "Writer");

const closedContentEl = {
  children: [
    globalThis.__createTextNode("before", false),
  ],
  appendChild(child) {
    child.__parent = this;
    this.children.push(child);
  },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === ".msg-text") {
      return this.children.filter(child => child?.className === "msg-text");
    }
    return [];
  },
};
closedContentEl.children.forEach(child => {
  child.__parent = closedContentEl;
});

const closedWrapper = {
  dataset: {
    runId: "run-3",
    roleId: "Writer",
    instanceId: "inst-3",
    streamKey: "inst-3",
  },
  querySelector(selector) {
    if (selector === ".msg-role") {
      return { textContent: "WRITER" };
    }
    if (selector === ".msg-content") {
      return closedContentEl;
    }
    return null;
  },
  closest() { return null; },
};

const closedContainer = {
  __messages: [{ wrapper: closedWrapper, contentEl: closedContentEl }],
  querySelectorAll() {
    return this.__messages.map(item => item.wrapper);
  },
};

applyStreamOverlayEvent(
  "text_delta",
  { text: "before" },
  {
    runId: "run-3",
    instanceId: "inst-3",
    roleId: "Writer",
    label: "Writer",
  },
);
applyStreamOverlayEvent(
  "tool_call",
  { tool_call_id: "call-1", tool_name: "shell", args: {} },
  {
    runId: "run-3",
    instanceId: "inst-3",
    roleId: "Writer",
    label: "Writer",
  },
);
bindStreamOverlayToContainer(closedContainer, {
  instanceId: "inst-3",
  roleId: "Writer",
  label: "Writer",
  runId: "run-3",
});
appendStreamChunk("inst-3", " after", "run-3", "Writer", "Writer");

const serialize = child => ({
  text: String(child.__text || ""),
  idleCursor: String(child?.dataset?.idleCursor || ""),
  idleFlag: child.__idleCursor === true,
});

console.log(JSON.stringify({
  idleRebind: contentEl.children.map(serialize),
  closedRebind: closedContentEl.children.map(serialize),
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload["idleRebind"] == [
        {
            "text": "hello",
            "idleCursor": "",
            "idleFlag": False,
        },
        {
            "text": " world",
            "idleCursor": "",
            "idleFlag": False,
        },
    ]
    assert payload["closedRebind"] == [
        {
            "text": "before",
            "idleCursor": "",
            "idleFlag": False,
        },
        {
            "text": " after",
            "idleCursor": "",
            "idleFlag": False,
        },
    ]


def test_finalize_stream_keeps_real_text_tail_when_overlay_idle_cursor_drifts(
    tmp_path: Path,
) -> None:
    source = Path("frontend/dist/js/components/messageRenderer/stream.js").read_text(
        encoding="utf-8"
    )
    temp_dir = tmp_path / "stream_finalize_real_text_tail"
    temp_dir.mkdir()

    (temp_dir / "stream.js").write_text(
        source.replace("../../core/state.js", "./mockState.mjs")
        .replace("./helpers.js", "./mockHelpers.mjs")
        .replace("../../utils/i18n.js", "./mockI18n.mjs"),
        encoding="utf-8",
    )
    (temp_dir / "mockState.mjs").write_text(
        """
export function getRunPrimaryRoleId() {
    return "";
}

export function isPrimaryRoleId() {
    return false;
}
""".strip(),
        encoding="utf-8",
    )
    (temp_dir / "mockI18n.mjs").write_text(
        """
export function formatMessage(_key, values = {}) {
    return JSON.stringify(values);
}

export function t(key) {
    return key;
}
""".strip(),
        encoding="utf-8",
    )
    _write_transcript_grouping_module(temp_dir)
    (temp_dir / "mockHelpers.mjs").write_text(
        """
function createTextNode(text = "") {
  return {
    className: "msg-text",
    dataset: {},
    __text: String(text || ""),
    __streaming: false,
    __idleCursor: false,
    __parent: null,
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    remove() {
      const parent = this.__parent || null;
      if (!parent || !Array.isArray(parent.children)) return;
      const index = parent.children.indexOf(this);
      if (index >= 0) parent.children.splice(index, 1);
    },
  };
}

export function applyToolReturn() {}
export function appendStructuredContentPart() {}
export function appendThinkingText() { return {}; }
export function buildPendingToolBlock() { return { querySelector() { return null; } }; }
export function findToolBlock() { return null; }
export function findToolBlockInContainer() { return null; }
export function indexPendingToolBlock() {}
export function renderMessageBlock() {
  return {
    wrapper: {
      dataset: {},
      querySelector() { return null; },
      closest() { return null; },
    },
    contentEl: {
      children: [],
      appendChild(child) {
        child.__parent = this;
        this.children.push(child);
      },
      querySelector() { return null; },
      querySelectorAll(selector) {
        if (selector === ".msg-text") {
          return this.children.filter(child => child?.className === "msg-text");
        }
        return [];
      },
    },
  };
}
export function resolvePendingToolBlock() { return null; }
export function scrollBottom() {}
export function setToolStatus() {}
export function setToolValidationFailureState() {}
export function syncStreamingCursor(_textEl, active) {
  globalThis.__cursorStates.push(active === true);
}
export function updateThinkingText() {}
export function updateMessageText(textEl, text, options = {}) {
  textEl.__text = String(text || "");
  textEl.__streaming = options.streaming === true;
}

globalThis.__createTextNode = createTextNode;
""".strip(),
        encoding="utf-8",
    )

    runner = """
globalThis.__cursorStates = [];
globalThis.document = {
  createElement() {
    return globalThis.__createTextNode();
  },
};

import {
  applyStreamOverlayEvent,
  bindStreamOverlayToContainer,
  finalizeStream,
} from "./stream.js";

const textNode = globalThis.__createTextNode("hello");
const contentEl = {
  children: [textNode],
  appendChild(child) {
    child.__parent = this;
    this.children.push(child);
  },
  querySelector() { return null; },
  querySelectorAll(selector) {
    if (selector === ".msg-text") {
      return this.children.filter(child => child?.className === "msg-text");
    }
    return [];
  },
};
textNode.__parent = contentEl;

const wrapper = {
  dataset: {
    runId: "run-3",
    roleId: "Writer",
    instanceId: "inst-3",
    streamKey: "inst-3",
  },
  querySelector(selector) {
    if (selector === ".msg-role") {
      return { textContent: "WRITER" };
    }
    if (selector === ".msg-content") {
      return contentEl;
    }
    return null;
  },
  closest() { return null; },
};

const container = {
  __messages: [{ wrapper, contentEl }],
  querySelectorAll() {
    return this.__messages.map(item => item.wrapper);
  },
};

applyStreamOverlayEvent(
  "text_delta",
  { text: "hello" },
  {
    runId: "run-3",
    instanceId: "inst-3",
    roleId: "Writer",
    label: "Writer",
  },
);
applyStreamOverlayEvent(
  "tool_result",
  {
    tool_name: "shell",
    tool_call_id: "call-3",
    result: { ok: true, data: "done" },
  },
  {
    runId: "run-3",
    instanceId: "inst-3",
    roleId: "Writer",
    label: "Writer",
  },
);

bindStreamOverlayToContainer(container, {
  instanceId: "inst-3",
  roleId: "Writer",
  label: "Writer",
  runId: "run-3",
});
finalizeStream("inst-3", "Writer", { runId: "run-3" });

console.log(JSON.stringify({
  children: contentEl.children.map(child => ({
    text: String(child.__text || ""),
    idleCursor: String(child?.dataset?.idleCursor || ""),
  })),
  cursorStates: globalThis.__cursorStates,
}));
""".strip()

    result = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=3,
    )

    payload = json.loads(result.stdout)
    assert payload == {
        "children": [
            {
                "text": "hello",
                "idleCursor": "",
            }
        ],
        "cursorStates": [],
    }
