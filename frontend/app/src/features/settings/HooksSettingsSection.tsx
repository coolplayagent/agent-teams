import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { App, Button, Input, Popconfirm, Select, Typography } from "antd";
import { useEffect, useRef, useState } from "react";

import {
  getHookRuntimeView,
  getHooksConfig,
  getRoleConfigOptions,
  saveHooksConfig,
  validateHooksConfig,
} from "../../api/client";
import type {
  HookRuntimeSource,
  HooksConfigPayload,
  JsonValue,
  LoadedHookRecord,
  RoleConfigOptions,
  RoleOption,
} from "../../api/contracts";
import { ApiError } from "../../api/http";
import { ChoiceControl } from "../../components/ChoiceControl";
import { useTranslations, type Translate } from "../../i18n";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";

const HOOK_EVENTS = [
  "SessionStart",
  "SessionEnd",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  "TaskCreated",
  "TaskCompleted",
  "PreCompact",
  "PostCompact",
  "InstructionsLoaded",
  "Notification",
];

const HANDLER_TYPES = ["command", "http", "prompt", "agent"];
const ON_ERROR_OPTIONS = ["ignore", "fail"];
const MATCHER_UNSUPPORTED_EVENTS = new Set([
  "UserPromptSubmit",
  "Stop",
  "TaskCreated",
  "TaskCompleted",
]);
const TOOL_EVENTS = new Set([
  "PreToolUse",
  "PermissionRequest",
  "PermissionDenied",
  "PostToolUse",
  "PostToolUseFailure",
]);
const COMMAND_ONLY_EVENTS = new Set(["SessionStart"]);
const COMMAND_HTTP_ONLY_EVENTS = new Set([
  "SessionEnd",
  "StopFailure",
  "SubagentStart",
  "InstructionsLoaded",
  "Notification",
  "PreCompact",
  "PostCompact",
]);

const MATCHER_PLACEHOLDERS: Record<string, string> = {
  InstructionsLoaded: "initial",
  Notification: "run_failed",
  PermissionDenied: "shell",
  PermissionRequest: "shell",
  PostCompact: "token_threshold",
  PostToolUse: "read|write",
  PostToolUseFailure: "shell",
  PreCompact: "token_threshold",
  PreToolUse: "write|edit|shell",
  SessionEnd: "completed",
  SessionStart: "resume",
  StopFailure: "tool_timeout",
  SubagentStart: "verifier",
  SubagentStop: "subagent_role_id",
};

const HOOK_NAME_PLACEHOLDERS: Record<string, string> = {
  InstructionsLoaded: "Instruction source audit",
  Notification: "Notification webhook",
  PermissionDenied: "Denied permission audit",
  PermissionRequest: "Approval policy",
  PostCompact: "Compaction audit",
  PostToolUse: "Tool result review",
  PostToolUseFailure: "Tool failure review",
  PreCompact: "Compaction preflight",
  PreToolUse: "Tool policy guard",
  SessionEnd: "Run completion archive",
  SessionStart: "Session startup setup",
  Stop: "Final answer verification",
  StopFailure: "Stop failure audit",
  SubagentStart: "Subagent launch context",
  SubagentStop: "Subagent output verification",
  TaskCompleted: "Task completion verification",
  TaskCreated: "Task creation policy",
  UserPromptSubmit: "Submitted prompt policy",
};

const HANDLER_NAME_PLACEHOLDERS: Record<string, string> = {
  InstructionsLoaded: "Review loaded instructions",
  Notification: "Send notification payload",
  PermissionDenied: "Record denied permission",
  PermissionRequest: "Review approval request",
  PostCompact: "Record compaction result",
  PostToolUse: "Review tool result",
  PostToolUseFailure: "Inspect tool failure",
  PreCompact: "Review compaction request",
  PreToolUse: "Check tool policy",
  SessionEnd: "Archive run summary",
  SessionStart: "Prepare session environment",
  Stop: "Verify final answer",
  StopFailure: "Inspect stop failure",
  SubagentStart: "Prepare subagent context",
  SubagentStop: "Verify subagent output",
  TaskCompleted: "Verify completed task",
  TaskCreated: "Inspect new task",
  UserPromptSubmit: "Review submitted prompt",
};

const IF_RULE_PLACEHOLDERS: Record<string, string> = {
  PermissionDenied: "shell(rm *)",
  PermissionRequest: "shell(npm publish*)",
  PostToolUse: "write(*.py)",
  PostToolUseFailure: "shell(*)",
  PreToolUse: "shell(git *)",
};

const COMMAND_PLACEHOLDERS: Record<string, string> = {
  InstructionsLoaded: "python .relay/hooks/instructions_loaded.py",
  Notification: "python .relay/hooks/notify.py",
  PermissionDenied: "python .relay/hooks/permission_denied.py",
  PermissionRequest: "python .relay/hooks/approval_policy.py",
  PostCompact: "python .relay/hooks/post_compact.py",
  PostToolUse: "python .relay/hooks/post_tool_review.py",
  PostToolUseFailure: "python .relay/hooks/tool_failure.py",
  PreCompact: "python .relay/hooks/pre_compact.py",
  PreToolUse: "python .relay/hooks/tool_policy.py",
  SessionEnd: "python .relay/hooks/session_end.py",
  SessionStart: "python .relay/hooks/session_start.py",
  Stop: "python .relay/hooks/verify_stop.py",
  StopFailure: "python .relay/hooks/stop_failure.py",
  SubagentStart: "python .relay/hooks/subagent_start.py",
  SubagentStop: "python .relay/hooks/subagent_stop.py",
  TaskCompleted: "python .relay/hooks/task_completed.py",
  TaskCreated: "python .relay/hooks/task_created.py",
  UserPromptSubmit: "python .relay/hooks/prompt_policy.py",
};

