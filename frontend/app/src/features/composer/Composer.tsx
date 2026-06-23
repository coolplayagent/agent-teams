import {
  App,
  Button,
  Checkbox,
  Segmented,
  Select,
  Space,
  Switch,
  Tooltip,
  Typography,
} from "antd";
import { Sender } from "@ant-design/x";
import type { SenderRef } from "@ant-design/x/es/sender";
import { Pause, Play, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createRun,
  getGeneralConfig,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfigOptions,
  getSession,
  injectRunMessage,
  stopRun,
  updateSessionTopology,
  updateSessionNormalModelProfile,
} from "../../api/client";
import type {
  InjectionDeliveryMode,
  ModelProfilesPayload,
  OrchestrationConfig,
  RoleOption,
  RoleConfigOptions,
  RunCreateRequest,
  RunThinkingConfig,
  SessionMode,
  SessionRecord,
  ThinkingEffort,
} from "../../api/contracts";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import {
  buildPromptInputParts,
  PromptAttachments,
  readPastedImageAttachments,
  type PromptAttachment,
} from "./PromptAttachments";

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
const DEFAULT_MODEL_PROFILE_OPTION = { label: "Default", value: "" };
const SESSION_MODE_OPTIONS: Array<{ label: string; value: SessionMode }> = [
  { label: "Normal", value: "normal" },
  { label: "Orchestration", value: "orchestration" },
];

interface ModelProfileOption {
  label: string;
  value: string;
}

interface TopologyPatch {
  sessionMode: SessionMode;
  normalRootRoleId: string | null;
  orchestrationPresetId: string | null;
}

function sessionDetailQueryKey(sessionId: string) {
  return ["sessions", "detail", sessionId] as const;
}

function sessionTopologyLockQueryKey(sessionId: string | null) {
  return ["sessions", "topology-lock", sessionId] as const;
}

