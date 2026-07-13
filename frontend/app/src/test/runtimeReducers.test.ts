import { describe, expect, it } from "vitest";

import {
  initialRuntimeState,
  MAX_SEEN_EVENT_KEYS,
  reduceRunEvent,
  reduceRunEvents,
} from "../runtime/reducers";
import {
  AG_UI_EVENT_NAMES,
  type AgUiRunEvent,
  type RelayRunEvent,
} from "../runtime/events";

describe("runtime reducers", () => {
  it("keeps every required frontend AG-UI event family in the public stream contract", () => {
    expect(new Set(AG_UI_EVENT_NAMES).size).toBe(AG_UI_EVENT_NAMES.length);
    expect(AG_UI_EVENT_NAMES).toEqual(
      expect.arrayContaining([
        "run.started",
        "run.resumed",
        "run.completed",
        "run.stopped",
        "run.failed",
        "message.text.delta",
        "message.output.delta",
        "thinking.started",
        "thinking.delta",
        "thinking.finished",
        "model_step.started",
        "model_step.finished",
        "model_request.waiting",
        "model_request.acquired",
        "tool_call.started",
        "tool_call.validation_failed",
        "tool_result.completed",
        "tool_approval.requested",
        "tool_approval.resolved",
        "user_question.requested",
        "user_question.answered",
        "injection.enqueued",
        "injection.applied",
        "state.snapshot",
        "state.delta",
        "subagent_session.status_changed",
        "subagent.stopped",
        "subagent.resumed",
        "background_task.started",
        "background_task.updated",
        "background_task.completed",
        "background_task.stopped",
        "todo.updated",
        "token_usage.updated",
        "notification.requested",
      ]),
    );
  });

  it("deduplicates replayed events by run and event id", () => {
    const event = runEvent({
      event_id: 7,
      event_type: "text_delta",
      payload_json: JSON.stringify({ delta: "hello" }),
    });
    const once = reduceRunEvent(initialRuntimeState, event);
    const twice = reduceRunEvent(once, event);

    expect(twice.runs["run-1"].entries).toHaveLength(1);
    expect(twice.runs["run-1"].lastEventId).toBe(7);
  });

  it("preserves task and instance identity for shared orchestration runs", () => {
    const state = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 8,
        event_type: "thinking_delta",
        instance_id: "crafter-instance",
        task_id: "crafter-task",
        payload_json: JSON.stringify({ text: "Inspecting" }),
      }),
    );

    expect(state.runs["run-1"].entries[0]).toMatchObject({
      actorIdentity: {
        kind: "instance",
        roleId: null,
        source: "event",
      },
      instanceId: "crafter-instance",
      roleId: "",
      taskId: "crafter-task",
    });
  });

  it("keeps actor identity unknown instead of inventing an assistant role", () => {
    const state = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 2,
        event_type: "text_delta",
        instance_id: null,
        role_id: null,
        payload_json: JSON.stringify({ text: "unattributed output" }),
      }),
    );

    expect(state.runs["run-1"].entries[0]).toMatchObject({
      actorIdentity: {
        instanceId: null,
        kind: "unknown",
        roleId: null,
        source: "missing",
      },
      roleId: "",
      text: "unattributed output",
    });
    expect(state.runs["run-1"].entries[0].instanceId).toBeUndefined();
    expect(state.runs["run-1"].hadVisibleTextStream).toBe(false);
  });

  it("inherits an established run actor for replayed deltas without identity", () => {
    const state = [
      runEvent({
        event_id: 1,
        event_type: "run_started",
        instance_id: "root-instance",
        role_id: "RenamedPrimary",
      }),
      runEvent({
        event_id: 2,
        event_type: "text_delta",
        instance_id: null,
        role_id: null,
        payload_json: JSON.stringify({ text: "attributed replay output" }),
      }),
    ].reduce(reduceRunEvent, initialRuntimeState);

    expect(state.runs["run-1"].entries[1]).toMatchObject({
      actorIdentity: {
        instanceId: "root-instance",
        kind: "role",
        roleId: "RenamedPrimary",
        source: "run_target",
      },
      instanceId: "root-instance",
      roleId: "RenamedPrimary",
      text: "attributed replay output",
    });
    expect(state.runs["run-1"].hadVisibleTextStream).toBe(true);
  });

  it("does not borrow the root role for a different event instance", () => {
    const started = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 1,
        event_type: "run_started",
        instance_id: "root-instance",
        role_id: "RenamedPrimary",
      }),
    );
    const state = reduceRunEvent(
      started,
      runEvent({
        event_id: 2,
        event_type: "text_delta",
        instance_id: "child-instance",
        role_id: null,
        payload_json: JSON.stringify({ text: "child without role" }),
      }),
    );

    expect(state.runs["run-1"].entries[1]).toMatchObject({
      actorIdentity: {
        instanceId: "child-instance",
        kind: "instance",
        roleId: null,
        source: "event",
      },
      instanceId: "child-instance",
      roleId: "",
    });
  });

  it("replays model slot waiting as local run state without timeline noise", () => {
    const waiting = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 7,
        event_type: "model_request_waiting",
        payload_json: JSON.stringify({ phase: "waiting_for_slot" }),
      }),
    );
    expect(waiting.runs["run-1"].modelRequestPhase).toBe("waiting_for_slot");
    expect(waiting.runs["run-1"].entries).toHaveLength(0);

    const acquired = reduceRunEvent(
      waiting,
      runEvent({
        event_id: 8,
        event_type: "model_request_acquired",
        payload_json: JSON.stringify({ phase: "opening_stream" }),
      }),
    );
    expect(acquired.runs["run-1"].modelRequestPhase).toBe("opening_stream");
    expect(acquired.runs["run-1"].entries).toHaveLength(0);

    const firstToken = reduceRunEvent(
      acquired,
      runEvent({
        event_id: 9,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "ready" }),
      }),
    );
    expect(firstToken.runs["run-1"].modelRequestPhase).toBeNull();
  });

  it("ignores replayed event ids at or below the local stream cursor", () => {
    const state = reduceRunEvent(
      {
        activeRunIds: ["run-1"],
        runs: {
          "run-1": {
            entries: [],
            lastEventId: 12,
            replayAfterEventId: 12,
            runId: "run-1",
            seenEventKeys: [],
            status: "open",
            terminalEventType: null,
          },
        },
      },
      runEvent({
        event_id: 11,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "old replay chunk" }),
      }),
    );

    expect(state.runs["run-1"].entries).toHaveLength(0);
    expect(state.runs["run-1"].lastEventId).toBe(12);
  });

  it("keeps unseen late events that arrive below the local stream cursor", () => {
    const withEventTen = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 10,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "first chunk" }),
      }),
    );
    const withEventTwelve = reduceRunEvent(
      withEventTen,
      runEvent({
        event_id: 12,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "third chunk" }),
      }),
    );
    const withLateEventEleven = reduceRunEvent(
      withEventTwelve,
      runEvent({
        event_id: 11,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "second chunk" }),
      }),
    );

    expect(withLateEventEleven.runs["run-1"].lastEventId).toBe(12);
    expect(withLateEventEleven.runs["run-1"].entries.map((entry) => entry.text))
      .toEqual(["first chunk", "second chunk", "third chunk"]);
    expect(withLateEventEleven.runs["run-1"].seenEventIdRanges).toEqual([
      [10, 12],
    ]);
  });

  it("bounds fallback dedupe keys for long streams", () => {
    const state = Array.from({ length: MAX_SEEN_EVENT_KEYS + 8 }, (_value, index) =>
      runEvent({
        event_id: null,
        event_type: "generation_progress",
        payload_json: JSON.stringify({ text: `progress ${index}` }),
      }),
    ).reduce(reduceRunEvent, initialRuntimeState);

    expect(state.runs["run-1"].seenEventKeys).toHaveLength(MAX_SEEN_EVENT_KEYS);
    expect(state.runs["run-1"].entries).toHaveLength(MAX_SEEN_EVENT_KEYS + 8);
  });

  it("preserves every ordered delta across a provider-sized stream", () => {
    const eventCount = 6000;
    const streamed = Array.from({ length: eventCount }, (_value, index) =>
      runEvent({
        event_id: index + 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: String(index % 10) }),
      }),
    ).reduce(reduceRunEvent, initialRuntimeState);
    const completed = reduceRunEvent(
      streamed,
      runEvent({
        event_id: eventCount + 1,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
      }),
    );

    expect(completed.activeRunIds).toEqual([]);
    expect(completed.runs["run-1"].entries).toHaveLength(2);
    expect(
      completed.runs["run-1"].entries
        .filter((entry) => entry.kind === "text_delta")
        .map((entry) => entry.text)
        .join(""),
    ).toBe(Array.from({ length: eventCount }, (_value, index) => String(index % 10)).join(""));
    expect(completed.runs["run-1"]).toMatchObject({
      lastEventId: eventCount + 1,
      status: "closed",
      terminalEventType: "run_completed",
    });

    const replayedOldestEvent = reduceRunEvent(
      completed,
      runEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "duplicate" }),
      }),
    );
    expect(replayedOldestEvent).toBe(completed);
    expect(replayedOldestEvent.runs["run-1"].entries).toHaveLength(2);
    expect(replayedOldestEvent.runs["run-1"].seenEventIdRanges).toEqual([
      [1, eventCount + 1],
    ]);
  });

  it("compacts concurrent provider deltas independently by stream identity", () => {
    const eventCount = 6000;
    const streamed = Array.from({ length: eventCount }, (_value, index) =>
      runEvent({
        event_id: index + 1,
        instance_id: index % 2 === 0 ? "instance-a" : "instance-b",
        role_id: index % 2 === 0 ? "Coordinator" : "Explorer",
        payload_json: JSON.stringify({
          part_index: 0,
          text: String(index % 10),
        }),
      }),
    ).reduce(reduceRunEvent, initialRuntimeState);

    const entries = streamed.runs["run-1"].entries;
    expect(entries).toHaveLength(2);
    expect(entries.find((entry) => entry.instanceId === "instance-a")?.text)
      .toBe(Array.from({ length: eventCount }, (_value, index) => index)
        .filter((index) => index % 2 === 0)
        .map((index) => String(index % 10))
        .join(""));
    expect(entries.find((entry) => entry.instanceId === "instance-b")?.text)
      .toBe(Array.from({ length: eventCount }, (_value, index) => index)
        .filter((index) => index % 2 === 1)
        .map((index) => String(index % 10))
        .join(""));
  });

  it("batch reduction preserves stream text, cursors, and terminal state", () => {
    const events = [
      runEvent({
        event_id: 1,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "inspect " }),
      }),
      runEvent({
        event_id: 2,
        event_type: "thinking_delta",
        payload_json: JSON.stringify({ part_index: 0, text: "workspace" }),
      }),
      runEvent({
        event_id: 3,
        event_type: "run_completed",
        payload_json: JSON.stringify({ status: "completed" }),
      }),
    ];

    const state = reduceRunEvents(initialRuntimeState, events);

    expect(state.runs["run-1"]).toMatchObject({
      lastEventId: 3,
      seenEventIdRanges: [[1, 3]],
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(state.runs["run-1"].entries).toHaveLength(2);
    expect(state.runs["run-1"].entries[0]).toMatchObject({
      kind: "thinking_delta",
      lastMergedEventId: 2,
      text: "inspect workspace",
    });
  });

  it("batch reduction keeps provider-sized orchestration streams replay-safe", () => {
    const eventCount = 6000;
    const events = Array.from({ length: eventCount }, (_value, index) =>
      runEvent({
        event_id: index + 1,
        event_type: "thinking_delta",
        instance_id: "orchestration-worker",
        role_id: "Worker",
        payload_json: JSON.stringify({
          part_index: 0,
          text: String(index % 10),
        }),
      }),
    );

    const state = reduceRunEvents(initialRuntimeState, events);
    const runState = state.runs["run-1"];

    expect(runState.entries).toHaveLength(1);
    expect(runState.entries[0]).toMatchObject({
      eventId: 1,
      lastMergedEventId: eventCount,
      text: Array.from(
        { length: eventCount },
        (_value, index) => String(index % 10),
      ).join(""),
    });
    expect(runState.lastEventId).toBe(eventCount);
    expect(runState.seenEventIdRanges).toEqual([[1, eventCount]]);
    expect(reduceRunEvent(state, events[3000])).toBe(state);
  });

  it("keeps repeated cursorless stream deltas when no stable replay key exists", () => {
    const first = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: null,
        event_type: "text_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({ delta: " " }),
      }),
    );
    const second = reduceRunEvent(
      first,
      runEvent({
        event_id: null,
        event_type: "text_delta",
        occurred_at: undefined,
        payload_json: JSON.stringify({ delta: " " }),
      }),
    );

    expect(second.runs["run-1"].entries).toHaveLength(2);
    expect(second.runs["run-1"].entries.map((entry) => entry.text)).toEqual([
      " ",
      " ",
    ]);
    expect(second.runs["run-1"].seenEventKeys).toEqual([]);
  });

  it("deduplicates cursorless replay events when timestamp metadata is stable", () => {
    const event = runEvent({
      event_id: null,
      event_type: "tool_result",
      occurred_at: "2026-06-23T00:00:07Z",
      payload_json: JSON.stringify({ text: "same replayed result" }),
    });
    const once = reduceRunEvent(initialRuntimeState, event);
    const twice = reduceRunEvent(once, event);

    expect(twice.runs["run-1"].entries).toHaveLength(1);
    expect(twice.runs["run-1"].seenEventKeys).toHaveLength(1);
  });

  it("closes active run state on terminal events", () => {
    const started = reduceRunEvent(
      initialRuntimeState,
      runEvent({ event_id: 1, event_type: "run_started" }),
    );
    const completed = reduceRunEvent(
      started,
      runEvent({ event_id: 2, event_type: "run_completed" }),
    );

    expect(started.activeRunIds).toEqual(["run-1"]);
    expect(completed.activeRunIds).toEqual([]);
    expect(completed.runs["run-1"].terminalEventType).toBe("run_completed");
  });

  it("preserves active run identity while an already-active run streams", () => {
    const started = reduceRunEvent(
      initialRuntimeState,
      runEvent({ event_id: 1, event_type: "run_started" }),
    );
    const streamed = reduceRunEvent(
      started,
      runEvent({
        event_id: 2,
        event_type: "text_delta",
        payload_json: JSON.stringify({ delta: "next" }),
      }),
    );

    expect(streamed.activeRunIds).toBe(started.activeRunIds);
  });

  it("marks terminal structured output as visible runtime output", () => {
    const completed = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 2,
        event_type: "run_completed",
        role_id: "MainAgent",
        payload_json: JSON.stringify({
          output: [{ kind: "text", text: "terminal structured answer" }],
        }),
      }),
    );

    expect(completed.runs["run-1"].hadVisibleTextStream).toBe(true);
  });

  it("does not reopen completed runs for trailing replay events", () => {
    const completed = reduceRunEvent(
      initialRuntimeState,
      runEvent({ event_id: 10, event_type: "run_completed" }),
    );
    const withTokenUsage = reduceRunEvent(
      completed,
      runEvent({
        event_id: 11,
        event_type: "token_usage",
        payload_json: JSON.stringify({ total_tokens: 123 }),
      }),
    );

    expect(withTokenUsage.activeRunIds).toEqual([]);
    expect(withTokenUsage.runs["run-1"]).toMatchObject({
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(withTokenUsage.runs["run-1"].entries.map((entry) => entry.kind)).toEqual([
      "run_completed",
      "token_usage",
    ]);
  });

  it("keeps entryless recovered terminal runs closed for trailing events", () => {
    const state = reduceRunEvent(
      {
        activeRunIds: [],
        runs: {
          "run-1": {
            entries: [],
            lastEventId: 10,
            runId: "run-1",
            seenEventKeys: ["run-1:10"],
            status: "closed",
            terminalEventType: "run_completed",
          },
        },
      },
      runEvent({
        event_id: 11,
        event_type: "token_usage",
        payload_json: JSON.stringify({ total_tokens: 123 }),
      }),
    );

    expect(state.activeRunIds).toEqual([]);
    expect(state.runs["run-1"]).toMatchObject({
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(state.runs["run-1"].entries.map((entry) => entry.kind))
      .toEqual(["token_usage"]);
  });

  it("reopens a completed run only from a later resume lifecycle event", () => {
    const completed = [
      runEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "first lifecycle" }),
      }),
      runEvent({ event_id: 2, event_type: "run_completed" }),
    ].reduce(reduceRunEvent, initialRuntimeState);
    const staleReplay = reduceRunEvent(
      completed,
      runEvent({
        event_id: 1,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "stale replay" }),
      }),
    );
    const resumed = reduceRunEvent(
      staleReplay,
      runEvent({
        event_id: 3,
        event_type: "run_resumed",
        payload_json: JSON.stringify({ reason: "resume" }),
      }),
    );
    const continued = reduceRunEvent(
      resumed,
      runEvent({
        event_id: 4,
        event_type: "text_delta",
        payload_json: JSON.stringify({ text: "second lifecycle" }),
      }),
    );

    expect(staleReplay).toBe(completed);
    expect(resumed.runs["run-1"]).toMatchObject({
      status: "open",
      terminalEventType: null,
      lastEventId: 3,
    });
    expect(continued.activeRunIds).toEqual(["run-1"]);
    expect(continued.runs["run-1"].entries.map((entry) => entry.text)).toEqual([
      "first lifecycle",
      "run completed",
      "resume",
      "second lifecycle",
    ]);
  });

  it("reopens a paused run when replay reaches a resume event", () => {
    const paused = reduceRunEvent(
      initialRuntimeState,
      runEvent({ event_id: 5, event_type: "run_paused" }),
    );
    const resumed = reduceRunEvent(
      paused,
      runEvent({ event_id: 6, event_type: "run_resumed" }),
    );

    expect(paused.activeRunIds).toEqual([]);
    expect(resumed.activeRunIds).toEqual(["run-1"]);
    expect(resumed.runs["run-1"]).toMatchObject({
      status: "open",
      terminalEventType: null,
    });
  });

  it("keeps invalid payload text instead of dropping the event", () => {
    const state = reduceRunEvent(
      initialRuntimeState,
      runEvent({ payload_json: "{bad json", event_type: "tool_result" }),
    );

    expect(state.runs["run-1"].entries[0].payload).toEqual({
      raw_payload: "{bad json",
      parse_error: true,
    });
  });

  it("uses diagnostic payload text for failed and stopped runtime events", () => {
    const failed = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 2,
        event_type: "run_failed",
        payload_json: JSON.stringify({
          error_message: "Provider stream ended before finish reason",
          error_code: "network_stream_interrupted",
        }),
      }),
    );
    const stopped = reduceRunEvent(
      failed,
      runEvent({
        event_id: 3,
        event_type: "run_stopped",
        payload_json: JSON.stringify({
          reason: "User requested stop",
        }),
      }),
    );

    expect(stopped.runs["run-1"].entries).toMatchObject([
      {
        kind: "run_failed",
        text: "Provider stream ended before finish reason",
      },
      {
        kind: "run_stopped",
        text: "User requested stop",
      },
    ]);
  });

  it("preserves instance ids for runtime stream grouping", () => {
    const state = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 3,
        event_type: "text_delta",
        instance_id: "worker-a",
        role_id: "MainAgent",
        payload_json: JSON.stringify({ text: "hello" }),
      }),
    );

    expect(state.runs["run-1"].entries[0]).toMatchObject({
      instanceId: "worker-a",
      roleId: "MainAgent",
    });
    expect(state.runs["run-1"].targetInstanceId).toBeUndefined();
  });

  it("derives the primary instance only from a run lifecycle event", () => {
    const state = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 1,
        event_type: "run_started",
        instance_id: "instance-root",
        role_id: "RenamedPrimary",
      }),
    );

    expect(state.runs["run-1"].targetInstanceId).toBe("instance-root");
  });

  it("keeps subagent stream events isolated from parent run state", () => {
    const state = [
      runEvent({
        event_id: 1,
        event_type: "run_started",
        run_id: "run-parent",
        trace_id: "run-parent",
      }),
      runEvent({
        event_id: 2,
        event_type: "text_delta",
        run_id: "subagent_run_deadbeef",
        trace_id: "subagent_run_deadbeef",
        instance_id: "inst-sub",
        role_id: "worker",
        payload_json: JSON.stringify({ delta: "child chunk" }),
      }),
      runEvent({
        event_id: 3,
        event_type: "token_usage",
        run_id: "subagent_run_deadbeef",
        trace_id: "subagent_run_deadbeef",
        instance_id: "inst-sub",
        role_id: "worker",
        payload_json: JSON.stringify({ total_tokens: 42 }),
      }),
      runEvent({
        event_id: 4,
        event_type: "generation_progress",
        run_id: "subagent_run_deadbeef",
        trace_id: "subagent_run_deadbeef",
        instance_id: "inst-sub",
        role_id: "worker",
        payload_json: JSON.stringify({ phase: "downloading" }),
      }),
    ].reduce(reduceRunEvent, initialRuntimeState);

    expect(state.activeRunIds).toEqual(["run-parent", "subagent_run_deadbeef"]);
    expect(state.runs["run-parent"]).toMatchObject({
      runId: "run-parent",
      lastEventId: 1,
      status: "open",
    });
    expect(state.runs["run-parent"].entries.map((entry) => entry.kind)).toEqual([
      "run_started",
    ]);
    expect(
      state.runs["subagent_run_deadbeef"].entries.map((entry) => ({
        kind: entry.kind,
        runId: entry.runId,
        instanceId: entry.instanceId,
        roleId: entry.roleId,
        text: entry.text,
      })),
    ).toEqual([
      {
        kind: "text_delta",
        runId: "subagent_run_deadbeef",
        instanceId: "inst-sub",
        roleId: "worker",
        text: "child chunk",
      },
      {
        kind: "token_usage",
        runId: "subagent_run_deadbeef",
        instanceId: "inst-sub",
        roleId: "worker",
        text: "token usage",
      },
      {
        kind: "generation_progress",
        runId: "subagent_run_deadbeef",
        instanceId: "inst-sub",
        roleId: "worker",
        text: "downloading",
      },
    ]);
  });

  it.each([
    ["running", "subagent_running", "open", null, true],
    ["paused", "awaiting_manual_action", "closed", "run_paused", false],
    ["completed", "terminal", "closed", "run_completed", false],
    ["failed", "terminal", "closed", "run_failed", false],
    ["stopped", "idle", "closed", "run_stopped", false],
  ] as const)(
    "maps reported subagent %s state without waiting for a child stream terminal event",
    (reportedStatus, runPhase, expectedStatus, terminalEventType, active) => {
      const childRunId = "child-run-status-matrix";
      const state = reduceRunEvent(
        initialRuntimeState,
        runEvent({
          event_id: 12,
          event_type: "subagent_session_status_changed",
          instance_id: "child-instance",
          role_id: "reviewer",
          run_id: childRunId,
          trace_id: childRunId,
          payload_json: JSON.stringify({
            run_phase: runPhase,
            run_status: reportedStatus,
            status: reportedStatus,
            subagent_instance_id: "child-instance",
            subagent_role_id: "reviewer",
            subagent_run_id: childRunId,
          }),
        }),
      );

      expect(state.runs[childRunId]).toMatchObject({
        scope: "subagent",
        status: expectedStatus,
        terminalEventType,
      });
      expect(state.activeRunIds.includes(childRunId)).toBe(active);
    },
  );

  it("keeps a completed parent closed while a reported child remains running", () => {
    const parentRunId = "parent-run-completed-child-running";
    const childRunId = "child-run-still-running";
    const parentCompleted = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 20,
        event_type: "run_completed",
        run_id: parentRunId,
        trace_id: parentRunId,
      }),
    );
    const withRunningChild = reduceRunEvent(
      parentCompleted,
      runEvent({
        event_id: 21,
        event_type: "subagent_session_status_changed",
        instance_id: "child-instance",
        role_id: "reviewer",
        run_id: childRunId,
        trace_id: childRunId,
        payload_json: JSON.stringify({
          parent_run_id: parentRunId,
          run_phase: "subagent_running",
          run_status: "running",
          status: "running",
          subagent_instance_id: "child-instance",
          subagent_role_id: "reviewer",
          subagent_run_id: childRunId,
        }),
      }),
    );

    expect(withRunningChild.runs[parentRunId]).toMatchObject({
      status: "closed",
      terminalEventType: "run_completed",
    });
    expect(withRunningChild.runs[childRunId]).toMatchObject({
      scope: "subagent",
      status: "open",
      terminalEventType: null,
    });
    expect(withRunningChild.activeRunIds).toEqual([childRunId]);
  });

  it("marks explicit child run references as subagent scope before UUID child events arrive", () => {
    const childRunId = "87f9f69e-8622-4d46-958f-aa0d7d283095";
    const withReference = reduceRunEvent(
      initialRuntimeState,
      runEvent({
        event_id: 1,
        event_type: "tool_result",
        payload_json: JSON.stringify({
          result: {
            subagent_instance_id: "22cd6473-7579-438e-90df-d8177cc31e93",
            subagent_role_id: "Explorer",
            subagent_run_id: childRunId,
            title: "Explore skill implementation",
          },
          tool_call_id: "call-subagent",
          tool_name: "spawn_subagent",
        }),
      }),
    );

    expect(withReference.runs[childRunId]).toMatchObject({
      entries: [],
      runId: childRunId,
      scope: "subagent",
      sessionId: "session-1",
      status: "connecting",
    });

    const withChildEvent = reduceRunEvent(
      withReference,
      runEvent({
        event_id: 2,
        event_type: "text_delta",
        payload_json: JSON.stringify({
          text: "Now let me read all the core source files concurrently.",
        }),
        role_id: "Explorer",
        run_id: childRunId,
        trace_id: childRunId,
      }),
    );

    expect(withChildEvent.runs[childRunId]).toMatchObject({
      runId: childRunId,
      scope: "subagent",
      status: "open",
    });
    expect(withChildEvent.runs[childRunId].entries).toHaveLength(1);
    expect(withChildEvent.runs[childRunId].entries[0]).toMatchObject({
      roleId: "Explorer",
      text: "Now let me read all the core source files concurrently.",
    });
  });

  it("reduces AG-UI envelopes without reparsing payload JSON", () => {
    const state = reduceRunEvent(initialRuntimeState, agUiEvent());

    expect(state.runs["run-1"].entries[0]).toMatchObject({
      sessionId: "session-1",
      text: "hello from ag-ui",
      eventId: 12,
    });
  });

  it("preserves every runtime event kind so replay cannot drop new server events", () => {
    const eventTypes = [
      "model_step_started",
      "model_step_finished",
      "generation_progress",
      "thinking_started",
      "thinking_delta",
      "thinking_finished",
      "tool_call",
      "tool_call_batch_sealed",
      "tool_input_validation_failed",
      "tool_result",
      "spec_checkpoint_applied",
      "spec_checkpoint_evaluated",
      "injection_enqueued",
      "injection_applied",
      "tool_approval_requested",
      "tool_approval_resolved",
      "user_question_requested",
      "user_question_answered",
      "notification_requested",
      "todo_updated",
      "background_task_started",
      "background_task_updated",
      "background_task_completed",
      "background_task_stopped",
      "monitor_created",
      "monitor_triggered",
      "monitor_stopped",
      "subagent_session_status_changed",
      "subagent_stopped",
      "subagent_resumed",
      "awaiting_manual_action",
      "llm_retry_scheduled",
      "llm_retry_exhausted",
      "llm_fallback_activated",
      "llm_fallback_exhausted",
      "state_snapshot",
      "state_delta",
      "runtime_guardrail_alert",
      "runtime_guardrail_report",
      "token_usage",
      "hook_matched",
      "hook_started",
      "hook_completed",
      "hook_failed",
      "hook_conflict",
      "hook_decision_applied",
      "hook_deferred",
      "unknown_future_event",
    ] as const;

    const state = eventTypes.reduce(
      (currentState, eventType, index) =>
        reduceRunEvent(
          currentState,
          runEvent({
            event_id: index + 1,
            event_type: eventType,
            payload_json: JSON.stringify({
              title: `${eventType} visible`,
            }),
          }),
        ),
      initialRuntimeState,
    );

    const entries = state.runs["run-1"].entries;
    expect(entries.map((entry) => entry.kind)).toEqual([...eventTypes]);
    expect(entries.map((entry) => entry.text)).toEqual(
      eventTypes.map((eventType) => `${eventType} visible`),
    );
  });
});

function runEvent(overrides: Partial<RelayRunEvent>): RelayRunEvent {
  return {
    session_id: "session-1",
    run_id: "run-1",
    trace_id: "run-1",
    event_type: "text_delta",
    payload_json: "{}",
    event_id: 1,
    occurred_at: "2026-06-23T00:00:00Z",
    ...overrides,
  };
}

function agUiEvent(): AgUiRunEvent {
  return {
    type: "message.text.delta",
    session_id: "session-1",
    run_id: "run-1",
    trace_id: "run-1",
    relay_event_type: "text_delta",
    payload: { text: "hello from ag-ui" },
    event_id: 12,
    occurred_at: "2026-06-23T00:00:00Z",
  };
}
