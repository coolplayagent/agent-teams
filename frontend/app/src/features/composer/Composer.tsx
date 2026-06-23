import { App, Button, Checkbox, Select, Space, Tooltip } from "antd";
import { Sender } from "@ant-design/x";
import type { SenderRef } from "@ant-design/x/es/sender";
import { Pause, Play, Send } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createRun, getRoleConfigOptions, stopRun } from "../../api/client";
import type { RunStreamController } from "../../runtime/useRunStreamController";

interface ComposerProps {
  runStreamController: RunStreamController;
  sessionId: string | null;
}

export function Composer({ runStreamController, sessionId }: ComposerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const inputRef = useRef<SenderRef | null>(null);
  const [draft, setDraft] = useState("");
  const [yolo, setYolo] = useState(true);
  const [targetRoleId, setTargetRoleId] = useState<string | null>(null);
  const activeRunId = runStreamController.activeRunId;
  const roleOptionsQuery = useQuery({
    queryKey: ["roles", "options"],
    queryFn: getRoleConfigOptions,
    staleTime: 30000,
  });
  const roleOptions = useMemo(
    () =>
      (roleOptionsQuery.data?.normal_mode_roles ?? []).map((role) => ({
        label: role.name || role.role_id,
        value: role.role_id,
      })),
    [roleOptionsQuery.data?.normal_mode_roles],
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
        target_role_id: targetRoleId,
        yolo,
      });
    },
    onSuccess: (result) => {
      setDraft("");
      runStreamController.startRunStream({
        runId: result.run_id,
        sessionId: result.session_id,
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
      runStreamController.clearRunStream();
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
          <Select
            allowClear
            aria-label="Target role"
            className="at-role-select"
            disabled={busy || activeRunId !== null}
            loading={roleOptionsQuery.isLoading}
            onChange={(value) => setTargetRoleId(value ?? null)}
            optionFilterProp="label"
            options={roleOptions}
            placeholder="Role"
            showSearch
            size="small"
            value={targetRoleId ?? undefined}
          />
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
