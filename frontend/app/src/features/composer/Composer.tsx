import { App, Button, Checkbox, Space, Tooltip } from "antd";
import { Sender } from "@ant-design/x";
import type { SenderRef } from "@ant-design/x/es/sender";
import { Pause, Play, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createRun, stopRun } from "../../api/client";
import { openRunStream, type RunStreamHandle } from "../../runtime/streamClient";
import { useRuntimeStore } from "../../runtime/runtimeStore";

interface ComposerProps {
  sessionId: string | null;
}

export function Composer({ sessionId }: ComposerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const inputRef = useRef<SenderRef | null>(null);
  const streamHandleRef = useRef<RunStreamHandle | null>(null);
  const runtimeState = useRuntimeStore((state) => state.runtimeState);
  const setRuntimeState = useRuntimeStore((state) => state.setRuntimeState);
  const runtimeStateRef = useRef(runtimeState);
  const [draft, setDraft] = useState("");
  const [yolo, setYolo] = useState(true);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    runtimeStateRef.current = runtimeState;
  }, [runtimeState]);

  useEffect(
    () => () => {
      streamHandleRef.current?.close();
    },
    [],
  );

  const createRunMutation = useMutation({
    mutationFn: async () => {
      if (sessionId === null) {
        throw new Error("Select a session before sending.");
      }
      return createRun({
        session_id: sessionId,
        input: [{ kind: "text", text: draft.trim() }],
        display_input: [{ kind: "text", text: draft.trim() }],
        yolo,
      });
    },
    onSuccess: (result) => {
      setDraft("");
      setActiveRunId(result.run_id);
      streamHandleRef.current?.close();
      streamHandleRef.current = openRunStream({
        runId: result.run_id,
        afterEventId: runtimeStateRef.current.runs[result.run_id]?.lastEventId ?? 0,
        initialState: runtimeStateRef.current,
        onState: (nextRuntimeState) => {
          setRuntimeState(nextRuntimeState);
        },
        onClosed: () => {
          setActiveRunId(null);
          void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "messages"] });
          void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
          void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
        },
        onError: (errorMessage) => {
          void message.error(errorMessage);
        },
      });
      void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "messages"] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : "Run creation failed.");
    },
  });

  const stopRunMutation = useMutation({
    mutationFn: async () => {
      if (activeRunId === null) {
        throw new Error("No active run to stop.");
      }
      return stopRun(activeRunId);
    },
    onSuccess: () => {
      setActiveRunId(null);
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      if (sessionId !== null) {
        void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      }
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : "Stop failed.");
    },
  });

  const busy = createRunMutation.isPending || stopRunMutation.isPending;
  const canSend =
    sessionId !== null && activeRunId === null && draft.trim().length > 0 && !busy;

  return (
    <form
      className="at-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) {
          createRunMutation.mutate();
        }
      }}
    >
      <Sender
        ref={inputRef}
        aria-label="Prompt"
        autoSize={{ minRows: 1, maxRows: 7 }}
        disabled={busy || sessionId === null}
        className="at-composer-sender"
        loading={createRunMutation.isPending}
        onChange={setDraft}
        onSubmit={() => {
          if (canSend) {
            createRunMutation.mutate();
          }
        }}
        placeholder="What would you like the agents to do?"
        submitType="enter"
        value={draft}
        actions={false}
      />
      <div className="at-composer-controls">
        <Space size={8}>
          <Checkbox checked={yolo} onChange={(event) => setYolo(event.target.checked)}>
            YOLO
          </Checkbox>
          <span className="at-composer-hint">Enter to send, Shift+Enter for newline</span>
        </Space>
        <Space size={8}>
          {activeRunId !== null ? (
            <Tooltip title="Stop run">
              <Button
                danger
                icon={<Pause size={16} />}
                loading={stopRunMutation.isPending}
                onClick={() => stopRunMutation.mutate()}
              >
                Stop
              </Button>
            </Tooltip>
          ) : null}
          <Button
            htmlType="submit"
            icon={sessionId === null ? <Play size={16} /> : <Send size={16} />}
            loading={createRunMutation.isPending}
            type="primary"
            disabled={!canSend}
          >
            Send
          </Button>
        </Space>
      </div>
    </form>
  );
}
