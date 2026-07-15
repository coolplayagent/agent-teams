import { describe, expect, it } from "vitest";

import {
  buildMessageTranscript,
  MESSAGE_TRANSCRIPT_SCHEMA,
  serializeMessageTranscript,
} from "../features/shell/messageTranscript";

describe("messageTranscript", () => {
  it("normalizes interleaved messages into a stable semantic timeline", () => {
    const transcript = buildMessageTranscript("session-1", [{
      coordinator_messages: [{
        created_at: "2026-07-11T00:00:02Z",
        instance_id: "main-1",
        message: { parts: [
          { content: "Inspecting", part_kind: "thinking" },
          {
            action_family: "read",
            args: { path: "src" },
            part_kind: "tool-call",
            semantic_category: "file-read",
            tool_name: "read",
          },
          { content: "Done", part_kind: "text" },
        ] },
        role: "assistant",
        role_id: "Explorer",
      }],
      created_at: "2026-07-11T00:00:00Z",
      injection_messages: [{
        content: "Check tests too",
        created_at: "2026-07-11T00:00:01Z",
        source: "user",
      }],
      intent: "Review exports",
      primary_instance_id: "main-1",
      run_id: "run-1",
      run_status: "completed",
    }], "2026-07-11T01:00:00Z");

    expect(transcript.schema).toBe(MESSAGE_TRANSCRIPT_SCHEMA);
    expect(transcript.version).toBe(2);
    expect(transcript.entries.map((entry) => entry.kind)).toEqual([
      "user", "injection", "thinking", "tool", "assistant", "status",
    ]);
    expect(transcript.entries.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(transcript.entries[3]?.metadata.tool?.args).toEqual({ path: "src" });
    expect(transcript.entries[3]?.metadata.tool).toMatchObject({
      actionFamily: "read",
      semanticCategory: "file-read",
    });
  });

  it("keeps question-like tool names generic without an explicit question contract", () => {
    const transcript = buildMessageTranscript("session-1", [{
      coordinator_messages: [
        {
          created_at: "2026-07-11T00:00:01Z",
          instance_id: "main-1",
          message: { parts: [{
            action_family: "generic",
            args: { question: "Continue?" },
            part_kind: "tool-call",
            semantic_category: "interactive",
            tool_name: "ask_question",
          }] },
          entry_type: "subagent_question",
          role: "assistant",
          role_id: "Main Agent",
          source: "subagent",
        },
        {
          created_at: "2026-07-11T00:00:02Z",
          instance_id: "worker-1",
          message: { parts: [{
            action_family: "generic",
            args: { question: "Choose a direction" },
            part_kind: "tool-call",
            semantic_category: "interactive",
            tool_name: "request_user_input",
          }] },
          role: "assistant",
          role_id: "Worker",
        },
      ],
      instance_role_map: { "main-1": "Main Agent", "worker-1": "Worker" },
      primary_instance_id: "main-1",
      run_id: "run-1",
    }]);
    expect(transcript.entries).toHaveLength(2);
    expect(transcript.entries.map((entry) => entry.kind)).toEqual(["tool", "tool"]);
    expect(transcript.entries.map((entry) => entry.metadata.actor)).toEqual([
      "assistant",
      "subagent",
    ]);
    expect(transcript.entries.map((entry) => entry.metadata.tool?.name)).toEqual([
      "ask_question",
      "request_user_input",
    ]);
  });

  it("does not classify a main agent as a subagent merely because it has an instance id", () => {
    const transcript = buildMessageTranscript("session-1", [{
      coordinator_messages: [{
        content: "Main response",
        instance_id: "main-instance",
        role: "assistant",
      }],
      run_id: "run-1",
    }]);

    expect(transcript.entries).toEqual([
      expect.objectContaining({
        kind: "assistant",
        metadata: expect.objectContaining({ actor: "assistant" }),
        text: "Main response",
      }),
    ]);
  });

  it("places applied insertions at their replay position and uses structured sender identity", () => {
    const transcript = buildMessageTranscript("session-1", [{
      coordinator_messages: [
        {
          content: "Before insertion",
          created_at: "2026-07-11T00:00:01Z",
          instance_id: "main-1",
          role: "assistant",
        },
        {
          content: "After insertion",
          created_at: "2026-07-11T00:00:03Z",
          instance_id: "main-1",
          role: "assistant",
        },
      ],
      injection_messages: [{
        applied_at: "2026-07-11T00:00:02Z",
        content: "Check the failing test",
        sender_instance_id: "worker-1",
        sender_role_id: "Worker",
      }],
      instance_role_map: { "main-1": "Main Agent", "worker-1": "Worker" },
      primary_instance_id: "main-1",
      run_id: "run-1",
    }]);

    expect(transcript.entries.map((entry) => entry.text)).toEqual([
      "Before insertion",
      "Check the failing test",
      "After insertion",
    ]);
    expect(transcript.entries[1]).toMatchObject({
      createdAt: "2026-07-11T00:00:02Z",
      kind: "injection",
      label: "Subagent injection",
      metadata: {
        actor: "subagent",
        senderInstanceId: "worker-1",
        senderRoleId: "Worker",
      },
    });
  });

  it("serializes a versioned structured JSON document", () => {
    const json = serializeMessageTranscript(buildMessageTranscript("session-1", [], "fixed"));
    expect(JSON.parse(json)).toEqual({
      entries: [],
      exportedAt: "fixed",
      rounds: [],
      schema: "relay-teams.session-transcript",
      sessionId: "session-1",
      version: 2,
    });
  });
});
