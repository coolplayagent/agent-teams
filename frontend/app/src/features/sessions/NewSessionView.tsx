import { App, Button, Card, Input, Select, Space, Typography } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquarePlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  createSession,
  getModelProfiles,
  getRoleConfigOptions,
  updateSessionTopology,
} from "../../api/client";
import type { SessionRecord, WorkspaceRecord } from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { workspaceDisplayLabel } from "../workspaces/workspaceLabels";

interface NewSessionViewProps {
  initialWorkspaceId: string | null;
  onCancel: () => void;
  onCreated: (session: SessionRecord) => void;
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
  const [roleId, setRoleId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const rolesQuery = useQuery({
    queryKey: ["roles", "options"],
    queryFn: getRoleConfigOptions,
  });
  const profilesQuery = useQuery({
    queryKey: ["model-profiles"],
    queryFn: getModelProfiles,
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await createSession({
        workspace_id: workspaceId,
        normal_model_profile: modelProfile,
        metadata: title.trim() ? { title: title.trim() } : undefined,
      });
      if (roleId === null || roleId === created.normal_root_role_id) {
        return created;
      }
      return updateSessionTopology(created.session_id, {
        session_mode: "normal",
        normal_root_role_id: roleId,
      });
    },
    onSuccess: (session) => {
      void queryClient.invalidateQueries({ queryKey: ["sessions", "sidebar"] });
      onCreated(session);
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("sidebarCreateFailed"));
    },
  });

  return (
    <section aria-label={t("sidebarNewSession")} className="at-new-session-view">
      <header className="at-new-session-header">
        <Button
          aria-label={t("workspaceBackToChat")}
          icon={<ArrowLeft size={16} />}
          onClick={onCancel}
          type="text"
        />
        <div>
          <Typography.Title level={2}>{t("sidebarNewSession")}</Typography.Title>
          <Typography.Text type="secondary">
            {t("composerPromptPlaceholder")}
          </Typography.Text>
        </div>
      </header>
      <Card className="at-new-session-card">
        <div className="at-new-session-icon"><MessageSquarePlus size={24} /></div>
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
        <label>
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
        <label>
          <span>{t("sidebarRenameSession")}</span>
          <Input
            aria-label={t("sidebarRenameSession")}
            onChange={(event) => setTitle(event.target.value)}
            value={title}
          />
        </label>
        <Space className="at-new-session-actions">
          <Button onClick={onCancel}>{t("sidebarDeleteCancel")}</Button>
          <Button
            disabled={!workspaceId}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
            type="primary"
          >
            {t("sidebarNewSession")}
          </Button>
        </Space>
      </Card>
    </section>
  );
}
