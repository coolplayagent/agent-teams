# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import subprocess
from pathlib import Path


def test_message_timeline_keeps_completed_tool_status_when_call_arrives_late() -> None:
    repo_root = Path(__file__).resolve().parents[3]
    runner = """
import {
  applyRunEventToTimeline,
} from './frontend/dist/js/components/messageTimeline/actions.js';
import {
  clearTimelineState,
  getRunTimelineSnapshot,
} from './frontend/dist/js/components/messageTimeline/store.js';

clearTimelineState();

applyRunEventToTimeline(
  'tool_result',
  {
    tool_name: 'shell',
    tool_call_id: 'call-b',
    result: { ok: true, output: 'done' },
  },
  { run_id: 'run-1', event_id: 2 },
);
applyRunEventToTimeline(
  'tool_call',
  {
    tool_name: 'shell',
    tool_call_id: 'call-b',
    args: { command: 'echo b' },
  },
  { run_id: 'run-1', event_id: 1 },
);

console.log(JSON.stringify(getRunTimelineSnapshot('run-1').coordinator.parts));
""".strip()

    completed = subprocess.run(
        ["node", "--input-type=module", "-e", runner],
        cwd=repo_root,
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=True,
        timeout=10,
    )

    parts = json.loads(completed.stdout)
    assert len(parts) == 1
    assert parts[0]["tool_call_id"] == "call-b"
    assert parts[0]["status"] == "completed"
    assert parts[0]["args"] == {"command": "echo b"}


