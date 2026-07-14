import {
  App,
  Button,
  Popover,
  Select,
  Tooltip,
  Typography,
} from "antd";
import { Sender } from "@ant-design/x";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Folder, Plus, Send } from "lucide-react";
import type { ClipboardEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  createRun,
  createSession,
  getGeneralConfig,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfigOptions,
  updateSessionTopology,
} from "../../api/client";
import type {
  RunCreateResponse,
  RunCreateRequest,
  RunThinkingConfig,
  SessionRecord,
  ThinkingEffort,
  WorkspaceRecord,
} from "../../api/contracts";
import { useTranslations, type Translate } from "../../i18n";
import { useOptimisticRunStore } from "../../runtime/optimisticRunStore";
import { ModelRequestStatus } from "../timeline/ModelRequestStatus";
import { workspaceDisplayLabel } from "../workspaces/workspaceLabels";
import { ComposerSurface } from "../composer/ComposerSurface";
import { resolveImageInputBlockedMessage } from "../composer/imageInputValidation";
import {
  buildPromptInputParts,
  PromptAttachments,
  readImageAttachmentFiles,
  readPastedImageAttachments,
  summarizePromptAttachments,
  type PromptAttachment,
} from "../composer/PromptAttachments";
import { PromptMentionMenu } from "../composer/PromptMentionMenu";
import { resolveComposerPromptSubmission } from "../composer/promptSubmission";
import { buildComposerQuickActionOptions } from "../composer/composerQuickActions";
import {
  GENERAL_RUN_PREFERENCES_QUERY_KEY,
  persistThinkingState,
  readSavedThinkingState,
  shellSafetyPolicyPreference,
  updateThinkingState,
} from "../composer/runPreferences";
import { useComposerMentionController } from "../composer/useComposerMentionController";
import {
  NewSessionRunSettings,
  type NewSessionMode,
} from "./NewSessionRunSettings";
import "../composer/Composer.css";
import "./NewSessionView.css";

interface NewSessionResult {
  promptText: string;
  run: RunCreateResponse | null;
  session: SessionRecord;
}

interface PendingNewSession {
  error: string | null;
  promptText: string;
}

interface NewSessionProgress {
  session: SessionRecord;
  topologyReady: boolean;
}

interface NewSessionViewProps {
  initialWorkspaceId: string | null;
  onCancel: () => void;
  onCreated: (
    session: SessionRecord,
    run: RunCreateResponse | null,
    promptText: string,
  ) => void;
  workspaces: WorkspaceRecord[];
}

