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
import { Mic, MicOff, Pause, Play, Send } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent, KeyboardEvent } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

import {
  createRun,
  getCommandCatalog,
  getGeneralConfig,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfigOptions,
  getSession,
  injectRunMessage,
  resolveCommandPrompt,
  searchWorkspacePaths,
  stopRun,
  updateSessionTopology,
  updateSessionNormalModelProfile,
} from "../../api/client";
import type {
  InjectionDeliveryMode,
  ModelProfilesPayload,
  OrchestrationConfig,
  RecoverySnapshot,
  RoleOption,
  RoleConfigOptions,
  RunCreateRequest,
  RunThinkingConfig,
  SessionMode,
  SessionRecord,
  SessionSidebarRecord,
  ThinkingEffort,
  WorkspaceSearchResponse,
} from "../../api/contracts";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { useTranslations, type Translate } from "../../i18n";
import {
  buildPromptInputParts,
  PromptAttachments,
  readPastedImageAttachments,
  summarizePromptAttachments,
  type PromptAttachment,
} from "./PromptAttachments";
import { PromptMentionMenu } from "./PromptMentionMenu";
import {
  applyPromptCommandOption,
  applyPromptMentionOption,
  findPromptSlashMentionOptions,
  findLeadingRoleMentionOptions,
  findPromptResourceMentionOptions,
  getPromptCommandContext,
  getPromptResourceContext,
  parseLeadingRoleMention,
  resolvePromptSkillInvocation,
  type LeadingRoleMention,
  type PromptMentionOption,
  type PromptSkillMentionOption,
} from "./PromptMentions";
import { useVoiceInput } from "./useVoiceInput";

interface ComposerProps {
  runStreamController: RunStreamController;
  sessionId: string | null;
}

const THINKING_MODE_STORAGE_KEY = "agent_teams_thinking_enabled";
const THINKING_EFFORT_STORAGE_KEY = "agent_teams_thinking_effort";
const DEFAULT_THINKING_EFFORT: ThinkingEffort = "medium";

interface ModelProfileOption {
  label: string;
  value: string;
}

interface TopologyPatch {
  sessionMode: SessionMode;
  normalRootRoleId: string | null;
  orchestrationPresetId: string | null;
}

interface PromptSlashInvocation {
  args: string;
  rawText: string;
}

function sessionDetailQueryKey(sessionId: string) {
  return ["sessions", "detail", sessionId] as const;
}

function sessionTopologyLockQueryKey(sessionId: string | null) {
  return ["sessions", "topology-lock", sessionId] as const;
}

function sessionRecoveryQueryKey(sessionId: string) {
  return ["sessions", sessionId, "recovery"] as const;
}

function sessionsSidebarQueryKey() {
  return ["sessions", "sidebar"] as const;
}

function previewSessionTitleInSidebarCache(
  queryClient: QueryClient,
  sessionId: string,
  title: string,
  session: SessionRecord | undefined,
) {
  const safeSessionId = sessionId.trim();
  const safeTitle = title.trim();
  if (!safeSessionId || !safeTitle) {
    return;
  }
  const updatedAt = new Date().toISOString();
  queryClient.setQueryData<SessionSidebarRecord[] | undefined>(
    sessionsSidebarQueryKey(),
    (current) => {
      if (current === undefined) {
        return current;
      }
      const existingIndex = current.findIndex(
        (record) => record.session_id === safeSessionId,
      );
      if (existingIndex === -1) {
        const workspaceId = session?.workspace_id.trim() ?? "";
        if (!workspaceId) {
          return current;
        }
        return [
          ...current,
          sessionWithTitlePreview(
            {
              session_id: safeSessionId,
              workspace_id: workspaceId,
            },
            safeTitle,
            updatedAt,
          ),
        ];
      }
      return current.map((record, index) =>
        index === existingIndex
          ? sessionWithTitlePreview(record, safeTitle, updatedAt)
          : record,
      );
    },
  );
}

function sessionWithTitlePreview(
  session: SessionSidebarRecord,
  title: string,
  updatedAt: string,
): SessionSidebarRecord {
  return {
    ...session,
    metadata: {
      ...(session.metadata ?? {}),
      title,
    },
    title,
    updated_at: updatedAt,
  };
}

