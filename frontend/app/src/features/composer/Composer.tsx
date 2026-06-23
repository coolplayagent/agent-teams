import {
  App,
  Button,
  Checkbox,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { Sender } from "@ant-design/x";
import type { SenderRef } from "@ant-design/x/es/sender";
import { Pause, Play, Send } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createRun,
  getRoleConfigOptions,
  injectRunMessage,
  stopRun,
} from "../../api/client";
import type {
  InjectionDeliveryMode,
  RunThinkingConfig,
  ThinkingEffort,
} from "../../api/contracts";
import type { RunStreamController } from "../../runtime/useRunStreamController";

interface ComposerProps {
  runStreamController: RunStreamController;
  sessionId: string | null;
}

const THINKING_MODE_STORAGE_KEY = "agent_teams_thinking_enabled";
const THINKING_EFFORT_STORAGE_KEY = "agent_teams_thinking_effort";
const DEFAULT_THINKING_EFFORT: ThinkingEffort = "medium";
const THINKING_EFFORT_OPTIONS: Array<{ label: string; value: ThinkingEffort }> = [
  { label: "Minimal", value: "minimal" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
];

export function Composer({ runStreamController, sessionId }: ComposerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const inputRef = useRef<SenderRef | null>(null);
  const [draft, setDraft] = useState("");
  const [yolo, setYolo] = useState(true);
  const [thinking, setThinking] = useState<RunThinkingConfig>(() =>
    readSavedThinkingState(),
  );
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
        thinking,
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

  const injectMessageMutation = useMutation({
    mutationFn: async (mode: InjectionDeliveryMode) => {
      if (activeRunId === null) {
        throw new Error("No active run to inject into.");
      }
      const content = draft.trim();
      if (!content) {
        throw new Error("Injection content cannot be empty.");
      }
      return injectRunMessage(activeRunId, { content, mode });
    },
    onSuccess: () => {
      setDraft("");
      if (sessionId !== null) {
        void queryClient.invalidateQueries({ queryKey: ["sessions", sessionId, "recovery"] });
      }
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : "Injection failed.");
    },
  });

  const busy =
    createRunMutation.isPending ||
    stopRunMutation.isPending ||
    injectMessageMutation.isPending;
  const canCreateRun =
    sessionId !== null && activeRunId === null && draft.trim().length > 0 && !busy;
  const canInject = activeRunId !== null && draft.trim().length > 0 && !busy;

  return (
    <form
      className="at-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (canCreateRun) {
          createRunMutation.mutate();
          return;
        }
        if (canInject) {
          injectMessageMutation.mutate("queued");
        }
      }}
    >
      <Sender
        ref={inputRef}
        aria-label="Prompt"
        autoSize={{ minRows: 1, maxRows: 7 }}
        disabled={busy || sessionId === null}
        className="at-composer-sender"
        loading={createRunMutation.isPending || injectMessageMutation.isPending}
        onChange={setDraft}
        onSubmit={() => {
          if (canCreateRun) {
            createRunMutation.mutate();
            return;
          }
          if (canInject) {
            injectMessageMutation.mutate("queued");
          }
        }}
        placeholder="What would you like the agents to do?"
        submitType="enter"
        value={draft}
        actions={false}
      />
      <div className="at-composer-controls">
        <Space className="at-composer-control-set" size={8} wrap>
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
          <Space className="at-thinking-control" size={6}>
            <Typography.Text className="at-control-label" id="at-thinking-label">
              Thinking
            </Typography.Text>
            <Switch
              aria-labelledby="at-thinking-label"
              checked={thinking.enabled}
              disabled={busy || activeRunId !== null}
              onChange={(enabled) => updateThinking({ enabled })}
              size="small"
            />
            {thinking.enabled ? (
              <Select
                aria-label="Thinking effort"
                className="at-thinking-effort-select"
                disabled={busy || activeRunId !== null}
                onChange={(effort) => updateThinking({ effort })}
                options={THINKING_EFFORT_OPTIONS}
                popupMatchSelectWidth={false}
                size="small"
                value={thinking.effort ?? DEFAULT_THINKING_EFFORT}
              />
            ) : null}
          </Space>
          <Checkbox
            checked={yolo}
            disabled={busy || activeRunId !== null}
            onChange={(event) => setYolo(event.target.checked)}
          >
            YOLO
          </Checkbox>
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
          {activeRunId !== null ? (
            <>
              <Button
                disabled={!canInject}
                icon={<Send size={16} />}
                loading={
                  injectMessageMutation.isPending &&
                  injectMessageMutation.variables === "queued"
                }
                onClick={() => injectMessageMutation.mutate("queued")}
              >
                Queue
              </Button>
              <Button
                danger
                disabled={!canInject}
                icon={<Play size={16} />}
                loading={
                  injectMessageMutation.isPending &&
                  injectMessageMutation.variables === "interrupt"
                }
                onClick={() => injectMessageMutation.mutate("interrupt")}
              >
                Interrupt
              </Button>
            </>
          ) : (
            <Button
              htmlType="submit"
              icon={sessionId === null ? <Play size={16} /> : <Send size={16} />}
              loading={createRunMutation.isPending}
              type="primary"
              disabled={!canCreateRun}
            >
              Send
            </Button>
          )}
        </Space>
      </div>
    </form>
  );

  function updateThinking(nextState: Partial<RunThinkingConfig>) {
    setThinking((current) => {
      const updated = normalizeThinkingState({
        enabled: nextState.enabled ?? current.enabled,
        effort: nextState.effort ?? current.effort ?? DEFAULT_THINKING_EFFORT,
      });
      persistThinkingState(updated);
      return updated;
    });
  }
}

function readSavedThinkingState(): RunThinkingConfig {
  try {
    const storage = globalThis.localStorage;
    const enabled = storage.getItem(THINKING_MODE_STORAGE_KEY) === "true";
    const effort = normalizeThinkingEffort(
      storage.getItem(THINKING_EFFORT_STORAGE_KEY),
    );
    return { enabled, effort };
  } catch (_error) {
    return { enabled: false, effort: DEFAULT_THINKING_EFFORT };
  }
}

function persistThinkingState(state: RunThinkingConfig) {
  try {
    const storage = globalThis.localStorage;
    storage.setItem(THINKING_MODE_STORAGE_KEY, state.enabled ? "true" : "false");
    storage.setItem(
      THINKING_EFFORT_STORAGE_KEY,
      state.effort ?? DEFAULT_THINKING_EFFORT,
    );
  } catch (_error) {
    return;
  }
}

function normalizeThinkingState(state: RunThinkingConfig): RunThinkingConfig {
  return {
    enabled: state.enabled,
    effort: normalizeThinkingEffort(state.effort),
  };
}

function normalizeThinkingEffort(value: string | null | undefined): ThinkingEffort {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized === "minimal" || normalized === "low" || normalized === "high") {
    return normalized;
  }
  return DEFAULT_THINKING_EFFORT;
}