export function Composer({ runStreamController, sessionId }: ComposerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const inputRef = useRef<SenderRef | null>(null);
  const [draft, setDraft] = useState("");
  const [promptAttachments, setPromptAttachments] = useState<PromptAttachment[]>([]);
  const [composerStatus, setComposerStatus] = useState("");
  const [yolo, setYolo] = useState(true);
  const [shellSafetyPolicyEnabled, setShellSafetyPolicyEnabled] =
    useState(true);
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
  const sessionQuery = useQuery({
    queryKey:
      sessionId === null
        ? ["sessions", "detail", null]
        : sessionDetailQueryKey(sessionId),
    queryFn: () => {
      if (sessionId === null) {
        throw new Error("Session is required.");
      }
      return getSession(sessionId);
    },
    enabled: sessionId !== null,
    staleTime: 10000,
  });
  const topologyLockQuery = useQuery({
    queryKey: sessionTopologyLockQueryKey(sessionId),
    queryFn: () => false,
    enabled: false,
    initialData: false,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const generalConfigQuery = useQuery({
    queryKey: ["settings", "general"],
    queryFn: getGeneralConfig,
    staleTime: 30000,
  });
  const modelProfilesQuery = useQuery({
    queryKey: ["model-profiles"],
    queryFn: getModelProfiles,
    staleTime: 30000,
  });
  const orchestrationQuery = useQuery({
    queryKey: ["orchestration", "config"],
    queryFn: getOrchestrationConfig,
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
  const normalRootRoleOptions = useMemo(
    () =>
      (roleOptionsQuery.data?.normal_mode_roles ?? [])
        .map((role) => ({
          label: role.name || role.role_id,
          value: normalizeProfileName(role.role_id),
        }))
        .filter((role) => role.value.length > 0),
    [roleOptionsQuery.data?.normal_mode_roles],
  );
  const orchestrationPresetOptions = useMemo(
    () => buildOrchestrationPresetOptions(orchestrationQuery.data),
    [orchestrationQuery.data],
  );
  const selectedSessionMode = sessionQuery.data?.session_mode ?? "normal";
  const selectedNormalRootRoleId = resolveSelectedNormalRootRoleId(
    sessionQuery.data?.normal_root_role_id,
    normalRootRoleOptions,
  );
  const selectedOrchestrationPresetId = resolveSelectedOrchestrationPresetId(
    sessionQuery.data?.orchestration_preset_id,
    orchestrationQuery.data,
  );
  const selectedModelProfile =
    sessionQuery.data === undefined
      ? null
      : normalizeProfileName(sessionQuery.data.normal_model_profile);
  const modelProfileOptions = useMemo(
    () => buildModelProfileOptions(modelProfilesQuery.data, selectedModelProfile ?? ""),
    [modelProfilesQuery.data, selectedModelProfile],
  );
  const attachmentValidationMessage = resolveImageInputBlockedMessage({
    activeRunId,
    attachments: promptAttachments,
    modelProfiles: modelProfilesQuery.data,
    roleOptions: roleOptionsQuery.data,
    selectedModelProfile,
    selectedNormalRootRoleId,
    selectedSessionMode,
    targetRoleId,
  });
  const displayedComposerStatus = attachmentValidationMessage || composerStatus;

  useEffect(() => {
    if (generalConfigQuery.data !== undefined) {
      setShellSafetyPolicyEnabled(
        generalConfigQuery.data.shell_safety_policy_enabled !== false,
      );
    }
  }, [generalConfigQuery.data]);

  const createRunMutation = useMutation({
    mutationFn: async () => {
      if (sessionId === null) {
        throw new Error("Select a session before sending.");
      }
      const inputParts = buildPromptInputParts(draft, promptAttachments);
      const request: RunCreateRequest = {
        session_id: sessionId,
        input: inputParts,
        display_input: inputParts,
        target_role_id: targetRoleId,
        thinking,
        yolo,
      };
      if (generalConfigQuery.data !== undefined) {
        request.shell_safety_policy_enabled = shellSafetyPolicyEnabled;
      }
      return createRun(request);
    },
    onSuccess: (result) => {
      setDraft("");
      setPromptAttachments([]);
      setComposerStatus("");
      queryClient.setQueryData(sessionTopologyLockQueryKey(result.session_id), true);
      queryClient.setQueryData<SessionRecord | undefined>(
        sessionDetailQueryKey(result.session_id),
        (current) =>
          current === undefined ? current : { ...current, can_switch_mode: false },
      );
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

  const updateModelProfileMutation = useMutation({
    mutationFn: async (modelProfile: string) => {
      if (sessionId === null) {
        throw new Error("Select a session before changing the model.");
      }
      return updateSessionNormalModelProfile(
        sessionId,
        normalizeProfileName(modelProfile) || null,
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(sessionDetailQueryKey(updated.session_id), updated);
      void queryClient.invalidateQueries({
        queryKey: sessionDetailQueryKey(updated.session_id),
      });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void message.success(
        updated.normal_model_profile
          ? `Model profile set to ${updated.normal_model_profile}.`
          : "Model profile reset.",
      );
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : "Model profile update failed.",
      );
    },
  });

  const updateTopologyMutation = useMutation({
    mutationFn: async (patch: TopologyPatch) => {
      if (sessionId === null) {
        throw new Error("Select a session before changing mode.");
      }
      return updateSessionTopology(sessionId, {
        session_mode: patch.sessionMode,
        normal_root_role_id:
          patch.sessionMode === "normal" ? patch.normalRootRoleId : null,
        orchestration_preset_id:
          patch.sessionMode === "orchestration"
            ? patch.orchestrationPresetId
            : null,
      });
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(sessionDetailQueryKey(updated.session_id), updated);
      void queryClient.invalidateQueries({
        queryKey: sessionDetailQueryKey(updated.session_id),
      });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      void message.success("Session topology updated.");
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : "Session mode update failed.",
      );
    },
  });

  const busy =
    createRunMutation.isPending ||
    stopRunMutation.isPending ||
    injectMessageMutation.isPending ||
    updateModelProfileMutation.isPending ||
    updateTopologyMutation.isPending;
  const canCreateRun =
    sessionId !== null &&
    activeRunId === null &&
    (draft.trim().length > 0 || promptAttachments.length > 0) &&
    !busy &&
    !attachmentValidationMessage;
  const canInject =
    activeRunId !== null &&
    draft.trim().length > 0 &&
    promptAttachments.length === 0 &&
    !busy;
  const canChangeModelProfile =
    sessionId !== null && sessionQuery.data !== undefined && !sessionQuery.isError;
  const isTopologyLocallyLocked = topologyLockQuery.data === true;
  const canOverrideShellSafetyPolicy =
    generalConfigQuery.data !== undefined && !generalConfigQuery.isError;
  const canChangeTopology =
    canChangeModelProfile &&
    activeRunId === null &&
    !isTopologyLocallyLocked &&
    sessionQuery.data?.can_switch_mode !== false;

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
        onPaste={(event) => {
          void handlePromptPaste(event);
        }}
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
      <PromptAttachments
        attachments={promptAttachments}
        hasError={Boolean(attachmentValidationMessage)}
        onRemove={(attachmentId) => {
          setPromptAttachments((current) =>
            current.filter((attachment) => attachment.id !== attachmentId),
          );
        }}
      />
      {displayedComposerStatus ? (
        <Typography.Text className="at-composer-status" type="danger">
          {displayedComposerStatus}
        </Typography.Text>
      ) : null}
      <div className="at-composer-controls">
        <Space className="at-composer-control-set" size={8} wrap>
          <Segmented<SessionMode>
            aria-label="Session mode"
            className="at-session-mode-control"
            disabled={!canChangeTopology}
            onChange={(mode) => {
              if (mode !== selectedSessionMode) {
                updateSessionTopologyMode(mode);
              }
            }}
            options={SESSION_MODE_OPTIONS.map((option) => ({
              ...option,
              disabled:
                option.value === "orchestration" &&
                orchestrationPresetOptions.length === 0,
            }))}
            size="small"
            value={selectedSessionMode}
          />
          <Select
            aria-label="Root role"
            className="at-normal-root-role-select"
            disabled={
              !canChangeTopology ||
              selectedSessionMode !== "normal" ||
              normalRootRoleOptions.length === 0
            }
            loading={roleOptionsQuery.isLoading || updateTopologyMutation.isPending}
            onChange={(roleId) => {
              const nextRoleId = normalizeProfileName(roleId);
              if (nextRoleId && nextRoleId !== selectedNormalRootRoleId) {
                updateSessionTopologyMode("normal", {
                  normalRootRoleId: nextRoleId,
                });
              }
            }}
            optionFilterProp="label"
            options={normalRootRoleOptions}
            placeholder="Root role"
            popupMatchSelectWidth={false}
            showSearch
            size="small"
            value={selectedNormalRootRoleId || undefined}
          />
          <Select
            aria-label="Orchestration preset"
            className="at-orchestration-preset-select"
            disabled={
              !canChangeTopology ||
              selectedSessionMode !== "orchestration" ||
              orchestrationPresetOptions.length === 0
            }
            loading={
              orchestrationQuery.isLoading || updateTopologyMutation.isPending
            }
            onChange={(presetId) => {
              const nextPresetId = normalizeProfileName(presetId);
              if (nextPresetId && nextPresetId !== selectedOrchestrationPresetId) {
                updateSessionTopologyMode("orchestration", {
                  orchestrationPresetId: nextPresetId,
                });
              }
            }}
            optionFilterProp="label"
            options={orchestrationPresetOptions}
            placeholder="Preset"
            popupMatchSelectWidth={false}
            showSearch
            size="small"
            value={selectedOrchestrationPresetId || undefined}
          />
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
          <Select
            allowClear
            aria-label="Model profile"
            className="at-model-profile-select"
            disabled={busy || activeRunId !== null || !canChangeModelProfile}
            loading={
              sessionQuery.isLoading ||
              modelProfilesQuery.isLoading ||
              updateModelProfileMutation.isPending
            }
            onChange={(value) => {
              const nextProfile = normalizeProfileName(value);
              if (
                selectedModelProfile !== null &&
                nextProfile !== selectedModelProfile
              ) {
                updateModelProfileMutation.mutate(nextProfile);
              }
            }}
            optionFilterProp="label"
            options={modelProfileOptions}
            placeholder="Model"
            popupMatchSelectWidth={false}
            showSearch
            size="small"
            value={selectedModelProfile ?? undefined}
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
            aria-label="Shell safety policy"
            checked={shellSafetyPolicyEnabled}
            disabled={
              busy || activeRunId !== null || !canOverrideShellSafetyPolicy
            }
            onChange={(event) =>
              setShellSafetyPolicyEnabled(event.target.checked)
            }
          >
            Shell safety
          </Checkbox>
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

  async function handlePromptPaste(event: ClipboardEvent<HTMLElement>) {
    try {
      const attachments = await readPastedImageAttachments(event);
      if (attachments.length === 0) {
        return;
      }
      setComposerStatus("");
      setPromptAttachments((current) => [...current, ...attachments]);
      inputRef.current?.focus();
    } catch (error) {
      setComposerStatus(
        error instanceof Error ? error.message : "Failed to read pasted image.",
      );
    }
  }

  function updateSessionTopologyMode(
    sessionMode: SessionMode,
    overrides: Partial<Omit<TopologyPatch, "sessionMode">> = {},
  ) {
    const normalRootRoleId = normalizeOptionalId(
      overrides.normalRootRoleId ?? selectedNormalRootRoleId,
    );
    const orchestrationPresetId = normalizeOptionalId(
      overrides.orchestrationPresetId ?? selectedOrchestrationPresetId,
    );
    if (sessionMode === "normal" && !normalRootRoleId) {
      void message.warning("No root role is available.");
      return;
    }
    if (sessionMode === "orchestration" && !orchestrationPresetId) {
      void message.warning("No orchestration preset is available.");
      return;
    }
    updateTopologyMutation.mutate({
      sessionMode,
      normalRootRoleId,
      orchestrationPresetId,
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

function buildModelProfileOptions(
  profiles: ModelProfilesPayload | undefined,
  selectedProfile: string,
): ModelProfileOption[] {
  const profileOptions = Object.entries(profiles ?? {})
    .map(([name, profile]) => {
      const profileName = normalizeProfileName(name);
      const modelName = normalizeProfileName(profile.model);
      return {
        label: modelName ? `${profileName} - ${modelName}` : profileName,
        value: profileName,
      };
    })
    .filter((profile) => profile.value.length > 0)
    .sort((left, right) => left.value.localeCompare(right.value));
  const options = [DEFAULT_MODEL_PROFILE_OPTION, ...profileOptions];
  const knownProfiles = new Set(options.map((option) => option.value));
  if (selectedProfile && !knownProfiles.has(selectedProfile)) {
    options.push({
      label: `${selectedProfile} (missing)`,
      value: selectedProfile,
    });
  }
  return options;
}

function resolveImageInputBlockedMessage({
  activeRunId,
  attachments,
  modelProfiles,
  roleOptions,
  selectedModelProfile,
  selectedNormalRootRoleId,
  selectedSessionMode,
  targetRoleId,
}: {
  activeRunId: string | null;
  attachments: PromptAttachment[];
  modelProfiles: ModelProfilesPayload | undefined;
  roleOptions: RoleConfigOptions | undefined;
  selectedModelProfile: string | null;
  selectedNormalRootRoleId: string;
  selectedSessionMode: SessionMode;
  targetRoleId: string | null;
}): string {
  if (attachments.length === 0) {
    return "";
  }
  if (activeRunId !== null) {
    return "Runtime injections support text only.";
  }
  const resolvedTargetRoleId = resolveValidationRoleId(
    selectedSessionMode,
    roleOptions,
    selectedNormalRootRoleId,
    targetRoleId,
  );
  if (!resolvedTargetRoleId) {
    return "";
  }
  const selectedProfileSupport =
    selectedSessionMode === "normal"
      ? resolveModelProfileInputModalitySupport(
          modelProfiles,
          selectedModelProfile,
          "image",
        )
      : { label: "", support: null };
  const roleSupport = resolveRoleInputModalitySupport(
    roleOptions,
    resolvedTargetRoleId,
    "image",
  );
  const imageSupport = selectedProfileSupport.support ?? roleSupport.support;
  if (imageSupport === true) {
    return "";
  }
  const targetLabel =
    selectedProfileSupport.label ||
    roleSupport.label ||
    resolvedTargetRoleId ||
    "the selected agent";
  if (imageSupport === null) {
    return `Image input support for ${targetLabel} is unknown.`;
  }
  return `${targetLabel} does not support image input.`;
}

function resolveValidationRoleId(
  sessionMode: SessionMode,
  roleOptions: RoleConfigOptions | undefined,
  selectedNormalRootRoleId: string,
  targetRoleId: string | null,
): string {
  if (sessionMode === "normal") {
    return (
      normalizeProfileName(targetRoleId) ||
      resolvePrimaryRoleId(sessionMode, roleOptions, selectedNormalRootRoleId)
    );
  }
  return resolvePrimaryRoleId(sessionMode, roleOptions, selectedNormalRootRoleId);
}

function resolveModelProfileInputModalitySupport(
  profiles: ModelProfilesPayload | undefined,
  selectedProfile: string | null,
  modality: "image",
): { label: string; support: boolean | null } {
  const profileName = normalizeProfileName(selectedProfile);
  if (!profileName) {
    return { label: "", support: null };
  }
  const profile = profiles?.[profileName];
  if (profile === undefined) {
    return { label: profileName, support: null };
  }
  const inputModalities = normalizeInputModalities(profile.input_modalities);
  if (inputModalities !== null) {
    return {
      label: normalizeProfileName(profile.model) || profileName,
      support: inputModalities.includes(modality),
    };
  }
  return {
    label: normalizeProfileName(profile.model) || profileName,
    support:
      resolveCapabilityInputSupport(profile.resolved_capabilities?.input, modality) ??
      resolveCapabilityInputSupport(profile.capabilities?.input, modality),
  };
}

function resolveRoleInputModalitySupport(
  roleOptions: RoleConfigOptions | undefined,
  roleId: string,
  modality: "image",
): { label: string; support: boolean | null } {
  const role = findRoleOption(roleOptions, roleId);
  if (role === undefined) {
    return { label: roleId, support: null };
  }
  const label =
    normalizeProfileName(role.model_name) ||
    normalizeProfileName(role.model_profile) ||
    normalizeProfileName(role.name) ||
    role.role_id;
  const capabilitySupport = resolveCapabilityInputSupport(
    role.capabilities?.input,
    modality,
  );
  if (capabilitySupport !== null) {
    return { label, support: capabilitySupport };
  }
  const inputModalities = normalizeInputModalities(role.input_modalities);
  return {
    label,
    support: inputModalities === null ? null : inputModalities.includes(modality),
  };
}

function resolvePrimaryRoleId(
  sessionMode: SessionMode,
  roleOptions: RoleConfigOptions | undefined,
  selectedNormalRootRoleId: string,
): string {
  if (sessionMode === "orchestration") {
    return (
      normalizeProfileName(roleOptions?.coordinator_role_id) ||
      normalizeProfileName(roleOptions?.coordinator_role?.role_id)
    );
  }
  return (
    normalizeProfileName(selectedNormalRootRoleId) ||
    normalizeProfileName(roleOptions?.main_agent_role_id) ||
    normalizeProfileName(roleOptions?.main_agent_role?.role_id) ||
    "MainAgent"
  );
}

function findRoleOption(
  roleOptions: RoleConfigOptions | undefined,
  roleId: string,
): RoleOption | undefined {
  const normalizedRoleId = normalizeProfileName(roleId);
  return [
    roleOptions?.coordinator_role,
    roleOptions?.main_agent_role,
    ...(roleOptions?.normal_mode_roles ?? []),
    ...(roleOptions?.subagent_roles ?? []),
  ]
    .filter((option): option is RoleOption => option !== null && option !== undefined)
    .find((option) => option.role_id === normalizedRoleId);
}

function resolveCapabilityInputSupport(
  inputCapabilities: { image?: boolean | null } | undefined,
  modality: "image",
): boolean | null {
  const support = inputCapabilities?.[modality];
  return typeof support === "boolean" ? support : null;
}

function normalizeInputModalities(inputModalities: string[] | undefined): string[] | null {
  if (!Array.isArray(inputModalities)) {
    return null;
  }
  return inputModalities
    .map((modality) => modality.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeProfileName(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  return normalizeProfileName(value) || null;
}

function buildOrchestrationPresetOptions(
  config: OrchestrationConfig | undefined,
): ModelProfileOption[] {
  return (config?.presets ?? [])
    .map((preset) => {
      const presetId = normalizeProfileName(preset.preset_id);
      const label = normalizeProfileName(preset.name) || presetId;
      return {
        label: label !== presetId ? `${label} - ${presetId}` : label,
        value: presetId,
      };
    })
    .filter((preset) => preset.value.length > 0)
    .sort((left, right) => left.label.localeCompare(right.label));
}

function resolveSelectedNormalRootRoleId(
  currentRoleId: string | null | undefined,
  options: ModelProfileOption[],
): string {
  const normalized = normalizeProfileName(currentRoleId);
  if (normalized && options.some((option) => option.value === normalized)) {
    return normalized;
  }
  return options[0]?.value ?? "";
}

function resolveSelectedOrchestrationPresetId(
  currentPresetId: string | null | undefined,
  config: OrchestrationConfig | undefined,
): string {
  const presets = config?.presets ?? [];
  const normalized = normalizeProfileName(currentPresetId);
  if (
    normalized &&
    presets.some((preset) => normalizeProfileName(preset.preset_id) === normalized)
  ) {
    return normalized;
  }
  const defaultPresetId = normalizeProfileName(
    config?.default_orchestration_preset_id,
  );
  if (
    defaultPresetId &&
    presets.some((preset) => normalizeProfileName(preset.preset_id) === defaultPresetId)
  ) {
    return defaultPresetId;
  }
  return normalizeProfileName(presets[0]?.preset_id);
}