function promptResourceResponseForMentions({
  currentResponse,
  query,
  queryClient,
  workspaceId,
}: {
  currentResponse: WorkspaceSearchResponse | undefined;
  query: string;
  queryClient: QueryClient;
  workspaceId: string | null;
}): WorkspaceSearchResponse | undefined {
  if (currentResponse !== undefined && currentResponse.results.length > 0) {
    return currentResponse;
  }
  const safeWorkspaceId = workspaceId?.trim() ?? "";
  const safeQuery = query.trim();
  if (!safeWorkspaceId || !safeQuery) {
    return currentResponse;
  }
  const cachedResults = queryClient
    .getQueriesData<WorkspaceSearchResponse>({
      queryKey: ["workspaces", safeWorkspaceId, "prompt-resources"],
    })
    .flatMap(([, response]) => response?.results ?? []);
  const dedupedResults = dedupeWorkspaceSearchResults(cachedResults);
  if (dedupedResults.length === 0) {
    return currentResponse;
  }
  return {
    query: safeQuery,
    results: dedupedResults,
    workspace_id: safeWorkspaceId,
  };
}

function dedupeWorkspaceSearchResults(
  results: WorkspaceSearchResponse["results"],
): WorkspaceSearchResponse["results"] {
  const seen = new Set<string>();
  return results.filter((result) => {
    const key = `${result.kind}:${result.path.trim()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function Composer({ runStreamController, sessionId }: ComposerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const inputRef = useRef<SenderRef | null>(null);
  const sessionIdRef = useRef(sessionId);
  const [draft, setDraft] = useState("");
  const [promptAttachments, setPromptAttachments] = useState<PromptAttachment[]>([]);
  const [composerStatus, setComposerStatus] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dismissedMentionDraft, setDismissedMentionDraft] = useState("");
  const [yolo, setYolo] = useState(true);
  const [shellSafetyPolicyEnabled, setShellSafetyPolicyEnabled] =
    useState(true);
  const [thinking, setThinking] = useState<RunThinkingConfig>(() =>
    readSavedThinkingState(),
  );
  const [targetRoleId, setTargetRoleId] = useState<string | null>(null);
  const [selectedPromptSkill, setSelectedPromptSkill] =
    useState<PromptSkillMentionOption | null>(null);
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
  const promptCommandContext = useMemo(
    () =>
      activeRunId === null && dismissedMentionDraft !== draft
        ? getPromptCommandContext(draft)
        : null,
    [activeRunId, dismissedMentionDraft, draft],
  );
  const promptResourceContext = useMemo(
    () =>
      promptCommandContext === null &&
      activeRunId === null &&
      dismissedMentionDraft !== draft
        ? getPromptResourceContext(draft)
        : null,
    [activeRunId, dismissedMentionDraft, draft, promptCommandContext],
  );
  const sessionWorkspaceId = normalizeOptionalId(sessionQuery.data?.workspace_id);
  const commandCatalogQuery = useQuery({
    queryKey: ["commands", "catalog", "composer"],
    queryFn: getCommandCatalog,
    enabled: promptCommandContext !== null,
    staleTime: 30000,
  });
  const resourceSearchQuery = useQuery({
    queryKey: [
      "workspaces",
      sessionWorkspaceId,
      "prompt-resources",
      promptResourceContext?.query ?? "",
    ],
    queryFn: () => {
      if (sessionWorkspaceId === null || promptResourceContext === null) {
        throw new Error("Workspace and resource query are required.");
      }
      return searchWorkspacePaths(sessionWorkspaceId, promptResourceContext.query, 80);
    },
    enabled:
      sessionWorkspaceId !== null &&
      promptResourceContext !== null &&
      promptResourceContext.query.length > 0,
    staleTime: 30000,
  });
  const resourceResponseForMentions = useMemo(
    () =>
      promptResourceResponseForMentions({
        currentResponse: resourceSearchQuery.data,
        query: promptResourceContext?.query ?? "",
        queryClient,
        workspaceId: sessionWorkspaceId,
      }),
    [
      promptResourceContext?.query,
      queryClient,
      resourceSearchQuery.data,
      sessionWorkspaceId,
    ],
  );
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
    () => buildModelProfileOptions(
      modelProfilesQuery.data,
      selectedModelProfile ?? "",
      t,
    ),
    [modelProfilesQuery.data, selectedModelProfile, t],
  );
  const leadingRoleMention = useMemo(
    () => parseLeadingRoleMention(draft, roleOptionsQuery.data),
    [draft, roleOptionsQuery.data],
  );
  const leadingMentionOptions = useMemo(
    () =>
      activeRunId === null && dismissedMentionDraft !== draft
        ? findLeadingRoleMentionOptions(draft, roleOptionsQuery.data)
        : [],
    [activeRunId, dismissedMentionDraft, draft, roleOptionsQuery.data],
  );
  const commandMentionOptions = useMemo(
    () =>
      promptCommandContext === null
        ? []
        : findPromptSlashMentionOptions({
            catalog: commandCatalogQuery.data,
            query: promptCommandContext.query,
            roleOptions: roleOptionsQuery.data,
            workspaceId: sessionWorkspaceId,
          }),
    [
      commandCatalogQuery.data,
      promptCommandContext,
      roleOptionsQuery.data,
      sessionWorkspaceId,
    ],
  );
  const resourceMentionOptions = useMemo(
    () =>
      promptResourceContext === null
        ? []
        : findPromptResourceMentionOptions({
            query: promptResourceContext.query,
            resourceResponse: resourceResponseForMentions,
            roleOptions: roleOptionsQuery.data,
          }),
    [
      promptResourceContext,
      resourceResponseForMentions,
      roleOptionsQuery.data,
    ],
  );
  const promptMentionOptions =
    promptCommandContext !== null
      ? commandMentionOptions
      : promptResourceContext !== null
        ? resourceMentionOptions
        : leadingMentionOptions;
  const effectiveTargetRoleId = leadingRoleMention.roleId ?? targetRoleId;
  const effectivePromptText =
    leadingRoleMention.roleId === null ? draft.trim() : leadingRoleMention.promptText;
  const draftValidationMessage =
    activeRunId === null
      ? resolveDraftValidationMessage(leadingRoleMention, promptAttachments, t)
      : "";
  const attachmentValidationMessage = resolveImageInputBlockedMessage({
    activeRunId,
    attachments: promptAttachments,
    modelProfiles: modelProfilesQuery.data,
    roleOptions: roleOptionsQuery.data,
    selectedModelProfile,
    selectedNormalRootRoleId,
    selectedSessionMode,
    targetRoleId: effectiveTargetRoleId,
    t,
  });
  const displayedComposerStatus =
    draftValidationMessage || attachmentValidationMessage || composerStatus;

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (generalConfigQuery.data !== undefined) {
      setShellSafetyPolicyEnabled(
        generalConfigQuery.data.shell_safety_policy_enabled !== false,
      );
    }
  }, [generalConfigQuery.data]);

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [promptMentionOptions.length]);

  const createRunMutation = useMutation({
    mutationFn: async () => {
      if (sessionId === null) {
        throw new Error(t("composerSelectSessionBeforeSending"));
      }
      if (draftValidationMessage) {
        throw new Error(draftValidationMessage);
      }
      const resolvedPrompt = await resolveComposerPromptSubmission({
        promptText: effectivePromptText,
        roleOptions: roleOptionsQuery.data,
        selectedSkill: selectedPromptSkill,
        session: sessionQuery.data,
        sessionMode: selectedSessionMode,
        t,
      });
      const inputParts = buildPromptInputParts(
        resolvedPrompt.promptText,
        promptAttachments,
      );
      const request: RunCreateRequest = {
        session_id: sessionId,
        input: inputParts,
        display_input: inputParts,
        target_role_id: effectiveTargetRoleId,
        thinking,
        yolo,
      };
      if (resolvedPrompt.skills.length > 0) {
        request.skills = resolvedPrompt.skills;
      }
      if (generalConfigQuery.data !== undefined) {
        request.shell_safety_policy_enabled = shellSafetyPolicyEnabled;
      }
      const titlePreview =
        effectivePromptText || summarizePromptAttachments(promptAttachments);
      const result = await createRun(request);
      return { result, titlePreview };
    },
    onSuccess: ({ result, titlePreview }) => {
      setDraft("");
      setPromptAttachments([]);
      setSelectedPromptSkill(null);
      setComposerStatus("");
      queryClient.setQueryData(sessionTopologyLockQueryKey(result.session_id), true);
      queryClient.setQueryData<SessionRecord | undefined>(
        sessionDetailQueryKey(result.session_id),
        (current) =>
          current === undefined
            ? current
            : {
                ...current,
                can_switch_mode: false,
                title: titlePreview || current.title,
              },
      );
      previewSessionTitleInSidebarCache(
        queryClient,
        result.session_id,
        titlePreview,
        sessionQuery.data,
      );
      const foreground = sessionIdRef.current === result.session_id;
      runStreamController.startRunStream({
        ...(foreground ? {} : { foreground: false }),
        ...(titlePreview.trim().length > 0 ? { promptText: titlePreview } : {}),
        runId: result.run_id,
        sessionId: result.session_id,
        ...(result.target_role_id?.trim() ? { targetRoleId: result.target_role_id } : {}),
      });
      void queryClient.invalidateQueries({
        queryKey: ["sessions", result.session_id, "messages"],
      });
      void queryClient.invalidateQueries({ queryKey: sessionsSidebarQueryKey() });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("composerRunCreationFailed"));
    },
  });

  const stopRunMutation = useMutation({
    mutationFn: async (runId: string) => {
      return stopRun(runId);
    },
    onSuccess: (_result, runId) => {
      if (sessionId !== null) {
        queryClient.setQueryData<RecoverySnapshot | undefined>(
          sessionRecoveryQueryKey(sessionId),
          (current) =>
            current === undefined ? current : { ...current, active_run: null },
        );
      }
      runStreamController.clearRunStream({ suppressRunIds: [runId] });
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      if (sessionId !== null) {
        void queryClient.invalidateQueries({
          queryKey: sessionRecoveryQueryKey(sessionId),
        });
      }
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("composerStopFailed"));
    },
  });

  const injectMessageMutation = useMutation({
    mutationFn: async (mode: InjectionDeliveryMode) => {
      if (activeRunId === null) {
        throw new Error(t("composerNoActiveRunInject"));
      }
      const content = draft.trim();
      if (!content) {
        throw new Error(t("composerInjectEmpty"));
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
      void message.error(error instanceof Error ? error.message : t("composerInjectionFailed"));
    },
  });

  const updateModelProfileMutation = useMutation({
    mutationFn: async (modelProfile: string) => {
      if (sessionId === null) {
        throw new Error(t("composerSelectSessionBeforeModel"));
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
          ? t("composerModelProfileSet", { profile: updated.normal_model_profile })
          : t("composerModelProfileReset"),
      );
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("composerModelProfileUpdateFailed"),
      );
    },
  });

  const updateTopologyMutation = useMutation({
    mutationFn: async (patch: TopologyPatch) => {
      if (sessionId === null) {
        throw new Error(t("composerSelectSessionBeforeMode"));
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
      void message.success(t("composerSessionTopologyUpdated"));
    },
    onError: (error) => {
      void message.error(
        error instanceof Error ? error.message : t("composerTopologyUpdateFailed"),
      );
    },
  });

  const busy =
    createRunMutation.isPending ||
    stopRunMutation.isPending ||
    injectMessageMutation.isPending ||
    updateModelProfileMutation.isPending ||
    updateTopologyMutation.isPending;
  const hasCreateInput = effectivePromptText.length > 0 || promptAttachments.length > 0;
  const canCreateRun =
    sessionId !== null &&
    activeRunId === null &&
    hasCreateInput &&
    !busy &&
    !draftValidationMessage &&
    !attachmentValidationMessage &&
    (promptCommandContext !== null ||
      leadingMentionOptions.length === 0 ||
      leadingRoleMention.roleId !== null);
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
  const sendButtonTitle = canCreateRun
    ? t("composerSend")
    : composerSendDisabledReason({
        activeRunId,
        attachmentValidationMessage,
        busy,
        draftValidationMessage,
        hasInput: hasCreateInput,
        sessionId,
        t,
      });
  const injectionButtonTitle = canInject
    ? ""
    : composerInjectDisabledReason({
        activeRunId,
        attachmentValidationMessage,
        busy,
        draft,
        t,
      });
  const voiceInput = useVoiceInput({
    disabled: busy || sessionId === null,
    onError: (errorMessage) => {
      setComposerStatus(errorMessage);
      void message.error(errorMessage);
    },
    onTextChange: setDraft,
  });

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
      <div className="at-composer-inner">
        <Sender
          ref={inputRef}
          aria-label={t("composerPrompt")}
          autoSize={{ minRows: 1, maxRows: 7 }}
          disabled={busy || sessionId === null}
          className="at-composer-sender"
          loading={createRunMutation.isPending || injectMessageMutation.isPending}
          onChange={(value) => {
            if (voiceInput.isBusy) {
              voiceInput.stop({ ignoreTextUpdates: true });
            }
            setDraft(value);
          }}
          onPaste={(event) => {
            void handlePromptPaste(event);
          }}
          onKeyDown={(event) => {
            handlePromptKeyDown(event);
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
          placeholder={t("composerPromptPlaceholder")}
          submitType="enter"
          value={draft}
          actions={false}
        />
        <PromptMentionMenu
          activeIndex={activeMentionIndex}
          onSelect={selectPromptMentionOption}
          options={promptMentionOptions}
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
          <Space className="at-composer-control-set" size={6}>
            <div className="at-composer-field at-composer-mode-field">
              <Typography.Text className="at-composer-field-label">
                {t("composerMode")}
              </Typography.Text>
              <Segmented<SessionMode>
                aria-label={t("composerSessionMode")}
                className="at-session-mode-control"
                disabled={!canChangeTopology}
                onChange={(mode) => {
                  if (mode !== selectedSessionMode) {
                    updateSessionTopologyMode(mode);
                  }
                }}
                options={sessionModeOptions(t).map((option) => ({
                  ...option,
                  disabled:
                    option.value === "orchestration" &&
                    orchestrationPresetOptions.length === 0,
                }))}
                size="small"
                value={selectedSessionMode}
              />
            </div>
            <div className="at-composer-field at-composer-role-field">
              <Typography.Text className="at-composer-field-label">
                {t("composerRole")}
              </Typography.Text>
              {selectedSessionMode === "normal" ? (
                <Select
                  aria-label={t("composerRootRole")}
                  className="at-normal-root-role-select"
                  disabled={
                    !canChangeTopology ||
                    normalRootRoleOptions.length === 0
                  }
                  loading={
                    roleOptionsQuery.isLoading ||
                    updateTopologyMutation.isPending
                  }
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
                  placeholder={t("composerRootRole")}
                  popupMatchSelectWidth={false}
                  showSearch
                  size="small"
                  value={selectedNormalRootRoleId || undefined}
                />
              ) : null}
              {selectedSessionMode === "orchestration" ? (
                <Select
                  aria-label={t("composerOrchestrationPreset")}
                  className="at-orchestration-preset-select"
                  disabled={
                    !canChangeTopology ||
                    orchestrationPresetOptions.length === 0
                  }
                  loading={
                    orchestrationQuery.isLoading || updateTopologyMutation.isPending
                  }
                  onChange={(presetId) => {
                    const nextPresetId = normalizeProfileName(presetId);
                    if (
                      nextPresetId &&
                      nextPresetId !== selectedOrchestrationPresetId
                    ) {
                      updateSessionTopologyMode("orchestration", {
                        orchestrationPresetId: nextPresetId,
                      });
                    }
                  }}
                  optionFilterProp="label"
                  options={orchestrationPresetOptions}
                  placeholder={t("composerPreset")}
                  popupMatchSelectWidth={false}
                  showSearch
                  size="small"
                  value={selectedOrchestrationPresetId || undefined}
                />
              ) : null}
            </div>
            <div className="at-composer-field at-composer-target-field">
              <Typography.Text className="at-composer-field-label">
                {t("composerTarget")}
              </Typography.Text>
              <Select
                allowClear
                aria-label={t("composerTargetRole")}
                className="at-role-select"
                disabled={busy || activeRunId !== null}
                loading={roleOptionsQuery.isLoading}
                onChange={(value) => setTargetRoleId(value ?? null)}
                optionFilterProp="label"
                options={roleOptions}
                placeholder={t("composerTargetRole")}
                showSearch
                size="small"
                value={targetRoleId ?? undefined}
              />
            </div>
            <div className="at-composer-field at-composer-model-field">
              <Typography.Text className="at-composer-field-label">
                {t("composerModel")}
              </Typography.Text>
              <Select
                allowClear
                aria-label={t("composerModelProfile")}
                className="at-model-profile-select"
                disabled={
                  busy || activeRunId !== null || !canChangeModelProfile
                }
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
                placeholder={t("composerModel")}
                popupMatchSelectWidth={false}
                showSearch
                size="small"
                value={selectedModelProfile ?? undefined}
              />
            </div>
            <Space className="at-thinking-control" size={6}>
              <Typography.Text className="at-control-label" id="at-thinking-label">
                {t("composerThinking")}
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
                  aria-label={t("composerThinkingEffort")}
                  className="at-thinking-effort-select"
                  disabled={busy || activeRunId !== null}
                  onChange={(effort) => updateThinking({ effort })}
                  options={thinkingEffortOptions(t)}
                  popupMatchSelectWidth={false}
                  size="small"
                  value={thinking.effort ?? DEFAULT_THINKING_EFFORT}
                />
              ) : null}
            </Space>
            <Tooltip title={t("composerShellSafetyPolicy")}>
              <Checkbox
                aria-label={t("composerShellSafetyPolicy")}
                className="at-shell-safety-checkbox"
                checked={shellSafetyPolicyEnabled}
                disabled={
                  busy || activeRunId !== null || !canOverrideShellSafetyPolicy
                }
                onChange={(event) =>
                  setShellSafetyPolicyEnabled(event.target.checked)
                }
              >
                {t("composerShellSafetyShort")}
              </Checkbox>
            </Tooltip>
            <Checkbox
              checked={yolo}
              disabled={busy || activeRunId !== null}
              onChange={(event) => setYolo(event.target.checked)}
            >
              {t("composerYolo")}
            </Checkbox>
          </Space>
          <Space size={8}>
            {voiceInput.visible ? (
              <Tooltip title={voiceInput.tooltip}>
                <Button
                  aria-label={voiceInput.ariaLabel}
                  className="at-voice-input-button"
                  data-voice-state={voiceInput.state}
                  disabled={voiceInput.disabled}
                  icon={
                    voiceInput.isAvailable ? <Mic size={16} /> : <MicOff size={16} />
                  }
                  loading={voiceInput.state === "transcribing"}
                  onClick={() =>
                    voiceInput.toggle(
                      readPromptSelection(draft, inputRef.current?.nativeElement),
                    )
                  }
                />
              </Tooltip>
            ) : null}
            {activeRunId !== null ? (
              <Tooltip title={t("composerStopRun")}>
                <Button
                  danger
                  icon={<Pause size={16} />}
                  loading={stopRunMutation.isPending}
                  onClick={() => {
                    stopRunMutation.mutate(activeRunId);
                  }}
                >
                  {t("composerStop")}
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
                  title={injectionButtonTitle || t("composerQueue")}
                >
                  {t("composerQueue")}
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
                  title={injectionButtonTitle || t("composerInterrupt")}
                >
                  {t("composerInterrupt")}
                </Button>
              </>
            ) : (
              <Button
                htmlType="submit"
                icon={sessionId === null ? <Play size={16} /> : <Send size={16} />}
                loading={createRunMutation.isPending}
                type="primary"
                disabled={!canCreateRun}
                title={sendButtonTitle}
              >
                {t("composerSend")}
              </Button>
            )}
          </Space>
        </div>
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

  function handlePromptKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (promptMentionOptions.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveMentionIndex((current) =>
        wrapIndex(current + direction, promptMentionOptions.length),
      );
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectPromptMentionOption(
        promptMentionOptions[
          Math.min(activeMentionIndex, promptMentionOptions.length - 1)
        ],
      );
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setDismissedMentionDraft(draft);
    }
  }

  function selectPromptMentionOption(option: PromptMentionOption | undefined) {
    if (option === undefined) {
      return;
    }
    if (option.kind === "command" || option.kind === "skill") {
      setSelectedPromptSkill(option.kind === "skill" ? option : null);
      setDraft((currentDraft) => {
        const context = promptCommandContext ?? getPromptCommandContext(currentDraft);
        return context === null
          ? currentDraft
          : applyPromptCommandOption(currentDraft, context, option);
      });
    } else {
      if (option.kind === "role") {
        setSelectedPromptSkill(null);
      }
      setDraft((currentDraft) => {
        const context = promptResourceContext ?? getPromptResourceContext(currentDraft);
        return context === null
          ? `@${option.insertTerm} `
          : applyPromptMentionOption(currentDraft, context, option);
      });
    }
    setDismissedMentionDraft("");
    inputRef.current?.focus();
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
      void message.warning(t("composerNoRootRole"));
      return;
    }
    if (sessionMode === "orchestration" && !orchestrationPresetId) {
      void message.warning(t("composerNoOrchestrationPreset"));
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

function composerSendDisabledReason({
  activeRunId,
  attachmentValidationMessage,
  busy,
  draftValidationMessage,
  hasInput,
  sessionId,
  t,
}: {
  activeRunId: string | null;
  attachmentValidationMessage: string;
  busy: boolean;
  draftValidationMessage: string;
  hasInput: boolean;
  sessionId: string | null;
  t: Translate;
}): string {
  if (sessionId === null) {
    return t("composerSelectSessionBeforeSending");
  }
  if (activeRunId !== null) {
    return t("composerRunActiveUseInject");
  }
  if (attachmentValidationMessage) {
    return attachmentValidationMessage;
  }
  if (draftValidationMessage) {
    return draftValidationMessage;
  }
  if (!hasInput) {
    return t("composerSendNeedsInput");
  }
  if (busy) {
    return t("composerRunActionBusy");
  }
  return t("composerSend");
}

function composerInjectDisabledReason({
  activeRunId,
  attachmentValidationMessage,
  busy,
  draft,
  t,
}: {
  activeRunId: string | null;
  attachmentValidationMessage: string;
  busy: boolean;
  draft: string;
  t: Translate;
}): string {
  if (activeRunId === null) {
    return t("composerNoActiveRunInject");
  }
  if (attachmentValidationMessage) {
    return attachmentValidationMessage;
  }
  if (draft.trim().length === 0) {
    return t("composerInjectNeedsText");
  }
  if (busy) {
    return t("composerRunActionBusy");
  }
  return t("composerQueue");
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
  t: Translate,
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
  const options = [{ label: t("composerDefault"), value: "" }, ...profileOptions];
  const knownProfiles = new Set(options.map((option) => option.value));
  if (selectedProfile && !knownProfiles.has(selectedProfile)) {
    options.push({
      label: `${selectedProfile} (missing)`,
      value: selectedProfile,
    });
  }
  return options;
}

function resolveDraftValidationMessage(
  mention: LeadingRoleMention,
  attachments: PromptAttachment[],
  t: Translate,
): string {
  if (mention.error) {
    return mention.error;
  }
  if (mention.roleId !== null && !mention.promptText && attachments.length === 0) {
    return t("composerPromptAfterMention");
  }
  return "";
}

async function resolveComposerPromptSubmission({
  promptText,
  roleOptions,
  selectedSkill,
  session,
  sessionMode,
  t,
}: {
  promptText: string;
  roleOptions: RoleConfigOptions | undefined;
  selectedSkill: PromptSkillMentionOption | null;
  session: SessionRecord | undefined;
  sessionMode: SessionMode;
  t: Translate;
}): Promise<{ promptText: string; skills: string[] }> {
  const selectedSkillInvocation = resolvePromptSkillInvocation({
    promptText,
    roleOptions,
    selectedSkill,
  });
  if (selectedSkill !== null && selectedSkillInvocation !== null) {
    return {
      promptText: selectedSkillInvocation.args,
      skills: [selectedSkillInvocation.skill.skillRef],
    };
  }
  const invocation = extractPromptSlashInvocation(promptText);
  if (invocation === null) {
    return { promptText, skills: [] };
  }
  const workspaceId = normalizeOptionalId(session?.workspace_id);
  if (workspaceId !== null) {
    const response = await resolveCommandPrompt({
      workspace_id: workspaceId,
      raw_text: invocation.rawText,
      mode: sessionMode,
    });
    if (response.matched) {
      const expandedPrompt = normalizeProfileName(response.expanded_prompt);
      return { promptText: expandedPrompt || promptText, skills: [] };
    }
  }
  const fallbackSkillInvocation = resolvePromptSkillInvocation({
    promptText,
    roleOptions,
    selectedSkill: null,
  });
  if (fallbackSkillInvocation !== null) {
    return {
      promptText: fallbackSkillInvocation.args,
      skills: [fallbackSkillInvocation.skill.skillRef],
    };
  }
  if (workspaceId === null) {
    throw new Error(t("composerCommandRequiresWorkspace"));
  }
  return { promptText, skills: [] };
}

function extractPromptSlashInvocation(promptText: string): PromptSlashInvocation | null {
  const trimmedPrompt = promptText.trim();
  if (!trimmedPrompt.startsWith("/")) {
    return null;
  }
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(trimmedPrompt);
  if (match === null) {
    return null;
  }
  const name = normalizeProfileName(match[1]);
  if (!name) {
    return null;
  }
  const args = normalizeProfileName(match[2]);
  return {
    args,
    rawText: `/${name}${args ? ` ${args}` : ""}`,
  };
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
  t,
}: {
  activeRunId: string | null;
  attachments: PromptAttachment[];
  modelProfiles: ModelProfilesPayload | undefined;
  roleOptions: RoleConfigOptions | undefined;
  selectedModelProfile: string | null;
  selectedNormalRootRoleId: string;
  selectedSessionMode: SessionMode;
  targetRoleId: string | null;
  t: Translate;
}): string {
  if (attachments.length === 0) {
    return "";
  }
  if (activeRunId !== null) {
    return t("composerRuntimeTextOnly");
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
    t("composerSelectedAgent");
  if (imageSupport === null) {
    return t("composerImageSupportUnknown", { target: targetLabel });
  }
  return t("composerImageUnsupported", { target: targetLabel });
}

function thinkingEffortOptions(t: Translate): Array<{
  label: string;
  value: ThinkingEffort;
}> {
  return [
    { label: t("composerMinimal"), value: "minimal" },
    { label: t("composerLow"), value: "low" },
    { label: t("composerMedium"), value: "medium" },
    { label: t("composerHigh"), value: "high" },
  ];
}

function sessionModeOptions(t: Translate): Array<{
  label: string;
  value: SessionMode;
}> {
  return [
    { label: t("composerNormal"), value: "normal" },
    { label: t("composerOrchestration"), value: "orchestration" },
  ];
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

function wrapIndex(index: number, length: number): number {
  if (length <= 0) {
    return 0;
  }
  return ((index % length) + length) % length;
}

function normalizeProfileName(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  return normalizeProfileName(value) || null;
}

function readPromptSelection(
  draft: string,
  composerRoot: HTMLElement | undefined,
) {
  const promptInput =
    composerRoot?.querySelector<HTMLTextAreaElement>("textarea") ??
    document.querySelector<HTMLTextAreaElement>("textarea");
  if (promptInput !== null) {
    return {
      selectionEnd: promptInput.selectionEnd,
      selectionStart: promptInput.selectionStart,
      text: draft,
    };
  }
  return {
    selectionEnd: draft.length,
    selectionStart: draft.length,
    text: draft,
  };
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
