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
        instance_id: "worker-1",
        message: { parts: [
          { content: "Inspecting", part_kind: "thinking" },
          { args: { path: "src" }, part_kind: "tool-call", tool_name: "read" },
          { content: "Done", part_kind: "text" },
        ] },
        role_id: "Explorer",
      }],
      created_at: "2026-07-11T00:00:00Z",
      injection_messages: [{
        content: "Check tests too",
        created_at: "2026-07-11T00:00:01Z",
        source: "user",
      }],
      intent: "Review exports",
      run_id: "run-1",
      run_status: "completed",
    }], "2026-07-11T01:00:00Z");

    expect(transcript.schema).toBe(MESSAGE_TRANSCRIPT_SCHEMA);
    expect(transcript.version).toBe(1);
    expect(transcript.entries.map((entry) => entry.kind)).toEqual([
      "user", "injection", "thinking", "tool", "subagent", "status",
    ]);
    expect(transcript.entries.map((entry) => entry.sequence)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(transcript.entries[3]?.metadata.tool?.args).toEqual({ path: "src" });
  });

  it("classifies questions from main agents and subagents", () => {
    const transcript = buildMessageTranscript("session-1", [{
      coordinator_messages: [{
        instance_id: "worker-1",
        message: { parts: [{
          args: { question: "Continue?" },
          part_kind: "tool-call",
          tool_name: "ask_question",
        }] },
        role_id: "Worker",
      }],
      run_id: "run-1",
    }]);
    expect(transcript.entries).toHaveLength(1);
    expect(transcript.entries[0]?.kind).toBe("question");
    expect(transcript.entries[0]?.metadata.instanceId).toBe("worker-1");
  });

  it("serializes a versioned structured JSON document", () => {
    const json = serializeMessageTranscript(buildMessageTranscript("session-1", [], "fixed"));
    expect(JSON.parse(json)).toEqual({
      entries: [],
      exportedAt: "fixed",
      rounds: [],
      schema: "relay-teams.session-transcript",
      sessionId: "session-1",
      version: 1,
    });
  });
});
