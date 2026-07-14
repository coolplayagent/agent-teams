import {
  App,
  Button,
  Segmented,
  Select,
  Space,
  Tooltip,
  Typography,
} from "antd";
import { Sender } from "@ant-design/x";
import {
  ChevronDown,
  Mic,
  MicOff,
  Plus,
  Play,
  Send,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClipboardEvent } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";

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
import { showFeedbackMessage } from "../../components/feedbackMessages";
import { ChoiceControl } from "../../components/ChoiceControl";
import type {
  InjectionDeliveryMode,
  ModelProfilesPayload,
  OrchestrationConfig,
  RecoverySnapshot,
  RunCreateRequest,
  RunThinkingConfig,
  SessionMode,
  SessionRecord,
  SessionSidebarRecord,
  ThinkingEffort,
} from "../../api/contracts";
import type { RunStreamController } from "../../runtime/useRunStreamController";
import { useOptimisticRunStore } from "../../runtime/optimisticRunStore";
import { useTranslations, type Translate } from "../../i18n";
import {
  buildPromptInputParts,
  PromptAttachments,
  readImageAttachmentFiles,
  readPastedImageAttachments,
  summarizePromptAttachments,
  type PromptAttachment,
} from "./PromptAttachments";
import { PromptMentionMenu } from "./PromptMentionMenu";
import {
  type LeadingRoleMention,
} from "./PromptMentions";
import { useVoiceInput } from "./useVoiceInput";
import { ComposerRunSettingsPopover } from "./ComposerSurface";
import { resolveComposerPromptSubmission } from "./promptSubmission";
import { useComposerMentionController } from "./useComposerMentionController";
import { resolveImageInputBlockedMessage } from "./imageInputValidation";
import { buildComposerQuickActionOptions } from "./composerQuickActions";
import {
  DEFAULT_THINKING_EFFORT,
  GENERAL_RUN_PREFERENCES_QUERY_KEY,
  persistThinkingState,
  readSavedThinkingState,
  shellSafetyPolicyPreference,
  subscribeThinkingState,
  updateThinkingState,
} from "./runPreferences";
import "./Composer.css";

interface ComposerProps {
  runStreamController: RunStreamController;
  sessionId: string | null;
}

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

function sessionRecoveryQueryKey(sessionId: string) {
  return ["sessions", sessionId, "recovery"] as const;
}

function sessionsSidebarQueryKey() {
  return ["sessions", "sidebar"] as const;
}

function previewSessionTitleInSidebarCache(
  queryClient: QueryClient,
  sessionId: string,
  runId: string,
  title: string,
  session: SessionRecord | undefined,
) {
  const safeSessionId = sessionId.trim();
  const safeRunId = runId.trim();
  const safeTitle = title.trim();
  if (!safeSessionId || !safeRunId) {
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
            safeRunId,
            safeTitle,
            updatedAt,
          ),
        ];
      }
      return current.map((record, index) =>
        index === existingIndex
          ? sessionWithTitlePreview(record, safeRunId, safeTitle, updatedAt)
          : record,
      );
    },
  );
}

function sessionWithTitlePreview(
  session: SessionSidebarRecord,
  runId: string,
  title: string,
  updatedAt: string,
): SessionSidebarRecord {
  return {
    ...session,
    ...(title
      ? {
          metadata: {
            ...(session.metadata ?? {}),
            title,
          },
        }
      : {}),
    active_run_id: runId,
    active_run_status: "running",
    updated_at: updatedAt,
  };
}