const URL_PLACEHOLDERS: Record<string, string> = {
  InstructionsLoaded: "https://example.test/hooks/instructions-loaded",
  Notification: "https://example.test/hooks/notification",
  PermissionDenied: "https://example.test/hooks/permission-denied",
  PermissionRequest: "https://example.test/hooks/approval",
  PostCompact: "https://example.test/hooks/post-compact",
  PostToolUse: "https://example.test/hooks/tool-result",
  PostToolUseFailure: "https://example.test/hooks/tool-failure",
  PreCompact: "https://example.test/hooks/pre-compact",
  PreToolUse: "https://example.test/hooks/tool-policy",
  SessionEnd: "https://example.test/hooks/session-end",
  Stop: "https://example.test/hooks/final-answer",
  StopFailure: "https://example.test/hooks/stop-failure",
  SubagentStart: "https://example.test/hooks/subagent-start",
  SubagentStop: "https://example.test/hooks/subagent-stop",
  TaskCompleted: "https://example.test/hooks/task-completed",
  TaskCreated: "https://example.test/hooks/task-created",
  UserPromptSubmit: "https://example.test/hooks/prompt-policy",
};

const PROMPT_PLACEHOLDERS: Record<string, string> = {
  PermissionDenied: "Summarize the denied permission for follow-up context.",
  PermissionRequest: "Review whether this approval request should be allowed.",
  PostToolUse: "Review the tool result and add useful follow-up context.",
  PostToolUseFailure: "Review the tool failure and suggest next steps.",
  PreToolUse: "Review whether this tool call should continue.",
  Stop: "Review whether the pending answer is complete and verified.",
  SubagentStop: "Review whether the subagent output satisfies the task.",
  TaskCompleted: "Review whether the completed task output is sufficient.",
  TaskCreated: "Review whether the new task should be accepted.",
  UserPromptSubmit: "Review the submitted prompt and return a hook decision JSON object.",
};

interface HookGroupDraft {
  extra: Record<string, JsonValue>;
  eventName: string;
  handlers: HookHandlerDraft[];
  id: string;
  isNew: boolean;
  matcher: string;
  name: string;
  roleIds: string[];
  runKinds: string[];
  sessionModes: string[];
}

interface HookHandlerDraft {
  allowedEnvVars: string;
  command: string;
  extra: Record<string, JsonValue>;
  headers: string;
  id: string;
  ifRule: string;
  name: string;
  onError: string;
  prompt: string;
  roleId: string;
  runAsync: boolean;
  statusMessage: string;
  timeout: string;
  type: string;
  url: string;
}

type HookMutationAction = "delete" | "save" | "validate";

interface DeleteAutosaveRequest {
  nextSavedGroups: HookGroupDraft[];
  removedGroup: HookGroupDraft;
  removedIndex: number;
}

interface HookErrorLocation {
  eventName: string | null;
  fieldName: string | null;
  groupIndex: number | null;
  handlerIndex: number | null;
}

interface HookErrorReason {
  includeLocation: boolean;
  text: string;
}

