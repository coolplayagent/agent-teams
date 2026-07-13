import {
  App,
  Button,
  Popover,
  Segmented,
  Select,
  Space,
  Tooltip,
  Typography,
} from "antd";
import { Sender } from "@ant-design/x";
import type { SenderRef } from "@ant-design/x/es/sender";
import {
  Brain,
  ChevronDown,
  Mic,
  MicOff,
  Plus,
  Play,
  Send,
  Settings2,
  Square,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import { showFeedbackMessage } from "../../components/feedbackMessages";
import { ChoiceControl } from "../../components/ChoiceControl";
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
import {
  PromptMentionMenu,
  promptMentionOptionId,
} from "./PromptMentionMenu";
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
  type PromptActionMentionOption,
  type PromptSkillMentionOption,
} from "./PromptMentions";
import { useVoiceInput } from "./useVoiceInput";
import {
  DEFAULT_THINKING_EFFORT,
  GENERAL_RUN_PREFERENCES_QUERY_KEY,
  persistThinkingState,
  readSavedThinkingState,
  shellSafetyPolicyPreference,
  updateThinkingState,
} from "./runPreferences";
import "./Composer.css";

interface ComposerProps {
  runStreamController: RunStreamController;
  sessionId: string | null;
}

const MENTION_PAGE_SIZE = 8;

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
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const mentionAnchorRef = useRef<HTMLDivElement | null>(null);
  const quickMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const sessionIdRef = useRef(sessionId);
  const [draft, setDraft] = useState("");
  const [promptAttachments, setPromptAttachments] = useState<PromptAttachment[]>([]);
  const [composerStatus, setComposerStatus] = useState("");
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const mentionMenuId = useId();
  const [dismissedMentionDraft, setDismissedMentionDraft] = useState("");
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
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
    enabled: promptCommandContext !== null || quickMenuOpen,
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
  const quickActionOptions = useMemo<PromptActionMentionOption[]>(
    () => [
      {
        actionId: "browse-workspace",
        aliases: ["file", "folder", "context"],
        description: t("composerBrowseWorkspaceHelp"),
        displayName: t("composerBrowseWorkspace"),
        insertTerm: "",
        kind: "action",
      },
      {
        actionId: "attach-image",
        aliases: ["image", "attachment"],
        description: t("composerAddImageHelp"),
        displayName: t("composerAddImage"),
        insertTerm: "",
        kind: "action",
      },
      {
        actionId: "toggle-thinking",
        aliases: ["thinking"],
        description: t("composerThinkingEffort"),
        displayName: thinking.enabled
          ? t("composerDisableThinking")
          : t("composerEnableThinking"),
        insertTerm: "",
        kind: "action",
      },
      {
        actionId: "use-normal-mode",
        aliases: ["normal"],
        description: t("composerRootRole"),
        displayName: t("composerSwitchNormal"),
        insertTerm: "",
        kind: "action",
      },
      {
        actionId: "use-orchestration-mode",
        aliases: ["orchestration"],
        description: t("composerOrchestrationPreset"),
        displayName: t("composerSwitchOrchestration"),
        insertTerm: "",
        kind: "action",
      },
    ],
    [t, thinking.enabled],
  );
  const quickCommandOptions = useMemo(
    () =>
      findPromptSlashMentionOptions({
        catalog: commandCatalogQuery.data,
        query: "",
        roleOptions: roleOptionsQuery.data,
        workspaceId: sessionWorkspaceId,
      }),
    [commandCatalogQuery.data, roleOptionsQuery.data, sessionWorkspaceId],
  );
  const quickMentionOptions = useMemo(
    () =>
      findPromptResourceMentionOptions({
        query: "",
        resourceResponse: undefined,
        roleOptions: roleOptionsQuery.data,
      }),
    [roleOptionsQuery.data],
  );
  const promptMentionOptions = quickMenuOpen
    ? [...quickActionOptions, ...quickMentionOptions, ...quickCommandOptions]
    : promptCommandContext !== null
      ? commandMentionOptions
      : promptResourceContext !== null
        ? resourceMentionOptions
        : leadingMentionOptions;
  const mentionMenuOpen =
    quickMenuOpen ||
    promptCommandContext !== null ||
    promptResourceContext !== null ||
    leadingMentionOptions.length > 0;
  const mentionMenuLoading = quickMenuOpen
    ? commandCatalogQuery.isLoading || roleOptionsQuery.isLoading
    : promptCommandContext !== null
      ? commandCatalogQuery.isLoading || roleOptionsQuery.isLoading
      : promptResourceContext !== null
        ? roleOptionsQuery.isLoading ||
          (promptResourceContext.query.length > 0 && resourceSearchQuery.isLoading)
        : false;
  const mentionMenuEmptyLabel = quickMenuOpen
    ? t("settingsCommandsNoMatches")
    : promptCommandContext !== null
      ? t("settingsCommandsNoMatches")
      : promptResourceContext?.query
        ? t("workspaceNoFileMatches")
        : t("settingsNoRoles");
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
        shellSafetyPolicyPreference(generalConfigQuery.data),
      );
    }
  }, [generalConfigQuery.data]);

  useEffect(() => {
    setActiveMentionIndex(0);
  }, [promptMentionOptions.length, quickMenuOpen]);

  useEffect(() => {
    const promptInput = inputRef.current?.nativeElement.querySelector("textarea");
    if (promptInput === undefined || promptInput === null) {
      return;
    }
    promptInput.setAttribute("role", "combobox");
    promptInput.setAttribute("aria-autocomplete", "list");
    promptInput.setAttribute("aria-haspopup", "listbox");
    promptInput.setAttribute("aria-expanded", String(mentionMenuOpen));
    if (mentionMenuOpen) {
      promptInput.setAttribute("aria-controls", mentionMenuId);
    } else {
      promptInput.removeAttribute("aria-controls");
    }
    if (mentionMenuOpen && promptMentionOptions.length > 0) {
      promptInput.setAttribute(
        "aria-activedescendant",
        promptMentionOptionId(
          mentionMenuId,
          Math.min(activeMentionIndex, promptMentionOptions.length - 1),
        ),
      );
    } else {
      promptInput.removeAttribute("aria-activedescendant");
    }
  }, [activeMentionIndex, mentionMenuId, mentionMenuOpen, promptMentionOptions.length]);

  useEffect(() => {
    if (!mentionMenuOpen) {
      return;
    }
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        mentionAnchorRef.current?.contains(target) ||
        quickMenuButtonRef.current?.contains(target) ||
        target.closest(".at-prompt-mention-menu") !== null
      ) {
        return;
      }
      setQuickMenuOpen(false);
      setDismissedMentionDraft(draft);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [draft, mentionMenuOpen]);

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
        <div className="at-composer-prompt-anchor" ref={mentionAnchorRef}>
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
              setQuickMenuOpen(false);
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
            anchorRef={mentionAnchorRef}
            emptyLabel={mentionMenuEmptyLabel}
            loading={mentionMenuLoading}
            loadingLabel={t("connectorsRuntimeToolsStatusLoading")}
            menuLabel={t("composerPromptSuggestions")}
            menuId={mentionMenuId}
            onSelect={selectPromptMentionOption}
            open={mentionMenuOpen}
            options={promptMentionOptions}
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
                aria-expanded={quickMenuOpen}
                aria-label={t("composerQuickActions")}
                className={quickMenuOpen ? "at-composer-plus-button is-active" : "at-composer-plus-button"}
                icon={<Plus size={17} />}
                onClick={() => {
                  setDismissedMentionDraft("");
                  setQuickMenuOpen((current) => !current);
                  queueMicrotask(() => inputRef.current?.focus());
                }}
                shape="circle"
                size="small"
                type="text"
                ref={quickMenuButtonRef}
              />
            </Tooltip>
            <Tooltip title={composerTopologySummary}>
              <Popover
                arrow={false}
                content={(
                <div className="at-composer-advanced-panel">
                  <div className="at-composer-advanced-heading">
                    <Settings2 aria-hidden size={16} />
                    <Typography.Text strong>{t("composerMode")}</Typography.Text>
                  </div>
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
                </div>
                )}
                overlayClassName="at-composer-advanced-popover"
                placement="topLeft"
                trigger="click"
              >
                <Button
                  aria-label={`${t("composerMode")}: ${composerTopologySummary}`}
                  className="at-composer-summary-button at-composer-topology-summary"
                  icon={<Settings2 size={15} />}
                  size="small"
                  type="text"
                >
                  <span aria-hidden className="at-composer-summary-copy at-composer-summary-full">
                    {composerTopologySummary}
                  </span>
                  <span aria-hidden className="at-composer-summary-copy at-composer-summary-compact">
                    {abbreviateComposerModeLabel(composerModeLabel)}
                  </span>
                  <ChevronDown aria-hidden size={13} />
                </Button>
              </Popover>
            </Tooltip>
            <Popover
              arrow={false}
              content={(
                <div className="at-composer-advanced-panel at-composer-model-panel">
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
                </div>
              )}
              overlayClassName="at-composer-advanced-popover"
              placement="topLeft"
              trigger="click"
            >
              <Button
                aria-label={t("composerModelProfile")}
                className="at-composer-summary-button at-composer-model-summary"
                size="small"
                type="text"
              >
                <span className="at-composer-summary-copy">
                  {modelProfileOptions.find(
                    (option) => option.value === selectedModelProfile,
                  )?.label ?? t("composerModel")}
                </span>
                <ChevronDown aria-hidden size={13} />
              </Button>
            </Popover>
            <Tooltip title={t("composerThinking") }>
              <Button
                aria-label={t("composerThinking")}
                className={thinking.enabled ? "at-composer-state-button is-active" : "at-composer-state-button"}
                icon={<Brain size={15} />}
                onClick={() => updateThinking({ enabled: !thinking.enabled })}
                size="small"
                type="text"
              >
                {thinking.enabled
                  ? thinkingEffortOptions(t).find(
                      (option) => option.value === thinking.effort,
                    )?.label ?? t("composerThinking")
                  : t("composerThinking")}
              </Button>
            </Tooltip>
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
                      readPromptSelection(draft, inputRef.current?.nativeElement),
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
      inputRef.current?.focus();
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
      inputRef.current?.focus();
    } catch (error) {
      setComposerStatus(
        error instanceof Error ? error.message : "Failed to read image attachment.",
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
    if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      const direction = event.key === "PageDown" ? 1 : -1;
      setActiveMentionIndex((current) =>
        clampIndex(
          current + direction * MENTION_PAGE_SIZE,
          promptMentionOptions.length,
        ),
      );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveMentionIndex(
        event.key === "Home" ? 0 : promptMentionOptions.length - 1,
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
      setQuickMenuOpen(false);
      setDismissedMentionDraft(draft);
    }
  }

  function selectPromptMentionOption(option: PromptMentionOption | undefined) {
    if (option === undefined) {
      return;
    }
    if (option.kind === "action") {
      if (option.actionId === "attach-image") {
        attachmentInputRef.current?.click();
      } else if (option.actionId === "browse-workspace") {
        setDraft((currentDraft) => appendComposerToken(currentDraft, "@"));
        setDismissedMentionDraft("");
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
      setQuickMenuOpen(false);
      inputRef.current?.focus();
      return;
    }
    if (option.kind === "command" || option.kind === "skill") {
      setSelectedPromptSkill(option.kind === "skill" ? option : null);
      setDraft((currentDraft) => {
        const context = promptCommandContext ?? getPromptCommandContext(currentDraft);
        return context === null
          ? `/${option.insertTerm} `
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
    setQuickMenuOpen(false);
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
  // semantic-special-case-allow: prompt-command-prefix — "/" is public command syntax.
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

function abbreviateComposerModeLabel(label: string): string {
  const characters = Array.from(label.trim());
  return characters.length > 6 ? `${characters.slice(0, 4).join("")}.` : label;
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
    normalizeProfileName(roleOptions?.normal_mode_roles?.[0]?.role_id)
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

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
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