export function NewSessionView({
  initialWorkspaceId,
  onCancel,
  onCreated,
  workspaces,
}: NewSessionViewProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId ?? "");
  const [modelProfile, setModelProfile] = useState<string | null>(null);
  const [sessionMode, setSessionMode] = useState<NewSessionMode>("normal");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [orchestrationPresetId, setOrchestrationPresetId] = useState<
    string | null
  >(null);
  const [targetRoleId, setTargetRoleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [promptText, setPromptText] = useState("");
  const [promptAttachments, setPromptAttachments] = useState<
    PromptAttachment[]
  >([]);
  const [composerStatus, setComposerStatus] = useState("");
  const [thinking, setThinking] = useState<RunThinkingConfig>(() =>
    readSavedThinkingState(),
  );
  const [shellSafetyPolicyEnabled, setShellSafetyPolicyEnabled] = useState<
    boolean | null
  >(null);
  const [yolo, setYolo] = useState(true);
  const [pendingSession, setPendingSession] =
    useState<PendingNewSession | null>(null);
  const sessionProgressRef = useRef<NewSessionProgress | null>(null);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const rolesQuery = useQuery({
    queryKey: ["roles", "options"],
    queryFn: getRoleConfigOptions,
  });
  const profilesQuery = useQuery({
    queryKey: ["model-profiles"],
    queryFn: getModelProfiles,
  });
  const orchestrationQuery = useQuery({
    queryKey: ["orchestration", "config"],
    queryFn: getOrchestrationConfig,
  });
  const generalConfigQuery = useQuery({
    queryKey: GENERAL_RUN_PREFERENCES_QUERY_KEY,
    queryFn: getGeneralConfig,
    staleTime: 30000,
  });
  const workspaceOptions = useMemo(
    () =>
      workspaces.map((workspace) => ({
        label: workspaceDisplayLabel(workspace, workspace.workspace_id),
        value: workspace.workspace_id,
      })),
    [workspaces],
  );
  const profileOptions = useMemo(
    () =>
      Object.entries(profilesQuery.data ?? {}).map(([id, profile]) => ({
        label: profile.model?.trim() ? `${id} · ${profile.model}` : id,
        value: id,
      })),
    [profilesQuery.data],
  );
  const roleOptions = useMemo(
    () =>
      (rolesQuery.data?.normal_mode_roles ?? []).map((role) => ({
        label: role.name || role.role_id,
        value: role.role_id,
      })),
    [rolesQuery.data],
  );
  const targetRoleOptions = useMemo(() => {
    const roles = [
      ...(rolesQuery.data?.normal_mode_roles ?? []),
      ...(rolesQuery.data?.subagent_roles ?? []),
    ];
    return Array.from(
      new Map(roles.map((role) => [role.role_id, role])).values(),
    ).map((role) => ({
      label: role.name || role.role_id,
      value: role.role_id,
    }));
  }, [rolesQuery.data]);
  const orchestrationOptions = useMemo(
    () =>
      (orchestrationQuery.data?.presets ?? []).map((preset) => ({
        label: preset.name?.trim() || preset.preset_id,
        value: preset.preset_id,
      })),
    [orchestrationQuery.data],
  );
  const quickActionOptions = useMemo(
    () => buildComposerQuickActionOptions(t, thinking.enabled),
    [t, thinking.enabled],
  );
  const mentions = useComposerMentionController({
    active: true,
    draft: promptText,
    onAction: (option) => {
      if (option.actionId === "attach-image") {
        attachmentInputRef.current?.click();
      } else if (option.actionId === "browse-workspace") {
        setPromptText((current) => appendComposerToken(current, "@"));
      } else if (option.actionId === "toggle-thinking") {
        updateThinking({ enabled: !thinking.enabled });
      } else if (option.actionId === "use-normal-mode") {
        setSessionMode("normal");
      } else if (orchestrationOptions.length > 0) {
        setSessionMode("orchestration");
      }
    },
    quickActionOptions,
    roleOptions: rolesQuery.data,
    setDraft: setPromptText,
    workspaceId: workspaceId || null,
  });
  const effectiveTargetRoleId =
    mentions.leadingRoleMention.roleId ?? targetRoleId;
  const effectivePromptText = mentions.effectivePromptText;
  const hasInitialInput =
    effectivePromptText.length > 0 || promptAttachments.length > 0;
  const attachmentValidationMessage = resolveImageInputBlockedMessage({
    activeRunId: null,
    attachments: promptAttachments,
    modelProfiles: profilesQuery.data,
    roleOptions: rolesQuery.data,
    selectedModelProfile: modelProfile,
    selectedNormalRootRoleId: roleId ?? "",
    selectedSessionMode: sessionMode,
    targetRoleId: effectiveTargetRoleId,
    t,
  });
  const displayedComposerStatus =
    attachmentValidationMessage || composerStatus;
  const selectedWorkspaceLabel =
    workspaceOptions.find((option) => option.value === workspaceId)?.label ??
    t("sidebarWorkspaces");
  const selectedModeLabel =
    sessionMode === "normal" ? t("composerNormal") : t("composerOrchestration");
  const selectedTopologyLabel =
    sessionMode === "normal"
      ? (roleOptions.find((option) => option.value === roleId)?.label ??
        t("composerRole"))
      : (orchestrationOptions.find(
          (option) => option.value === orchestrationPresetId,
        )?.label ?? t("composerPreset"));
  const selectedModelLabel =
    profileOptions.find((option) => option.value === modelProfile)?.label ??
    t("composerDefault");
  const selectedThinkingLabel = thinking.enabled
    ? (thinkingEffortOptions(t).find(
        (option) => option.value === thinking.effort,
      )?.label ?? t("composerThinking"))
    : t("composerThinkingDisabled");
  const runSettingsSummary = [
    `${selectedModeLabel} · ${selectedTopologyLabel}`,
    selectedModelLabel,
    selectedThinkingLabel,
  ].join(" · ");

  useEffect(() => {
    if (!workspaceId && workspaceOptions.length > 0) {
      setWorkspaceId(workspaceOptions[0].value);
    }
  }, [workspaceId, workspaceOptions]);

  useEffect(() => {
    const defaultProfile =
      Object.entries(profilesQuery.data ?? {}).find(
        ([, profile]) => profile.is_default,
      )?.[0] ?? null;
    if (modelProfile === null && defaultProfile !== null) {
      setModelProfile(defaultProfile);
    }
  }, [modelProfile, profilesQuery.data]);

  useEffect(() => {
    if (roleId === null && rolesQuery.data?.main_agent_role_id) {
      setRoleId(rolesQuery.data.main_agent_role_id);
    }
  }, [roleId, rolesQuery.data]);

  useEffect(() => {
    if (orchestrationPresetId === null) {
      setOrchestrationPresetId(
        orchestrationQuery.data?.default_orchestration_preset_id ?? null,
      );
    }
  }, [orchestrationPresetId, orchestrationQuery.data]);

  useEffect(() => {
    if (generalConfigQuery.data !== undefined) {
      setShellSafetyPolicyEnabled(
        shellSafetyPolicyPreference(generalConfigQuery.data),
      );
    }
  }, [generalConfigQuery.data]);

  useEffect(() => {
    mentions.inputRef.current?.focus();
  }, []);

  const createMutation = useMutation({
    mutationFn: async (): Promise<NewSessionResult> => {
      if (attachmentValidationMessage) {
        throw new Error(attachmentValidationMessage);
      }
      let progress = sessionProgressRef.current;
      if (progress === null) {
        const created = await createSession({
          workspace_id: workspaceId,
          normal_model_profile: modelProfile,
          metadata: title.trim() ? { title: title.trim() } : undefined,
        });
        progress = { session: created, topologyReady: false };
        sessionProgressRef.current = progress;
      }
      if (!progress.topologyReady) {
        const session =
          sessionMode === "orchestration"
            ? await updateSessionTopology(progress.session.session_id, {
                session_mode: "orchestration",
                orchestration_preset_id: orchestrationPresetId,
              })
            : roleId !== null && roleId !== progress.session.normal_root_role_id
              ? await updateSessionTopology(progress.session.session_id, {
                  session_mode: "normal",
                  normal_root_role_id: roleId,
                })
              : progress.session;
        progress = { session, topologyReady: true };
        sessionProgressRef.current = progress;
      }
      const session = progress.session;
      if (!hasInitialInput) {
        return { promptText: "", run: null, session };
      }
      if (shellSafetyPolicyEnabled === null) {
        throw new Error("Run preferences are not ready.");
      }
      const resolvedPrompt = await resolveComposerPromptSubmission({
        promptText: effectivePromptText,
        roleOptions: rolesQuery.data,
        selectedSkill: mentions.selectedPromptSkill,
        session,
        sessionMode,
        t,
      });
      const input = buildPromptInputParts(
        resolvedPrompt.promptText,
        promptAttachments,
      );
      const request: RunCreateRequest = {
        session_id: session.session_id,
        input,
        display_input: input,
        target_role_id: effectiveTargetRoleId,
        thinking,
        shell_safety_policy_enabled: shellSafetyPolicyEnabled,
        yolo,
      };
      if (resolvedPrompt.skills.length > 0) {
        request.skills = resolvedPrompt.skills;
      }
      const run = await createRun(request);
      return {
        promptText:
          effectivePromptText || summarizePromptAttachments(promptAttachments),
        run,
        session,
      };
    },
    onSuccess: ({ promptText: createdPrompt, run, session }) => {
      sessionProgressRef.current = null;
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      if (createdPrompt.length > 0) {
        const optimisticStore = useOptimisticRunStore.getState();
        const promptId = optimisticStore.beginPrompt(
          session.session_id,
          createdPrompt,
        );
        if (run !== null) {
          optimisticStore.confirmPrompt(
            session.session_id,
            promptId,
            run.run_id,
          );
        }
      }
      onCreated(session, run, createdPrompt);
    },
    onError: (error) => {
      const errorText =
        error instanceof Error ? error.message : t("sidebarCreateFailed");
      setPendingSession((current) =>
        current === null
          ? { error: errorText, promptText: promptText.trim() }
          : { ...current, error: errorText },
      );
      void message.error(errorText);
    },
  });

  const queryError =
    rolesQuery.error ??
    profilesQuery.error ??
    orchestrationQuery.error ??
    generalConfigQuery.error;
  const submit = () => {
    const promptNeedsPreferences = hasInitialInput;
    if (
      workspaceId &&
      !createMutation.isPending &&
      !attachmentValidationMessage &&
      (!promptNeedsPreferences || shellSafetyPolicyEnabled !== null)
    ) {
      setPendingSession({
        error: null,
        promptText:
          effectivePromptText || summarizePromptAttachments(promptAttachments),
      });
      createMutation.mutate();
    }
  };

  if (pendingSession !== null) {
    return (
      <section
        aria-busy={pendingSession.error === null ? "true" : undefined}
        aria-label={t("sidebarNewSession")}
        className="at-new-session-view at-new-session-pending"
      >
        <div className="at-new-session-pending-content">
          <article
            className="at-message at-timeline-row"
            data-row-key="optimistic-new-session-prompt"
            data-role-id="user"
          >
            <div className="at-message-content">
              {pendingSession.promptText ||
                title.trim() ||
                t("sidebarNewSession")}
            </div>
          </article>
          {pendingSession.error === null ? (
            <ModelRequestStatus
              openingLabel={t("timelineOpeningModelStream")}
              phase="opening_stream"
              waitingLabel={t("timelineWaitingForModelSlot")}
            />
          ) : (
            <div className="at-new-session-pending-error" role="alert">
              <Typography.Text type="danger">
                {pendingSession.error}
              </Typography.Text>
              <div className="at-new-session-actions">
                <Button onClick={() => setPendingSession(null)}>
                  {t("sidebarRenameCancel")}
                </Button>
                <Button onClick={submit} type="primary">
                  {t("settingsRetry")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label={t("sidebarNewSession")}
      className="at-new-session-view"
      onKeyDown={(event) => {
        if (event.key === "Escape" && !createMutation.isPending) {
          onCancel();
        }
      }}
    >
      <div className="at-new-session-stage">
        <header className="at-new-session-header">
          <Button
            aria-label={t("workspaceBackToChat")}
            icon={<ArrowLeft size={16} />}
            onClick={onCancel}
            type="text"
          />
          <div>
            <Typography.Title level={2}>
              {t("sidebarNewSession")}
            </Typography.Title>
            <Typography.Text type="secondary">
              {t("composerPromptPlaceholder")}
            </Typography.Text>
          </div>
        </header>

        {queryError !== null && queryError !== undefined ? (
          <Typography.Text
            className="at-new-session-error"
            role="alert"
            type="danger"
          >
            {queryError instanceof Error
              ? queryError.message
              : t("sidebarCreateFailed")}
          </Typography.Text>
        ) : null}

        <ComposerSurface
          actions={
            <Tooltip
              title={
                hasInitialInput
                  ? t("newSessionCreateAndRun")
                  : t("sidebarNewSession")
              }
            >
              <Button
                aria-label={
                  hasInitialInput
                    ? t("newSessionCreateAndRun")
                    : t("sidebarNewSession")
                }
                className="at-composer-primary-action"
                disabled={
                  !workspaceId ||
                  Boolean(attachmentValidationMessage) ||
                  (hasInitialInput && shellSafetyPolicyEnabled === null)
                }
                htmlType="submit"
                icon={
                  hasInitialInput ? <Send size={16} /> : <Plus size={16} />
                }
                loading={createMutation.isPending}
                shape="circle"
                type="primary"
              />
            </Tooltip>
          }
          className="at-new-session-composer"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !createMutation.isPending) {
              onCancel();
            }
          }}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          toolbarStart={
            <>
              <Tooltip title={t("composerQuickActions")}>
                <Button
                  aria-expanded={mentions.quickMenuOpen}
                  aria-label={t("composerQuickActions")}
                  className={
                    mentions.quickMenuOpen
                      ? "at-composer-plus-button is-active"
                      : "at-composer-plus-button"
                  }
                  icon={<Plus size={17} />}
                  onClick={() => {
                    mentions.setDismissedMentionDraft("");
                    mentions.setQuickMenuOpen((current) => !current);
                    queueMicrotask(() => mentions.inputRef.current?.focus());
                  }}
                  ref={mentions.quickMenuButtonRef}
                  shape="circle"
                  size="small"
                  type="text"
                />
              </Tooltip>
              <Popover
                arrow={false}
                content={
                  <div className="at-new-session-workspace-menu">
                    <Typography.Text strong>
                      {t("sidebarWorkspaces")}
                    </Typography.Text>
                    <Select
                      aria-label={t("sidebarWorkspaces")}
                      onChange={setWorkspaceId}
                      optionFilterProp="label"
                      options={workspaceOptions}
                      popupMatchSelectWidth={false}
                      showSearch
                      value={workspaceId || undefined}
                    />
                  </div>
                }
                overlayClassName="at-composer-advanced-popover"
                placement="topLeft"
                trigger="click"
              >
                <Button
                  aria-label={`${t("sidebarWorkspaces")}: ${selectedWorkspaceLabel}`}
                  className="at-composer-summary-button at-new-session-workspace-button"
                  icon={<Folder size={15} />}
                  size="small"
                  type="text"
                >
                  <span className="at-composer-summary-copy">
                    {selectedWorkspaceLabel}
                  </span>
                </Button>
              </Popover>
              <NewSessionRunSettings
                generalConfigReady={generalConfigQuery.isSuccess}
                modelProfile={modelProfile}
                onModelProfileChange={setModelProfile}
                onOrchestrationPresetChange={setOrchestrationPresetId}
                onRoleChange={setRoleId}
                onSessionModeChange={setSessionMode}
                onShellSafetyPolicyChange={setShellSafetyPolicyEnabled}
                onTargetRoleChange={setTargetRoleId}
                onThinkingChange={updateThinking}
                onTitleChange={setTitle}
                onYoloChange={setYolo}
                orchestrationLoading={orchestrationQuery.isLoading}
                orchestrationOptions={orchestrationOptions}
                orchestrationPresetId={orchestrationPresetId}
                profileOptions={profileOptions}
                profilesLoading={profilesQuery.isLoading}
                roleId={roleId}
                roleOptions={roleOptions}
                rolesLoading={rolesQuery.isLoading}
                runSettingsSummary={runSettingsSummary}
                selectedModeLabel={selectedModeLabel}
                sessionMode={sessionMode}
                shellSafetyPolicyEnabled={shellSafetyPolicyEnabled}
                targetRoleId={targetRoleId}
                targetRoleOptions={targetRoleOptions}
                thinking={thinking}
                title={title}
                yolo={yolo}
              />
            </>
          }
        >
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
              actions={false}
              aria-label={t("newSessionInitialTask")}
              autoSize={{ minRows: 1, maxRows: 7 }}
              className="at-composer-sender"
              disabled={createMutation.isPending}
              loading={createMutation.isPending}
              onChange={(value) => {
                mentions.setQuickMenuOpen(false);
                setPromptText(value);
              }}
              onKeyDown={mentions.handleKeyDown}
              onPaste={(event) => {
                void handlePromptPaste(event);
              }}
              onSubmit={submit}
              placeholder={t("composerPromptPlaceholder")}
              ref={mentions.inputRef}
              submitType="enter"
              value={promptText}
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
              loading={mentions.loading || rolesQuery.isLoading}
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
                current.filter(
                  (attachment) => attachment.id !== attachmentId,
                ),
              );
            }}
          />
          {displayedComposerStatus ? (
            <Typography.Text className="at-composer-status" type="danger">
              {displayedComposerStatus}
            </Typography.Text>
          ) : null}
        </ComposerSurface>
      </div>
    </section>
  );

  async function handlePromptPaste(
    event: ClipboardEvent<HTMLElement>,
  ): Promise<void> {
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

  async function handleAttachmentFiles(files: FileList | null): Promise<void> {
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

  function updateThinking(patch: Partial<RunThinkingConfig>): void {
    setThinking((current) => {
      const updated = updateThinkingState(current, patch);
      persistThinkingState(updated);
      return updated;
    });
  }
}

function appendComposerToken(draft: string, token: string): string {
  if (!draft) {
    return token;
  }
  return /\s$/.test(draft) ? `${draft}${token}` : `${draft} ${token}`;
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