export function HooksSettingsSection() {
  const t = useTranslations();
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const nextIdRef = useRef(1);
  const savedGroupsRef = useRef<HookGroupDraft[]>([]);
  const [groups, setGroups] = useState<HookGroupDraft[]>([]);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const hooksQuery = useQuery({
    queryKey: ["settings", "hooks", "config"],
    queryFn: getHooksConfig,
  });
  const runtimeQuery = useQuery({
    queryKey: ["settings", "hooks", "runtime"],
    queryFn: getHookRuntimeView,
  });
  const roleOptionsQuery = useQuery({
    queryKey: ["settings", "hooks", "roles", "options"],
    queryFn: getRoleConfigOptions,
  });
  const loadedHooks = runtimeQuery.data?.loaded_hooks ?? [];
  const sources = runtimeQuery.data?.sources ?? [];
  const configLoading = hooksQuery.isLoading;
  const hasConfigData = hooksQuery.data !== undefined;
  const hasConfigLoadError = hooksQuery.error !== null;
  const hasLocalDraft = groups.some((group) => group.isNew);
  const canShowEditor =
    !configLoading && (hasConfigData || hasConfigLoadError || groups.length > 0);
  const showConfigError = hasConfigLoadError && !hasLocalDraft && groups.length === 0;

  useEffect(() => {
    if (hooksQuery.data !== undefined) {
      const loadedGroups = deserializeHooksConfig(hooksQuery.data);
      savedGroupsRef.current = loadedGroups;
      setGroups(loadedGroups);
      setEditingGroupId(null);
    }
  }, [hooksQuery.data]);

  const validateMutation = useMutation({
    mutationFn: () => validateHooksConfig(serializeHooksConfig(groups, t)),
    onSuccess: () => {
      void message.success(t("settingsHooksValidated"));
    },
    onError: (mutationError) => {
      void message.error(hooksMutationError(mutationError, "validate", t));
    },
  });
  const saveMutation = useMutation({
    mutationFn: () => saveHooksConfig(serializeHooksConfig(groups, t)),
    onSuccess: (config) => {
      const savedGroups = deserializeHooksConfig(config);
      savedGroupsRef.current = savedGroups;
      setGroups(savedGroups);
      setEditingGroupId(null);
      void message.success(t("settingsHooksSaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "hooks"] });
    },
    onError: (mutationError) => {
      void message.error(hooksMutationError(mutationError, "save", t));
    },
  });
  const deleteAutosaveMutation = useMutation({
    mutationFn: ({ nextSavedGroups }: DeleteAutosaveRequest) =>
      saveHooksConfig(serializeHooksConfig(nextSavedGroups, t)),
    onSuccess: (config) => {
      savedGroupsRef.current = deserializeHooksConfig(config);
    },
    onError: (mutationError, request) => {
      setGroups((current) => {
        if (current.some((group) => group.id === request.removedGroup.id)) {
          return current;
        }
        const insertAt = Math.min(request.removedIndex, current.length);
        return [
          ...current.slice(0, insertAt),
          request.removedGroup,
          ...current.slice(insertAt),
        ];
      });
      void message.error(hooksMutationError(mutationError, "delete", t));
    },
  });

  function nextDraftId(prefix: string): string {
    const id = `${prefix}-${nextIdRef.current}`;
    nextIdRef.current += 1;
    return id;
  }

  function addHookGroup() {
    const nextGroup = createDefaultGroup(nextDraftId("hook"), nextDraftId("handler"));
    setGroups((current) => [...current, nextGroup]);
    setEditingGroupId(nextGroup.id);
  }

  function updateGroup(groupId: string, updater: (group: HookGroupDraft) => HookGroupDraft) {
    setGroups((current) =>
      current.map((group) => (group.id === groupId ? updater(group) : group)),
    );
  }

  function updateHandler(
    groupId: string,
    handlerId: string,
    updater: (handler: HookHandlerDraft) => HookHandlerDraft,
  ) {
    updateGroup(groupId, (group) => ({
      ...group,
      handlers: group.handlers.map((handler) =>
        handler.id === handlerId ? updater(handler) : handler,
      ),
    }));
  }

  function addHandler(groupId: string) {
    updateGroup(groupId, (group) => ({
      ...group,
      handlers: [
        ...group.handlers,
        createDefaultHandler(nextDraftId("handler"), group.eventName),
      ],
    }));
  }

  function removeHandler(groupId: string, handlerId: string) {
    updateGroup(groupId, (group) => ({
      ...group,
      handlers: group.handlers.filter((handler) => handler.id !== handlerId),
    }));
  }

  function removeGroup(groupId: string) {
    const removedIndex = groups.findIndex((group) => group.id === groupId);
    const removedGroup = removedIndex >= 0 ? groups[removedIndex] : undefined;
    setGroups((current) => current.filter((group) => group.id !== groupId));
    if (editingGroupId === groupId) {
      setEditingGroupId(null);
    }
    if (removedGroup !== undefined && !removedGroup.isNew) {
      const nextSavedGroups = savedGroupsRef.current.filter((group) => group.id !== groupId);
      deleteAutosaveMutation.mutate({ nextSavedGroups, removedGroup, removedIndex });
    }
  }

  const roleOptions = hookRoleOptions(roleOptionsQuery.data);
  const runtimeUnavailable = runtimeQuery.error !== null;

  return (
    <SettingsSection title={t("settingsHooks")}>
      <SettingsQueryState error={showConfigError ? hooksQuery.error : null} loading={configLoading} />
      {canShowEditor ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsHooksConfigured")} value={String(groups.length)} />
            <Fact label={t("settingsHooksLoaded")} value={String(loadedHooks.length)} />
            <Fact label={t("settingsHooksSources")} value={String(sources.length)} />
          </div>
          <div className="at-settings-section-actions at-hooks-toolbar">
            <Button
              icon={<RefreshCw size={15} />}
              loading={hooksQuery.isFetching || runtimeQuery.isFetching}
              onClick={() => {
                void hooksQuery.refetch();
                void runtimeQuery.refetch();
                void roleOptionsQuery.refetch();
              }}
            >
              {t("settingsHooksRefresh")}
            </Button>
            <Button icon={<Plus size={15} />} onClick={addHookGroup}>
              {t("settingsHooksAdd")}
            </Button>
            <Button
              loading={validateMutation.isPending}
              onClick={() => validateMutation.mutate()}
            >
              {t("settingsHooksValidate")}
            </Button>
            <Button
              loading={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              type="primary"
            >
              {t("settingsHooksSave")}
            </Button>
          </div>
          <div className="at-settings-form-layout at-hooks-config-list">
            {groups.length === 0 ? (
              <div className="at-settings-empty">{t("settingsHooksConfiguredEmpty")}</div>
            ) : (
              groups.map((group) => (
                <HookGroupCard
                  group={group}
                  isEditing={editingGroupId === group.id}
                  key={group.id}
                  onAddHandler={() => addHandler(group.id)}
                  onCancel={() => {
                    if (group.isNew) {
                      removeGroup(group.id);
                    } else {
                      setEditingGroupId(null);
                      if (hooksQuery.data !== undefined) {
                        setGroups(deserializeHooksConfig(hooksQuery.data));
                      }
                    }
                  }}
                  onEdit={() => setEditingGroupId(group.id)}
                  onRemove={() => removeGroup(group.id)}
                  onRemoveHandler={(handlerId) => removeHandler(group.id, handlerId)}
                  onUpdate={(updater) => updateGroup(group.id, updater)}
                  onUpdateHandler={(handlerId, updater) =>
                    updateHandler(group.id, handlerId, updater)
                  }
                  roleOptions={roleOptions}
                  t={t}
                />
              ))
            )}
          </div>
          {runtimeUnavailable ? (
            <SettingsQueryState error={runtimeQuery.error} loading={runtimeQuery.isLoading} />
          ) : (
            <HookRuntimePanel hooks={loadedHooks} sources={sources} />
          )}
        </>
      ) : null}
    </SettingsSection>
  );
}

function HookGroupCard({
  group,
  isEditing,
  onAddHandler,
  onCancel,
  onEdit,
  onRemove,
  onRemoveHandler,
  onUpdate,
  onUpdateHandler,
  roleOptions,
  t,
}: {
  group: HookGroupDraft;
  isEditing: boolean;
  onAddHandler: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onRemoveHandler: (handlerId: string) => void;
  onUpdate: (updater: (group: HookGroupDraft) => HookGroupDraft) => void;
  onUpdateHandler: (
    handlerId: string,
    updater: (handler: HookHandlerDraft) => HookHandlerDraft,
  ) => void;
  roleOptions: Array<{ label: string; value: string }>;
  t: Translate;
}) {
  const matcherSupported = !MATCHER_UNSUPPORTED_EVENTS.has(group.eventName);
  const handlerTypeSummary = summarizeHandlerTypes(group.handlers, t);
  if (!isEditing) {
    return (
      <div className="at-settings-form-card-layout at-hooks-config-card">
        <div className="at-hooks-card-head">
          <div className="at-settings-list-main">
            <span>{group.name.trim() || hookNamePlaceholder(group.eventName)}</span>
            <Typography.Text ellipsis title={group.eventName}>
              {group.eventName}
              {matcherSupported && group.matcher.trim() !== ""
                ? ` · ${group.matcher.trim()}`
                : ""}
            </Typography.Text>
          </div>
          <div className="at-plugin-actions">
            <Button onClick={onEdit} size="small">
              {t("settingsHooksEdit")}
            </Button>
            <Popconfirm
              onConfirm={onRemove}
              title={t("settingsHooksDeleteConfirm")}
            >
              <Button danger icon={<Trash2 size={14} />} size="small">
                {t("settingsHooksDelete")}
              </Button>
            </Popconfirm>
          </div>
        </div>
        <div className="at-hooks-detail-grid">
          <Fact label={t("settingsHooksEvent")} value={group.eventName} />
          <Fact
            label={t("settingsHooksMatcher")}
            value={matcherSupported ? group.matcher.trim() || "-" : t("settingsHooksMatcherNone")}
          />
          <Fact label={t("settingsHooksHandlerCount")} value={String(group.handlers.length)} />
          <Fact label={t("settingsHooksHandlerType")} value={handlerTypeSummary} />
        </div>
      </div>
    );
  }

  return (
    <div className="at-settings-form-card-layout at-hooks-config-card at-hooks-config-card-editing">
      <div className="at-hooks-card-head">
        <div className="at-settings-list-main">
          <span>{group.name.trim() || hookNamePlaceholder(group.eventName)}</span>
          <Typography.Text>{group.eventName}</Typography.Text>
        </div>
        <div className="at-plugin-actions">
          <Button onClick={onCancel} size="small">
            {t("settingsHooksCancel")}
          </Button>
          <Popconfirm onConfirm={onRemove} title={t("settingsHooksDeleteConfirm")}>
            <Button danger icon={<Trash2 size={14} />} size="small">
              {t("settingsHooksDelete")}
            </Button>
          </Popconfirm>
        </div>
      </div>
      <div className="at-settings-form-grid-layout at-hooks-group-grid">
        <label className="at-settings-field">
          <span>{t("settingsHooksName")}</span>
          <Input
            onChange={(event) =>
              onUpdate((current) => ({ ...current, name: event.target.value }))
            }
            placeholder={hookNamePlaceholder(group.eventName)}
            value={group.name}
          />
        </label>
        <label className="at-settings-field">
          <span>{t("settingsHooksEvent")}</span>
          <Select
            aria-label={t("settingsHooksEvent")}
            disabled={!group.isNew}
            onChange={(eventName) =>
              onUpdate((current) => ({
                ...current,
                eventName,
                handlers: current.handlers.map((handler) => normalizeHandlerType(handler, eventName)),
              }))
            }
            options={HOOK_EVENTS.map((eventName) => ({ label: eventName, value: eventName }))}
            value={group.eventName}
          />
        </label>
        <label className="at-settings-field">
          <span>{t("settingsHooksMatcher")}</span>
          {matcherSupported ? (
            <Input
              onChange={(event) =>
                onUpdate((current) => ({ ...current, matcher: event.target.value }))
              }
              placeholder={matcherPlaceholder(group.eventName)}
              value={group.matcher}
            />
          ) : (
            <Input disabled value={t("settingsHooksMatcherNone")} />
          )}
        </label>
        <label className="at-settings-field">
          <span>{t("settingsHooksRoleIds")}</span>
          <Select
            aria-label={t("settingsHooksRoleIds")}
            mode="tags"
            onChange={(roleIds) => onUpdate((current) => ({ ...current, roleIds }))}
            options={roleOptions}
            value={group.roleIds}
          />
        </label>
        <label className="at-settings-field">
          <span>{t("settingsHooksSessionModes")}</span>
          <Select
            aria-label={t("settingsHooksSessionModes")}
            mode="multiple"
            onChange={(sessionModes) =>
              onUpdate((current) => ({ ...current, sessionModes }))
            }
            options={[
              { label: "normal", value: "normal" },
              { label: "orchestration", value: "orchestration" },
            ]}
            value={group.sessionModes}
          />
        </label>
        <label className="at-settings-field">
          <span>{t("settingsHooksRunKinds")}</span>
          <Select
            aria-label={t("settingsHooksRunKinds")}
            mode="multiple"
            onChange={(runKinds) => onUpdate((current) => ({ ...current, runKinds }))}
            options={[
              { label: "foreground", value: "foreground" },
              { label: "background", value: "background" },
            ]}
            value={group.runKinds}
          />
        </label>
      </div>
      <div className="at-hooks-handler-stack">
        <div className="at-hooks-subhead">
          <Typography.Text strong>{t("settingsHooksHandlers")}</Typography.Text>
          <Button icon={<Plus size={14} />} onClick={onAddHandler} size="small">
            {t("settingsHooksAddHandler")}
          </Button>
        </div>
        {group.handlers.map((handler, index) => (
          <HookHandlerEditor
            eventName={group.eventName}
            handler={handler}
            index={index}
            key={handler.id}
            onRemove={() => onRemoveHandler(handler.id)}
            onUpdate={(updater) => onUpdateHandler(handler.id, updater)}
            roleOptions={roleOptions}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

function HookHandlerEditor({
  eventName,
  handler,
  index,
  onRemove,
  onUpdate,
  roleOptions,
  t,
}: {
  eventName: string;
  handler: HookHandlerDraft;
  index: number;
  onRemove: () => void;
  onUpdate: (updater: (handler: HookHandlerDraft) => HookHandlerDraft) => void;
  roleOptions: Array<{ label: string; value: string }>;
  t: Translate;
}) {
  const allowedTypes = allowedHandlerTypes(eventName);
  return (
    <div className="at-hooks-handler-card">
      <div className="at-hooks-handler-head">
        <Typography.Text strong>
          {handler.name.trim() || `${t("settingsHooksHandler")} ${index + 1}`}
        </Typography.Text>
        <Button danger onClick={onRemove} size="small">
          {t("settingsHooksDeleteHandler")}
        </Button>
      </div>
      <div className="at-settings-form-grid-layout">
        <label className="at-settings-field">
          <span>{t("settingsHooksName")}</span>
          <Input
            onChange={(event) =>
              onUpdate((current) => ({ ...current, name: event.target.value }))
            }
            placeholder={handlerNamePlaceholder(eventName)}
            value={handler.name}
          />
        </label>
        <label className="at-settings-field">
          <span>{t("settingsHooksHandlerType")}</span>
          <Select
            aria-label={t("settingsHooksHandlerType")}
            onChange={(type) =>
              onUpdate((current) => normalizeHandlerType({ ...current, type }, eventName))
            }
            options={allowedTypes.map((type) => ({ label: type, value: type }))}
            value={handler.type}
          />
        </label>
        {TOOL_EVENTS.has(eventName) ? (
          <label className="at-settings-field">
            <span>{t("settingsHooksIfRule")}</span>
            <Input
              onChange={(event) =>
                onUpdate((current) => ({ ...current, ifRule: event.target.value }))
              }
              placeholder={ifRulePlaceholder(eventName)}
              value={handler.ifRule}
            />
          </label>
        ) : null}
        <label className="at-settings-field">
          <span>{t("settingsHooksTimeout")}</span>
          <Input
            onChange={(event) =>
              onUpdate((current) => ({ ...current, timeout: event.target.value }))
            }
            placeholder="5"
            value={handler.timeout}
          />
        </label>
        <label className="at-settings-field">
          <span>{t("settingsHooksOnError")}</span>
          <Select
            aria-label={t("settingsHooksOnError")}
            onChange={(onError) => onUpdate((current) => ({ ...current, onError }))}
            options={ON_ERROR_OPTIONS.map((value) => ({ label: value, value }))}
            value={handler.onError}
          />
        </label>
        <ChoiceControl
          checked={handler.runAsync}
          className="at-settings-switch-field"
          kind="switch"
          label={t("settingsHooksRunAsync")}
          onChange={(runAsync) => onUpdate((current) => ({ ...current, runAsync }))}
          variant="row"
        />
        <label className="at-settings-field at-settings-field-wide">
          <span>{t("settingsHooksStatusMessage")}</span>
          <Input
            onChange={(event) =>
              onUpdate((current) => ({ ...current, statusMessage: event.target.value }))
            }
            placeholder={t("settingsHooksStatusMessagePlaceholder")}
            value={handler.statusMessage}
          />
        </label>
        <HookTypeFields
          eventName={eventName}
          handler={handler}
          onUpdate={onUpdate}
          roleOptions={roleOptions}
          t={t}
        />
      </div>
    </div>
  );
}

function HookTypeFields({
  eventName,
  handler,
  onUpdate,
  roleOptions,
  t,
}: {
  eventName: string;
  handler: HookHandlerDraft;
  onUpdate: (updater: (handler: HookHandlerDraft) => HookHandlerDraft) => void;
  roleOptions: Array<{ label: string; value: string }>;
  t: Translate;
}) {
  if (handler.type === "http") {
    return (
      <>
        <label className="at-settings-field">
          <span>{t("settingsHooksUrl")}</span>
          <Input
            onChange={(event) =>
              onUpdate((current) => ({ ...current, url: event.target.value }))
            }
            placeholder={urlPlaceholder(eventName)}
            value={handler.url}
          />
        </label>
        <label className="at-settings-field at-settings-field-wide">
          <span>{t("settingsHooksHeaders")}</span>
          <Input.TextArea
            onChange={(event) =>
              onUpdate((current) => ({ ...current, headers: event.target.value }))
            }
            placeholder={'{\n  "Authorization": "Bearer $HOOK_TOKEN"\n}'}
            rows={4}
            value={handler.headers}
          />
        </label>
        <label className="at-settings-field at-settings-field-wide">
          <span>{t("settingsHooksAllowedEnvVars")}</span>
          <Input
            onChange={(event) =>
              onUpdate((current) => ({ ...current, allowedEnvVars: event.target.value }))
            }
            placeholder="HOOK_TOKEN,CI"
            value={handler.allowedEnvVars}
          />
        </label>
      </>
    );
  }
  if (handler.type === "prompt") {
    return (
      <label className="at-settings-field at-settings-field-wide">
        <span>{t("settingsHooksPrompt")}</span>
        <Input.TextArea
          onChange={(event) =>
            onUpdate((current) => ({ ...current, prompt: event.target.value }))
          }
          placeholder={promptPlaceholder(eventName)}
          rows={5}
          value={handler.prompt}
        />
      </label>
    );
  }
  if (handler.type === "agent") {
    return (
      <>
        <label className="at-settings-field">
          <span>{t("settingsHooksAgentRole")}</span>
          <Select
            aria-label={t("settingsHooksAgentRole")}
            onChange={(roleId) => onUpdate((current) => ({ ...current, roleId }))}
            options={roleOptions}
            placeholder={t("settingsHooksSelectAgentRole")}
            value={handler.roleId || undefined}
          />
        </label>
        <label className="at-settings-field at-settings-field-wide">
          <span>{t("settingsHooksPrompt")}</span>
          <Input.TextArea
            onChange={(event) =>
              onUpdate((current) => ({ ...current, prompt: event.target.value }))
            }
            placeholder={promptPlaceholder(eventName)}
            rows={5}
            value={handler.prompt}
          />
        </label>
      </>
    );
  }
  return (
    <label className="at-settings-field at-settings-field-wide">
      <span>{t("settingsHooksCommand")}</span>
      <Input
        onChange={(event) =>
          onUpdate((current) => ({ ...current, command: event.target.value }))
        }
        placeholder={commandPlaceholder(eventName)}
        value={handler.command}
      />
    </label>
  );
}

function HookRuntimePanel({
  hooks,
  sources,
}: {
  hooks: LoadedHookRecord[];
  sources: HookRuntimeSource[];
}) {
  const t = useTranslations();
  return (
    <div className="at-hooks-runtime-panel">
      <div className="at-hooks-subhead">
        <Typography.Text strong>{t("settingsHooksLoaded")}</Typography.Text>
        <Typography.Text type="secondary">
          {t("settingsHooksRuntimeSources", { count: String(sources.length) })}
        </Typography.Text>
      </div>
      <HookRuntimeList hooks={hooks} />
    </div>
  );
}

function HookRuntimeList({ hooks }: { hooks: LoadedHookRecord[] }) {
  const t = useTranslations();
  if (hooks.length === 0) {
    return <div className="at-settings-empty">{t("settingsHooksEmpty")}</div>;
  }
  return (
    <div className="at-settings-list">
      {hooks.map((hook, index) => (
        <div className="at-settings-list-row" key={`${hook.name ?? hook.event ?? "hook"}-${index}`}>
          <div className="at-settings-list-main">
            <span>{hook.name ?? hook.event ?? t("settingsHooksUnnamed")}</span>
            <Typography.Text ellipsis title={hookDetail(hook)}>
              {hookDetail(hook)}
            </Typography.Text>
          </div>
          <Typography.Text
            className="at-settings-list-meta"
            ellipsis
            title={hook.source ?? "-"}
          >
            {hook.source ?? "-"}
          </Typography.Text>
        </div>
      ))}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="at-settings-fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function deserializeHooksConfig(config: HooksConfigPayload): HookGroupDraft[] {
  const hooks = config.hooks ?? {};
  const groups: HookGroupDraft[] = [];
  Object.entries(hooks).forEach(([eventName, groupValue], eventIndex) => {
    const groupValues = Array.isArray(groupValue) ? groupValue : [];
    groupValues.forEach((candidate, groupIndex) => {
      const record = asJsonRecord(candidate);
      if (record === null) {
        return;
      }
      groups.push(groupFromRecord(eventName, record, `hook-${eventIndex}-${groupIndex}`));
    });
  });
  return groups;
}

function groupFromRecord(
  eventName: string,
  record: Record<string, JsonValue>,
  id: string,
): HookGroupDraft {
  const extra = withoutKeys(record, [
    "hooks",
    "matcher",
    "name",
    "role_ids",
    "run_kinds",
    "session_modes",
  ]);
  const handlersValue = record.hooks;
  const handlers = Array.isArray(handlersValue)
    ? handlersValue
        .map((handlerValue, index) => {
          const handlerRecord = asJsonRecord(handlerValue);
          return handlerRecord === null
            ? null
            : handlerFromRecord(handlerRecord, `handler-${id}-${index}`);
        })
        .filter((handler): handler is HookHandlerDraft => handler !== null)
    : [];
  return {
    eventName,
    extra,
    handlers,
    id,
    isNew: false,
    matcher: stringValue(record.matcher),
    name: stringValue(record.name),
    roleIds: stringArray(record.role_ids),
    runKinds: stringArray(record.run_kinds),
    sessionModes: stringArray(record.session_modes),
  };
}

function handlerFromRecord(
  record: Record<string, JsonValue>,
  id: string,
): HookHandlerDraft {
  const extra = withoutKeys(record, [
    "allowed_env_vars",
    "command",
    "headers",
    "if",
    "name",
    "on_error",
    "prompt",
    "role_id",
    "run_async",
    "status_message",
    "timeout",
    "type",
    "url",
  ]);
  return normalizeHandlerType(
    {
      allowedEnvVars: stringArray(record.allowed_env_vars).join(","),
      command: stringValue(record.command),
      extra,
      headers: formatJsonValue(record.headers),
      id,
      ifRule: stringValue(record.if),
      name: stringValue(record.name),
      onError: stringValue(record.on_error) || "ignore",
      prompt: stringValue(record.prompt),
      roleId: stringValue(record.role_id),
      runAsync: booleanValue(record.run_async),
      statusMessage: stringValue(record.status_message),
      timeout: numberString(record.timeout),
      type: stringValue(record.type) || "command",
      url: stringValue(record.url),
    },
    "",
  );
}

function createDefaultGroup(groupId: string, handlerId: string): HookGroupDraft {
  const eventName = "PreToolUse";
  return {
    eventName,
    extra: {},
    handlers: [createDefaultHandler(handlerId, eventName)],
    id: groupId,
    isNew: true,
    matcher: "",
    name: "",
    roleIds: [],
    runKinds: [],
    sessionModes: [],
  };
}

function createDefaultHandler(id: string, eventName: string): HookHandlerDraft {
  return normalizeHandlerType(
    {
      allowedEnvVars: "",
      command: "",
      extra: {},
      headers: "",
      id,
      ifRule: "",
      name: "",
      onError: "ignore",
      prompt: "",
      roleId: "",
      runAsync: false,
      statusMessage: "",
      timeout: "",
      type: allowedHandlerTypes(eventName)[0] ?? "command",
      url: "",
    },
    eventName,
  );
}

function serializeHooksConfig(
  groups: HookGroupDraft[],
  t: Translate,
): HooksConfigPayload {
  const hooks: Record<string, JsonValue> = {};
  for (const group of groups) {
    const eventName = group.eventName.trim();
    if (eventName === "") {
      throw new Error(t("settingsHooksEventRequired"));
    }
    const serializedGroup = serializeHookGroup(group, t);
    const existingGroups = hooks[eventName];
    if (Array.isArray(existingGroups)) {
      hooks[eventName] = [...existingGroups, serializedGroup];
    } else {
      hooks[eventName] = [serializedGroup];
    }
  }
  return { hooks };
}

function serializeHookGroup(
  group: HookGroupDraft,
  t: Translate,
): Record<string, JsonValue> {
  const record: Record<string, JsonValue> = { ...group.extra };
  setOptionalString(record, "name", group.name);
  if (!MATCHER_UNSUPPORTED_EVENTS.has(group.eventName)) {
    setOptionalString(record, "matcher", group.matcher);
  }
  setOptionalStringArray(record, "role_ids", group.roleIds);
  setOptionalStringArray(record, "session_modes", group.sessionModes);
  setOptionalStringArray(record, "run_kinds", group.runKinds);
  record.hooks = group.handlers.map((handler) => serializeHookHandler(handler, t));
  return record;
}

function serializeHookHandler(
  handler: HookHandlerDraft,
  t: Translate,
): Record<string, JsonValue> {
  const record: Record<string, JsonValue> = { ...handler.extra };
  const type = handler.type.trim() || "command";
  record.type = type;
  setOptionalString(record, "name", handler.name);
  setOptionalString(record, "if", handler.ifRule);
  setOptionalNumber(record, "timeout", handler.timeout, t);
  setOptionalString(record, "on_error", handler.onError);
  if (handler.runAsync) {
    record.run_async = true;
  } else {
    delete record.run_async;
  }
  setOptionalString(record, "status_message", handler.statusMessage);
  if (type === "http") {
    setOptionalString(record, "url", handler.url);
    setOptionalStringArray(record, "allowed_env_vars", splitCsv(handler.allowedEnvVars));
    const headers = parseOptionalJson(handler.headers, t);
    if (headers !== null) {
      record.headers = headers;
    } else {
      delete record.headers;
    }
    return record;
  }
  if (type === "prompt") {
    if (handler.prompt.trim() === "") {
      throw new Error(t("settingsHooksPromptRequired"));
    }
    record.prompt = handler.prompt.trim();
    return record;
  }
  if (type === "agent") {
    if (handler.roleId.trim() === "") {
      throw new Error(t("settingsHooksAgentRoleRequired"));
    }
    record.role_id = handler.roleId.trim();
    if (handler.prompt.trim() === "") {
      throw new Error(t("settingsHooksPromptRequired"));
    }
    record.prompt = handler.prompt.trim();
    return record;
  }
  setOptionalString(record, "command", handler.command);
  return record;
}

function normalizeHandlerType(
  handler: HookHandlerDraft,
  eventName: string,
): HookHandlerDraft {
  const allowedTypes = allowedHandlerTypes(eventName);
  return allowedTypes.includes(handler.type)
    ? handler
    : { ...handler, type: allowedTypes[0] ?? "command" };
}

function allowedHandlerTypes(eventName: string): string[] {
  if (COMMAND_ONLY_EVENTS.has(eventName)) {
    return ["command"];
  }
  if (COMMAND_HTTP_ONLY_EVENTS.has(eventName)) {
    return ["command", "http"];
  }
  return HANDLER_TYPES;
}

function hookRoleOptions(roles: RoleConfigOptions | undefined) {
  const options = [
    roles?.main_agent_role,
    roles?.coordinator_role,
    ...(roles?.normal_mode_roles ?? []),
    ...(roles?.subagent_roles ?? []),
  ];
  const byId = new Map<string, RoleOption>();
  for (const role of options) {
    if (role !== null && role !== undefined && role.role_id.trim() !== "") {
      byId.set(role.role_id, role);
    }
  }
  return Array.from(byId.values()).map((role) => ({
    label: role.name !== "" ? role.name : role.role_id,
    value: role.role_id,
  }));
}

function summarizeHandlerTypes(handlers: HookHandlerDraft[], t: Translate): string {
  const types = Array.from(new Set(handlers.map((handler) => handler.type))).filter(
    (type) => type.trim() !== "",
  );
  return types.length > 0 ? types.join(", ") : t("settingsHooksAll");
}

function hookDetail(hook: LoadedHookRecord): string {
  return [hook.event, hook.matcher, hook.handler]
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0)
    .join(" · ");
}

function hooksMutationError(error: unknown, action: HookMutationAction, t: Translate): string {
  const detail = hookErrorDetail(error);
  const normalizedDetail = formatHookErrorDetail(detail, t);
  const fallbackMessage = error instanceof Error ? error.message.trim() : "";
  const reason = normalizedDetail ?? fallbackMessage;
  const safeReason = reason.trim() !== "" ? reason : t("settingsHooksActionFailed");
  if (action === "validate") {
    return t("settingsHooksValidateFailedDetail", { error: safeReason });
  }
  if (action === "save") {
    return t("settingsHooksSaveFailedDetail", { error: safeReason });
  }
  return t("settingsHooksDeleteFailedDetail", { error: safeReason });
}

function hookErrorDetail(error: unknown): JsonValue | undefined {
  if (error instanceof ApiError) {
    const payload = asJsonRecord(error.payload ?? undefined);
    if (payload?.detail !== undefined) {
      return payload.detail;
    }
  }
  if (error !== null && typeof error === "object" && "detail" in error) {
    const detail = (error as { readonly detail?: unknown }).detail;
    if (isJsonValue(detail)) {
      return detail;
    }
  }
  return undefined;
}

function formatHookErrorDetail(detail: JsonValue | undefined, t: Translate): string | null {
  if (typeof detail === "string") {
    return detail.trim() || null;
  }
  if (!Array.isArray(detail)) {
    return null;
  }
  const formatted = detail
    .map((entry) => formatStructuredHookError(entry, t))
    .filter((entry) => entry !== null);
  return formatted.length > 0 ? formatted.join("\n") : null;
}

function formatStructuredHookError(entry: JsonValue, t: Translate): string | null {
  const record = asJsonRecord(entry);
  if (record === null) {
    return null;
  }
  const location = hookErrorLocation(record.loc);
  const code = typeof record.type === "string" ? record.type : "";
  const context = asJsonRecord(record.ctx);
  const roleId = typeof context?.role_id === "string" ? context.role_id : "";
  const codedFieldName = hookErrorFieldName(code);
  const fieldLabel = hookFieldLabel(location.fieldName ?? codedFieldName, t);
  const message = typeof record.msg === "string" ? record.msg : "";
  const reason = structuredHookErrorReason(code, message, fieldLabel, roleId, t);
  const locationText = reason.includeLocation ? hookLocationText(location, t) : "";
  if (locationText !== "" && reason.text !== "") {
    return `${locationText}: ${reason.text}`;
  }
  return reason.text !== "" ? reason.text : locationText || null;
}

function structuredHookErrorReason(
  code: string,
  message: string,
  fieldLabel: string | null,
  roleId: string,
  t: Translate,
): HookErrorReason {
  if (code === "hook_agent_role_not_subagent") {
    return {
      includeLocation: false,
      text: t("settingsHooksAgentRoleMustBeSubagent", { roleId }),
    };
  }
  if (code === "hook_agent_role_unknown") {
    return {
      includeLocation: false,
      text: t("settingsHooksUnknownAgentRole", { roleId }),
    };
  }
  if (code === "missing" || code.endsWith("_required")) {
    return {
      includeLocation: true,
      text:
        fieldLabel !== null
          ? t("settingsHooksRequiredField", { field: fieldLabel })
          : t("settingsHooksFieldRequired"),
    };
  }
  return { includeLocation: true, text: message.trim() };
}

function hookErrorFieldName(code: string): string | null {
  const fields: Record<string, string> = {
    hook_command_required: "command",
    hook_prompt_required: "prompt",
    hook_url_required: "url",
  };
  return fields[code] ?? null;
}

function hookErrorLocation(value: JsonValue | undefined): HookErrorLocation {
  const parts = Array.isArray(value) ? value : [];
  let eventName: string | null = null;
  let fieldName: string | null = null;
  let groupIndex: number | null = null;
  let handlerIndex: number | null = null;
  if (parts[0] === "hooks" && typeof parts[1] === "string") {
    eventName = parts[1];
    if (typeof parts[2] === "number") {
      groupIndex = parts[2] + 1;
    }
    if (parts[3] === "hooks" && typeof parts[4] === "number") {
      handlerIndex = parts[4] + 1;
      if (typeof parts[5] === "string") {
        fieldName = parts[5];
      }
    } else if (typeof parts[3] === "string") {
      fieldName = parts[3];
    }
  }
  return { eventName, fieldName, groupIndex, handlerIndex };
}

function hookLocationText(location: HookErrorLocation, t: Translate): string {
  if (location.eventName === null) {
    return "";
  }
  if (location.groupIndex !== null && location.handlerIndex !== null) {
    return t("settingsHooksErrorHandlerLocation", {
      event: location.eventName,
      group: String(location.groupIndex),
      handler: String(location.handlerIndex),
    });
  }
  if (location.groupIndex !== null) {
    return t("settingsHooksErrorGroupLocation", {
      event: location.eventName,
      group: String(location.groupIndex),
    });
  }
  return location.eventName;
}

function hookFieldLabel(fieldName: string | null, t: Translate): string | null {
  if (fieldName === null) {
    return null;
  }
  const labels: Record<string, string> = {
    command: t("settingsHooksCommand"),
    matcher: t("settingsHooksMatcher"),
    prompt: t("settingsHooksPrompt"),
    role_id: t("settingsHooksAgentRole"),
    url: t("settingsHooksUrl"),
  };
  return labels[fieldName] ?? fieldName;
}

function matcherPlaceholder(eventName: string): string {
  return MATCHER_PLACEHOLDERS[eventName] ?? "";
}

function hookNamePlaceholder(eventName: string): string {
  return HOOK_NAME_PLACEHOLDERS[eventName] ?? "Hook";
}

function handlerNamePlaceholder(eventName: string): string {
  return HANDLER_NAME_PLACEHOLDERS[eventName] ?? "Run hook";
}

function ifRulePlaceholder(eventName: string): string {
  return IF_RULE_PLACEHOLDERS[eventName] ?? "";
}

function commandPlaceholder(eventName: string): string {
  return COMMAND_PLACEHOLDERS[eventName] ?? "python .relay/hooks/hook.py";
}

function urlPlaceholder(eventName: string): string {
  return URL_PLACEHOLDERS[eventName] ?? "https://example.test/hooks";
}

function promptPlaceholder(eventName: string): string {
  return PROMPT_PLACEHOLDERS[eventName] ?? "Review the runtime event.";
}

function asJsonRecord(value: JsonValue | undefined): Record<string, JsonValue> | null {
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, JsonValue>;
  }
  return null;
}

function withoutKeys(
  record: Record<string, JsonValue>,
  keys: string[],
): Record<string, JsonValue> {
  const omitted = new Set(keys);
  const next: Record<string, JsonValue> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!omitted.has(key)) {
      next[key] = value;
    }
  }
  return next;
}

function stringValue(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
}

function booleanValue(value: JsonValue | undefined): boolean {
  return typeof value === "boolean" ? value : false;
}

function stringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function numberString(value: JsonValue | undefined): string {
  return typeof value === "number" ? String(value) : stringValue(value);
}

function formatJsonValue(value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function setOptionalString(
  record: Record<string, JsonValue>,
  key: string,
  value: string,
) {
  const trimmed = value.trim();
  if (trimmed === "") {
    delete record[key];
    return;
  }
  record[key] = trimmed;
}

function setOptionalStringArray(
  record: Record<string, JsonValue>,
  key: string,
  values: string[],
) {
  const cleaned = values.map((value) => value.trim()).filter((value) => value !== "");
  if (cleaned.length === 0) {
    delete record[key];
    return;
  }
  record[key] = cleaned;
}

function setOptionalNumber(
  record: Record<string, JsonValue>,
  key: string,
  value: string,
  t: Translate,
) {
  const trimmed = value.trim();
  if (trimmed === "") {
    delete record[key];
    return;
  }
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) {
    throw new Error(t("settingsHooksNumberInvalid", { field: key }));
  }
  record[key] = parsed;
}

function parseOptionalJson(value: string, t: Translate): JsonValue | null {
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isJsonValue(parsed)) {
      return parsed;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : t("settingsHooksJsonObjectRequired");
    throw new Error(t("settingsHooksInvalidJson", { message }));
  }
  throw new Error(t("settingsHooksJsonObjectRequired"));
}

function isJsonValue(value: unknown): value is JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonValue);
  }
  return false;
}
