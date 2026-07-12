import { App, Button, Checkbox, Input, Select, Switch, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createRun,
  createSession,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfigOptions,
  updateSessionTopology,
} from "../../api/client";
import type {
  RunCreateResponse,
  SessionRecord,
  ThinkingEffort,
  WorkspaceRecord,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { ModelRequestStatus } from "../timeline/ModelRequestStatus";
import { workspaceDisplayLabel } from "../workspaces/workspaceLabels";

type SessionMode = "normal" | "orchestration";

interface NewSessionResult {
  promptText: string;
  run: RunCreateResponse | null;
  session: SessionRecord;
}

interface PendingNewSession {
  error: string | null;
  promptText: string;
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
  const [sessionMode, setSessionMode] = useState<SessionMode>("normal");
  const [roleId, setRoleId] = useState<string | null>(null);
  const [orchestrationPresetId, setOrchestrationPresetId] = useState<string | null>(null);
  const [targetRoleId, setTargetRoleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [promptText, setPromptText] = useState("");
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort>("medium");
  const [shellSafetyPolicyEnabled, setShellSafetyPolicyEnabled] = useState(true);
  const [yolo, setYolo] = useState(true);
  const [pendingSession, setPendingSession] = useState<PendingNewSession | null>(null);
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
  const workspaceOptions = useMemo(
    () => workspaces.map((workspace) => ({
      label: workspaceDisplayLabel(workspace, workspace.workspace_id),
      value: workspace.workspace_id,
    })),
    [workspaces],
  );
  const profileOptions = useMemo(
    () => Object.entries(profilesQuery.data ?? {}).map(([id, profile]) => ({
      label: profile.model?.trim() ? `${id} · ${profile.model}` : id,
      value: id,
    })),
    [profilesQuery.data],
  );
  const roleOptions = useMemo(
    () => (rolesQuery.data?.normal_mode_roles ?? []).map((role) => ({
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
    return Array.from(new Map(roles.map((role) => [role.role_id, role])).values()).map(
      (role) => ({ label: role.name || role.role_id, value: role.role_id }),
    );
  }, [rolesQuery.data]);
  const orchestrationOptions = useMemo(
    () => (orchestrationQuery.data?.presets ?? []).map((preset) => ({
      label: preset.name?.trim() || preset.preset_id,
      value: preset.preset_id,
    })),
    [orchestrationQuery.data],
  );

  useEffect(() => {
    if (!workspaceId && workspaceOptions.length > 0) {
      setWorkspaceId(workspaceOptions[0].value);
    }
  }, [workspaceId, workspaceOptions]);

  useEffect(() => {
    const defaultProfile = Object.entries(profilesQuery.data ?? {})
      .find(([, profile]) => profile.is_default)?.[0] ?? null;
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

  const createMutation = useMutation({
    mutationFn: async (): Promise<NewSessionResult> => {
      const created = await createSession({
        workspace_id: workspaceId,
        normal_model_profile: modelProfile,
        metadata: title.trim() ? { title: title.trim() } : undefined,
      });
      const session = sessionMode === "orchestration"
        ? await updateSessionTopology(created.session_id, {
          session_mode: "orchestration",
          orchestration_preset_id: orchestrationPresetId,
        })
        : roleId !== null && roleId !== created.normal_root_role_id
          ? await updateSessionTopology(created.session_id, {
            session_mode: "normal",
            normal_root_role_id: roleId,
          })
          : created;
      const normalizedPrompt = promptText.trim();
      if (!normalizedPrompt) {
        return { promptText: "", run: null, session };
      }
      const input = [{ kind: "text" as const, text: normalizedPrompt }];
      const run = await createRun({
        session_id: session.session_id,
        input,
        display_input: input,
        target_role_id: targetRoleId,
        thinking: {
          enabled: thinkingEnabled,
          effort: thinkingEnabled ? thinkingEffort : null,
        },
        shell_safety_policy_enabled: shellSafetyPolicyEnabled,
        yolo,
      });
      return { promptText: normalizedPrompt, run, session };
    },
    onSuccess: ({ promptText: createdPrompt, run, session }) => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      onCreated(session, run, createdPrompt);
    },
    onError: (error) => {
      const errorText = error instanceof Error ? error.message : t("sidebarCreateFailed");
      setPendingSession((current) => current === null
        ? { error: errorText, promptText: promptText.trim() }
        : { ...current, error: errorText });
      void message.error(errorText);
    },
  });

  const queryError = rolesQuery.error ?? profilesQuery.error ?? orchestrationQuery.error;
  const submit = () => {
    if (workspaceId && !createMutation.isPending) {
      setPendingSession({ error: null, promptText: promptText.trim() });
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
              {pendingSession.promptText || title.trim() || t("sidebarNewSession")}
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
              <Typography.Text type="danger">{pendingSession.error}</Typography.Text>
              <div className="at-new-session-actions">
                <Button onClick={() => setPendingSession(null)}>{t("sidebarRenameCancel")}</Button>
                <Button onClick={submit} type="primary">{t("settingsRetry")}</Button>
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
      <form
        className="at-new-session-form"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <header className="at-new-session-header">
          <Button
            aria-label={t("workspaceBackToChat")}
            icon={<ArrowLeft size={16} />}
            onClick={onCancel}
            type="text"
          />
          <div>
            <Typography.Title level={2}>{t("sidebarNewSession")}</Typography.Title>
            <Typography.Text type="secondary">{t("composerPromptPlaceholder")}</Typography.Text>
          </div>
        </header>

        {queryError !== null && queryError !== undefined ? (
          <Typography.Text className="at-new-session-error" role="alert" type="danger">
            {queryError instanceof Error ? queryError.message : t("sidebarCreateFailed")}
          </Typography.Text>
        ) : null}

        <div className="at-new-session-grid">
          <label>
            <span>{t("sidebarWorkspaces")}</span>
            <Select
              aria-label={t("sidebarWorkspaces")}
              onChange={setWorkspaceId}
              options={workspaceOptions}
              value={workspaceId || undefined}
            />
          </label>
          <label>
            <span>{t("newSessionNameOptional")}</span>
            <Input
              aria-label={t("newSessionNameOptional")}
              onChange={(event) => setTitle(event.target.value)}
              value={title}
            />
          </label>
          <label>
            <span>{t("composerMode")}</span>
            <Select
              aria-label={t("composerMode")}
              onChange={setSessionMode}
              options={[
                { label: t("composerNormal"), value: "normal" },
                { label: t("composerOrchestration"), value: "orchestration" },
              ]}
              value={sessionMode}
            />
          </label>
          {sessionMode === "normal" ? (
            <label>
              <span>{t("settingsRoles")}</span>
              <Select
                allowClear
                aria-label={t("settingsRoles")}
                loading={rolesQuery.isLoading}
                onChange={(value) => setRoleId(value ?? null)}
                options={roleOptions}
                value={roleId ?? undefined}
              />
            </label>
          ) : (
            <label>
              <span>{t("composerOrchestrationPreset")}</span>
              <Select
                allowClear
                aria-label={t("composerOrchestrationPreset")}
                loading={orchestrationQuery.isLoading}
                onChange={(value) => setOrchestrationPresetId(value ?? null)}
                options={orchestrationOptions}
                value={orchestrationPresetId ?? undefined}
              />
            </label>
          )}
          <label className="at-new-session-grid-wide">
            <span>{t("composerModelProfile")}</span>
            <Select
              allowClear
              aria-label={t("composerModelProfile")}
              loading={profilesQuery.isLoading}
              onChange={(value) => setModelProfile(value ?? null)}
              options={profileOptions}
              value={modelProfile ?? undefined}
            />
          </label>
        </div>

        <label className="at-new-session-prompt">
          <span>{t("newSessionInitialTask")}</span>
          <Input.TextArea
            aria-label={t("newSessionInitialTask")}
            autoFocus
            onChange={(event) => setPromptText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder={t("composerPromptPlaceholder")}
            value={promptText}
          />
        </label>

        <details className="at-new-session-advanced">
          <summary>{t("newSessionAdvanced")}</summary>
          <div className="at-new-session-advanced-grid">
            <label>
              <span>{t("composerTargetRole")}</span>
              <Select
                allowClear
                aria-label={t("composerTargetRole")}
                loading={rolesQuery.isLoading}
                onChange={(value) => setTargetRoleId(value ?? null)}
                options={targetRoleOptions}
                value={targetRoleId ?? undefined}
              />
            </label>
            <label className="at-new-session-toggle">
              <span>{t("composerThinking")}</span>
              <Switch checked={thinkingEnabled} onChange={setThinkingEnabled} />
            </label>
            {thinkingEnabled ? (
              <label>
                <span>{t("composerThinkingEffort")}</span>
                <Select
                  aria-label={t("composerThinkingEffort")}
                  onChange={setThinkingEffort}
                  options={["minimal", "low", "medium", "high"].map((value) => ({
                    label: value,
                    value,
                  }))}
                  value={thinkingEffort}
                />
              </label>
            ) : null}
            <Checkbox
              checked={shellSafetyPolicyEnabled}
              onChange={(event) => setShellSafetyPolicyEnabled(event.target.checked)}
            >
              {t("composerShellSafety")}
            </Checkbox>
            <Checkbox checked={yolo} onChange={(event) => setYolo(event.target.checked)}>
              {t("composerYolo")}
            </Checkbox>
          </div>
        </details>

        <footer className="at-new-session-actions">
          <Button disabled={createMutation.isPending} onClick={onCancel}>
            {t("sidebarDeleteCancel")}
          </Button>
          <Button
            disabled={!workspaceId}
            htmlType="submit"
            loading={createMutation.isPending}
            type="primary"
          >
            {promptText.trim() ? t("newSessionCreateAndRun") : t("sidebarNewSession")}
          </Button>
        </footer>
      </form>
    </section>
  );
}
