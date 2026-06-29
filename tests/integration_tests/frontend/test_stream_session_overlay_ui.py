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