export function Composer({ runStreamController, sessionId }: ComposerProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const sessionIdRef = useRef(sessionId);
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
    queryKey: GENERAL_RUN_PREFERENCES_QUERY_KEY,
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
  const sessionWorkspaceId = normalizeOptionalId(sessionQuery.data?.workspace_id);
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
  const quickActionOptions = useMemo(
    () => buildComposerQuickActionOptions(t, thinking.enabled),
    [t, thinking.enabled],
  );
  const mentions = useComposerMentionController({
    active: activeRunId === null,
    draft,
    onAction: (option) => {
      if (option.actionId === "attach-image") {
        attachmentInputRef.current?.click();
      } else if (option.actionId === "browse-workspace") {
        setDraft((currentDraft) => appendComposerToken(currentDraft, "@"));
      } else if (option.actionId === "toggle-thinking") {
        updateThinking({ enabled: !thinking.enabled });
      } else if (option.actionId === "use-normal-mode") {
        if (selectedSessionMode !== "normal" && canChangeTopology) {
          updateSessionTopologyMode("normal");
        }
      } else if (
        selectedSessionMode !== "orchestration" &&
        canChangeTopology
      ) {
        updateSessionTopologyMode("orchestration");
      }
    },
    quickActionOptions,
    roleOptions: roleOptionsQuery.data,
    setDraft,
    workspaceId: sessionWorkspaceId,
  });
  const effectiveTargetRoleId =
    mentions.leadingRoleMention.roleId ?? targetRoleId;
  const effectivePromptText = mentions.effectivePromptText;
  const draftValidationMessage =
    activeRunId === null
      ? resolveDraftValidationMessage(
          mentions.leadingRoleMention,
          promptAttachments,
          t,
        )
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

  useEffect(
    () => subscribeThinkingState((state) => setThinking(state)),
    [],
  );

  useEffect(() => {
    if (generalConfigQuery.data !== undefined) {
      setShellSafetyPolicyEnabled(
        shellSafetyPolicyPreference(generalConfigQuery.data),
      );
    }
  }, [generalConfigQuery.data]);

  const createRunMutation = useMutation({
    onMutate: () => {
      const submittedAt = globalThis.performance?.now();
      if (sessionId === null) {
        return { promptId: null, sessionId: null, submittedAt };
      }
      const promptText =
        effectivePromptText || summarizePromptAttachments(promptAttachments);
      const promptId = useOptimisticRunStore
        .getState()
        .beginPrompt(sessionId, promptText);
      return { promptId, sessionId, submittedAt };
    },
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
        selectedSkill: mentions.selectedPromptSkill,
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
    onSuccess: ({ result, titlePreview }, _variables, optimisticPrompt) => {
      markComposerRunSubmission(result.run_id, optimisticPrompt?.submittedAt);
      markComposerRunStart("success-callback", result.run_id);
      const foreground = sessionIdRef.current === result.session_id;
      markComposerRunStart("before-controller", result.run_id);
      runStreamController.startRunStream({
        ...(foreground ? {} : { foreground: false }),
        ...(titlePreview.trim().length > 0 ? { promptText: titlePreview } : {}),
        runId: result.run_id,
        sessionId: result.session_id,
        ...(result.target_role_id?.trim() ? { targetRoleId: result.target_role_id } : {}),
      });
      setDraft("");
      setPromptAttachments([]);
      mentions.setSelectedPromptSkill(null);
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
        result.run_id,
        titlePreview,
        sessionQuery.data,
      );
      if (
        optimisticPrompt?.sessionId != null &&
        optimisticPrompt.promptId != null
      ) {
        useOptimisticRunStore
          .getState()
          .confirmPrompt(
            optimisticPrompt.sessionId,
            optimisticPrompt.promptId,
            result.run_id,
          );
      }
    },
    onError: (error, _variables, optimisticPrompt) => {
      if (
        optimisticPrompt?.sessionId != null &&
        optimisticPrompt.promptId != null
      ) {
        useOptimisticRunStore
          .getState()
          .finishPrompt(optimisticPrompt.sessionId, optimisticPrompt.promptId);
      }
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
    (mentions.promptCommandContext !== null ||
      !mentions.hasLeadingMentionOptions ||
      mentions.leadingRoleMention.roleId !== null);
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
      showFeedbackMessage(message, "error", errorMessage, {
        dedupeKey: `voice-input-error:${errorMessage}`,
      });
    },
    onTextChange: setDraft,
  });
  const composerModeLabel = selectedSessionMode === "normal"
    ? t("composerNormal")
    : t("composerOrchestration");
  const composerTopologyLabel = selectedSessionMode === "normal"
    ? normalRootRoleOptions.find(
        (option) => option.value === selectedNormalRootRoleId,
      )?.label ?? t("composerRootRole")
    : orchestrationPresetOptions.find(
        (option) => option.value === selectedOrchestrationPresetId,
      )?.label ?? t("composerPreset");
  const composerTopologySummary = `${composerModeLabel} · ${composerTopologyLabel}`;
  const composerModelLabel = modelProfileOptions.find(
    (option) => option.value === selectedModelProfile,
  )?.label ?? t("composerModel");
  const composerThinkingLabel = thinking.enabled
    ? thinkingEffortOptions(t).find(
        (option) => option.value === thinking.effort,
      )?.label ?? t("composerThinking")
    : t("composerThinkingDisabled");
  const composerRunSettingsSummary = [
    composerTopologySummary,
    composerModelLabel,
    composerThinkingLabel,
  ].join(" · ");

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
        <input
          accept="image/*"
          aria-hidden
          className="at-composer-file-input"
          multiple
          onChange={(event) => {
            void handleAttachmentFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
          ref={attachmentInputRef}
          tabIndex={-1}
          type="file"
        />
        <div
          className="at-composer-prompt-anchor"
          ref={mentions.mentionAnchorRef}
        >
          <Sender
            ref={mentions.inputRef}
            aria-label={t("composerPrompt")}
            autoSize={{ minRows: 1, maxRows: 7 }}
            disabled={busy || sessionId === null}
            className="at-composer-sender"
            loading={createRunMutation.isPending || injectMessageMutation.isPending}
            onChange={(value) => {
              if (voiceInput.isBusy) {
                voiceInput.stop({ ignoreTextUpdates: true });
              }
              mentions.setQuickMenuOpen(false);
              setDraft(value);
            }}
            onPaste={(event) => {
              void handlePromptPaste(event);
            }}
            onKeyDown={mentions.handleKeyDown}
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
            activeIndex={mentions.activeIndex}
            anchorRef={mentions.mentionAnchorRef}
            emptyLabel={
              mentions.quickMenuOpen || mentions.promptCommandContext !== null
                ? t("settingsCommandsNoMatches")
                : mentions.promptResourceContext?.query
                  ? t("workspaceNoFileMatches")
                  : t("settingsNoRoles")
            }
            loading={mentions.loading || roleOptionsQuery.isLoading}
            loadingLabel={t("connectorsRuntimeToolsStatusLoading")}
            menuLabel={t("composerPromptSuggestions")}
            menuId={mentions.mentionMenuId}
            onSelect={mentions.selectOption}
            open={mentions.open}
            options={mentions.options}
          />
        </div>
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
          <div className="at-composer-toolbar-start">
            <Tooltip title={t("composerQuickActions")}>
              <Button
                aria-expanded={mentions.quickMenuOpen}
                aria-label={t("composerQuickActions")}
                className={mentions.quickMenuOpen ? "at-composer-plus-button is-active" : "at-composer-plus-button"}
                icon={<Plus size={17} />}
                onClick={() => {
                  mentions.setDismissedMentionDraft("");
                  mentions.setQuickMenuOpen((current) => !current);
                  queueMicrotask(() => mentions.inputRef.current?.focus());
                }}
                shape="circle"
                size="small"
                type="text"
                ref={mentions.quickMenuButtonRef}
              />
            </Tooltip>
            <ComposerRunSettingsPopover
              compactSummary={abbreviateComposerModeLabel(composerModeLabel)}
              heading={t("composerRunSettings")}
              summary={composerRunSettingsSummary}
            >
                  <Typography.Text className="at-composer-section-label" type="secondary">
                    {t("composerConversationSettings")}
                  </Typography.Text>
                  <div className="at-composer-control-set">
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
                {selectedSessionMode === "normal"
                  ? t("composerRole")
                  : t("composerPreset")}
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
                placeholder={t("composerModel")}
                popupMatchSelectWidth={false}
                showSearch
                size="small"
                value={selectedModelProfile ?? undefined}
              />
            </div>
            <Typography.Text
              className="at-composer-section-label at-composer-execution-section-label"
              type="secondary"
            >
              {t("composerExecutionSettings")}
            </Typography.Text>
            <div className="at-composer-toggles">
              <Space className="at-thinking-control" size={6}>
                <ChoiceControl
                  ariaLabel={t("composerThinking")}
                  checked={thinking.enabled}
                  disabled={busy || activeRunId !== null}
                  kind="switch"
                  label={t("composerThinking")}
                  onChange={(enabled) => updateThinking({ enabled })}
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
                <ChoiceControl
                  ariaLabel={t("composerShellSafetyPolicy")}
                  className="at-shell-safety-checkbox"
                  checked={shellSafetyPolicyEnabled}
                  disabled={
                    busy || activeRunId !== null || !canOverrideShellSafetyPolicy
                  }
                  label={t("composerShellSafetyShort")}
                  onChange={(checked) => setShellSafetyPolicyEnabled(checked)}
                />
              </Tooltip>
              <ChoiceControl
                checked={yolo}
                disabled={busy || activeRunId !== null}
                label={t("composerYolo")}
                onChange={(checked) => setYolo(checked)}
              />
            </div>
                  </div>
            </ComposerRunSettingsPopover>
          </div>
          <div className="at-composer-actions">
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
                      readPromptSelection(
                        draft,
                        mentions.inputRef.current?.nativeElement,
                      ),
                    )
                  }
                  shape="circle"
                  type="text"
                />
              </Tooltip>
            ) : null}
            {activeRunId !== null ? (
              <Tooltip title={t("composerStopRun")}>
                <Button
                  aria-label={t("composerStop")}
                  className="at-composer-primary-action at-composer-stop-action"
                  danger
                  icon={<Square fill="currentColor" size={13} />}
                  loading={stopRunMutation.isPending}
                  onClick={() => {
                    stopRunMutation.mutate(activeRunId);
                  }}
                  shape="circle"
                />
              </Tooltip>
            ) : null}
            {activeRunId !== null ? (
              <>
                <Tooltip title={injectionButtonTitle || t("composerInterrupt")}>
                  <Button
                    aria-label={t("composerInterrupt")}
                    className="at-composer-secondary-action"
                    danger
                    disabled={!canInject}
                    icon={<Play size={15} />}
                    loading={
                      injectMessageMutation.isPending &&
                      injectMessageMutation.variables === "interrupt"
                    }
                    onClick={() => injectMessageMutation.mutate("interrupt")}
                    shape="circle"
                    title={injectionButtonTitle || undefined}
                    type="text"
                  />
                </Tooltip>
                <Tooltip title={injectionButtonTitle || t("composerQueue")}>
                  <Button
                    aria-label={t("composerQueue")}
                    className="at-composer-primary-action"
                    disabled={!canInject}
                    icon={<Send size={16} />}
                    loading={
                      injectMessageMutation.isPending &&
                      injectMessageMutation.variables === "queued"
                    }
                    onClick={() => injectMessageMutation.mutate("queued")}
                    shape="circle"
                    title={injectionButtonTitle || undefined}
                    type="primary"
                  />
                </Tooltip>
              </>
            ) : (
              <Button
                aria-label={t("composerSend")}
                className="at-composer-primary-action"
                htmlType="submit"
                icon={sessionId === null ? <Play size={16} /> : <Send size={16} />}
                loading={createRunMutation.isPending}
                shape="circle"
                type="primary"
                disabled={!canCreateRun}
                title={sendButtonTitle}
              />
            )}
          </div>
        </div>
      </div>
    </form>
  );

  function updateThinking(nextState: Partial<RunThinkingConfig>) {
    setThinking((current) => {
      const updated = updateThinkingState(current, nextState);
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
      mentions.inputRef.current?.focus();
    } catch (error) {
      setComposerStatus(
        error instanceof Error ? error.message : "Failed to read pasted image.",
      );
    }
  }

  async function handleAttachmentFiles(files: FileList | null) {
    if (files === null) {
      return;
    }
    try {
      const attachments = await readImageAttachmentFiles(files);
      if (attachments.length === 0) {
        return;
      }
      setComposerStatus("");
      setPromptAttachments((current) => [...current, ...attachments]);
      mentions.inputRef.current?.focus();
    } catch (error) {
      setComposerStatus(
        error instanceof Error ? error.message : "Failed to read image attachment.",
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

function markComposerRunStart(phase: string, runId: string): void {
  try {
    globalThis.performance?.mark(
      `agent-teams:run-start:composer-${phase}:${runId}`,
    );
  } catch {
    // Performance instrumentation must never affect run submission.
  }
}

function markComposerRunSubmission(
  runId: string,
  submittedAt: number | undefined,
): void {
  if (submittedAt === undefined) {
    return;
  }
  try {
    globalThis.performance?.mark(`agent-teams:run-start:submit:${runId}`, {
      startTime: submittedAt,
    });
  } catch {
    // Performance instrumentation must never affect run submission.
  }
}

function appendComposerToken(draft: string, token: string): string {
  if (!draft) {
    return token;
  }
  return /\s$/.test(draft) ? `${draft}${token}` : `${draft} ${token}`;
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

function abbreviateComposerModeLabel(label: string): string {
  const characters = Array.from(label.trim());
  return characters.length > 6 ? `${characters.slice(0, 4).join("")}.` : label;
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
