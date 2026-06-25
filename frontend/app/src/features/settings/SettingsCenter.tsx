import {
  App,
  Button,
  Form,
  Input,
  Popconfirm,
  Switch,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  deleteModelProfile,
  getGeneralConfig,
  getConfigStatus,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfig,
  getRoleConfigOptions,
  listRoleConfigs,
  reloadModelConfig,
  saveGeneralConfig,
  saveModelProfile,
  saveOrchestrationConfig,
  saveRoleConfig,
} from "../../api/client";
import type {
  GeneralConfig,
  ModalityCapabilities,
  ModelProfileRecord,
  ModelProfileSaveRequest,
  OrchestrationConfig,
  OrchestrationPreset,
  OrchestrationPolicy,
  RoleConfigDocument,
  RoleConfigSummary,
  RoleOption,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore } from "../../runtime/uiStore";
import { ClawHubSettingsSection } from "./ClawHubSettingsSection";
import { CommandsSettingsSection } from "./CommandsSettingsSection";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";
import { GitHubSettingsSection } from "./GitHubSettingsSection";
import { McpSettingsSection } from "./McpSettingsSection";
import { NotificationSettingsSection } from "./NotificationSettingsSection";
import { ProxySettingsSection } from "./ProxySettingsSection";
import {
  AgentRuntimeSettingsSection,
  HooksSettingsSection,
  PluginsSettingsSection,
} from "./RuntimeSettingsSections";
import { SettingsAppearanceSection } from "./SettingsAppearanceSection";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";
import { SpeechSettingsSection } from "./SpeechSettingsSection";
import { TriggerSettingsSection } from "./TriggerSettingsSection";
import { WebSettingsSection } from "./WebSettingsSection";
import { WorkspaceSettingsSection } from "./WorkspaceSettingsSection";

type SettingsSectionKey =
  | "appearance"
  | "clawhub"
  | "environment"
  | "general"
  | "roles"
  | "models"
  | "notifications"
  | "orchestration"
  | "proxy"
  | "speech"
  | "system"
  | "web"
  | "workspace";

const SYSTEM_SETTINGS_PAGE_IDS = [
  "mcp",
  "plugins",
  "commands",
  "hooks",
  "agent-runtime",
  "github",
  "triggers",
] as const;

type SystemSettingsPage = (typeof SYSTEM_SETTINGS_PAGE_IDS)[number];

interface SettingsCenterProps {
  open: boolean;
}

export function SettingsCenter({ open }: SettingsCenterProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [activeSection, setActiveSection] = useState<SettingsSectionKey>("appearance");
  const [form] = Form.useForm<GeneralConfig>();
  const themeMode = useUiStore((state) => state.themeMode);
  const setThemeMode = useUiStore((state) => state.setThemeMode);

  const generalQuery = useQuery({
    queryKey: ["settings", "general"],
    queryFn: getGeneralConfig,
    enabled: open,
  });
  const rolesQuery = useQuery({
    queryKey: ["settings", "roles", "options"],
    queryFn: getRoleConfigOptions,
    enabled: open,
  });
  const modelsQuery = useQuery({
    queryKey: ["settings", "models", "profiles"],
    queryFn: getModelProfiles,
    enabled: open,
  });
  const orchestrationQuery = useQuery({
    queryKey: ["settings", "orchestration"],
    queryFn: getOrchestrationConfig,
    enabled: open,
  });
  const saveMutation = useMutation({
    mutationFn: (values: GeneralConfig) => saveGeneralConfig(values),
    onSuccess: () => {
      void message.success(t("settingsSaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "general"] });
    },
    onError: (error) => {
      void message.error(error instanceof Error ? error.message : t("settingsSaveFailed"));
    },
  });

  useEffect(() => {
    if (generalQuery.data !== undefined) {
      form.setFieldsValue(generalQuery.data);
    }
  }, [generalQuery.data, form]);

  const sections = useMemo(
    () => [
      { key: "appearance" as const, label: t("settingsAppearance") },
      { key: "general" as const, label: t("settingsGeneral") },
      { key: "speech" as const, label: t("settingsSpeech") },
      { key: "notifications" as const, label: t("settingsNotifications") },
      { key: "models" as const, label: t("settingsModels") },
      { key: "roles" as const, label: t("settingsRoles") },
      { key: "orchestration" as const, label: t("settingsOrchestration") },
      { key: "web" as const, label: t("settingsWeb") },
      { key: "clawhub" as const, label: t("settingsClawHub") },
      { key: "proxy" as const, label: t("settingsProxy") },
      { key: "workspace" as const, label: t("settingsWorkspace") },
      { key: "environment" as const, label: t("settingsEnvironment") },
      { key: "system" as const, label: t("settingsSystem") },
    ],
    [t],
  );

  return (
    <div className="at-settings-center">
      <nav aria-label={t("settingsSections")} className="at-settings-nav">
        {sections.map((section) => (
          <button
            aria-current={activeSection === section.key ? "page" : undefined}
            className={
              activeSection === section.key
                ? "at-settings-nav-item is-active"
                : "at-settings-nav-item"
            }
            key={section.key}
            onClick={() => setActiveSection(section.key)}
            type="button"
          >
            {section.label}
          </button>
        ))}
      </nav>
      <section className="at-settings-content">
        {activeSection === "appearance" ? (
          <SettingsAppearanceSection
            setThemeMode={setThemeMode}
            themeMode={themeMode}
          />
        ) : null}
        {activeSection === "general" ? (
          <SettingsGeneral
            error={generalQuery.error}
            form={form}
            loading={generalQuery.isLoading}
            onSubmit={(values) => saveMutation.mutate(values)}
            saving={saveMutation.isPending}
          />
        ) : null}
        {activeSection === "speech" ? <SpeechSettingsSection /> : null}
        {activeSection === "notifications" ? <NotificationSettingsSection /> : null}
        {activeSection === "roles" ? (
          <SettingsRoles
            error={rolesQuery.error}
            loading={rolesQuery.isLoading}
            roles={rolesQuery.data}
          />
        ) : null}
        {activeSection === "models" ? (
          <SettingsModels
            error={modelsQuery.error}
            loading={modelsQuery.isLoading}
            profiles={modelsQuery.data}
          />
        ) : null}
        {activeSection === "orchestration" ? (
          <SettingsOrchestration
            config={orchestrationQuery.data}
            error={orchestrationQuery.error}
            loading={orchestrationQuery.isLoading}
          />
        ) : null}
        {activeSection === "web" ? <WebSettingsSection /> : null}
        {activeSection === "clawhub" ? <ClawHubSettingsSection /> : null}
        {activeSection === "proxy" ? <ProxySettingsSection /> : null}
        {activeSection === "workspace" ? <WorkspaceSettingsSection /> : null}
        {activeSection === "environment" ? <EnvironmentSettingsSection /> : null}
        {activeSection === "system" ? <SettingsSystem /> : null}
      </section>
    </div>
  );
}

function SettingsSystem() {
  const t = useTranslations();
  const [selectedPage, setSelectedPage] = useState<SystemSettingsPage | null>(null);
  const [desktopVersion, setDesktopVersion] = useState<string | null>(null);
  const statusQuery = useQuery({
    queryKey: ["settings", "system", "status"],
    queryFn: getConfigStatus,
    enabled: selectedPage === null,
  });
  useEffect(() => {
    let cancelled = false;
    const desktopApi = window.agentTeamsDesktop;
    if (desktopApi === undefined) {
      setDesktopVersion(null);
      return () => {
        cancelled = true;
      };
    }
    void desktopApi
      .getVersion()
      .then((version) => {
        if (!cancelled) {
          setDesktopVersion(version.trim() || null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDesktopVersion(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const systemItems = useMemo(
    () => [
      {
        detail: t("settingsSystemMcpDetail"),
        key: "mcp",
        meta: t("settingsSystem"),
        title: t("settingsMcp"),
      },
      {
        detail: t("settingsSystemPluginsDetail"),
        key: "plugins",
        meta: t("settingsSystem"),
        title: t("settingsPlugins"),
      },
      {
        detail: t("settingsSystemCommandsDetail"),
        key: "commands",
        meta: t("settingsSystem"),
        title: t("settingsCommands"),
      },
      {
        detail: t("settingsSystemHooksDetail"),
        key: "hooks",
        meta: t("settingsSystem"),
        title: t("settingsHooks"),
      },
      {
        detail: t("settingsSystemAgentRuntimeDetail"),
        key: "agent-runtime",
        meta: t("settingsSystem"),
        title: t("settingsAgentRuntime"),
      },
      {
        detail: t("settingsSystemGitHubDetail"),
        key: "github",
        meta: t("settingsSystem"),
        title: t("settingsGitHub"),
      },
      {
        detail: t("settingsSystemTriggersDetail"),
        key: "triggers",
        meta: t("settingsSystem"),
        title: t("settingsTriggers"),
      },
    ],
    [t],
  );

  if (selectedPage !== null) {
    return (
      <div className="at-settings-system-detail">
        <div className="at-settings-system-detail-toolbar">
          <Button onClick={() => setSelectedPage(null)}>{t("settingsBack")}</Button>
        </div>
        <SystemSettingsPageContent page={selectedPage} />
      </div>
    );
  }

  return (
    <SettingsSection title={t("settingsSystem")}>
      <SettingsQueryState error={statusQuery.error} loading={statusQuery.isLoading} />
      {!statusQuery.isLoading && statusQuery.data !== undefined ? (
        <div className="at-settings-facts">
          <Fact
            label={t("settingsSystemSkillsLoaded")}
            value={
              statusQuery.data.skills?.loaded === true
                ? t("settingsEnabled")
                : t("settingsDisabled")
            }
          />
          <Fact
            label={t("settingsSkills")}
            value={String(statusQuery.data.skills?.skills?.length ?? 0)}
          />
          {desktopVersion !== null ? (
            <Fact label={t("settingsSystemDesktopVersion")} value={desktopVersion} />
          ) : null}
        </div>
      ) : null}
      <SettingsList
        emptyText={t("settingsSystemNoPages")}
        items={systemItems}
        onSelect={(item) => {
          if (isSystemSettingsPage(item.key)) {
            setSelectedPage(item.key);
          }
        }}
      />
    </SettingsSection>
  );
}

function SystemSettingsPageContent({ page }: { page: SystemSettingsPage }) {
  if (page === "mcp") {
    return <McpSettingsSection />;
  }
  if (page === "plugins") {
    return <PluginsSettingsSection />;
  }
  if (page === "commands") {
    return <CommandsSettingsSection />;
  }
  if (page === "hooks") {
    return <HooksSettingsSection />;
  }
  if (page === "agent-runtime") {
    return <AgentRuntimeSettingsSection />;
  }
  if (page === "triggers") {
    return <TriggerSettingsSection />;
  }
  return <GitHubSettingsSection />;
}

function isSystemSettingsPage(key: string): key is SystemSettingsPage {
  return SYSTEM_SETTINGS_PAGE_IDS.some((page) => page === key);
}

function SettingsGeneral({
  error,
  form,
  loading,
  onSubmit,
  saving,
}: {
  error: Error | null;
  form: FormInstance<GeneralConfig>;
  loading: boolean;
  onSubmit: (values: GeneralConfig) => void;
  saving: boolean;
}) {
  const t = useTranslations();
  return (
    <SettingsSection title={t("settingsGeneral")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading ? (
        <Form
          className="at-settings-form"
          form={form}
          layout="vertical"
          onFinish={onSubmit}
        >
          <Form.Item
            label={t("settingsShellSafetyPolicy")}
            name="shell_safety_policy_enabled"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Button htmlType="submit" loading={saving} type="primary">
            {t("settingsSave")}
          </Button>
        </Form>
      ) : null}
    </SettingsSection>
  );
}

function SettingsRoles({
  error,
  loading,
  roles,
}: {
  error: Error | null;
  loading: boolean;
  roles: Awaited<ReturnType<typeof getRoleConfigOptions>> | undefined;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const roleConfigsQuery = useQuery({
    queryKey: ["settings", "roles", "configs"],
    queryFn: listRoleConfigs,
  });
  const selectedRoleQuery = useQuery({
    queryKey: ["settings", "roles", "configs", selectedRoleId],
    queryFn: () => getRoleConfig(selectedRoleId ?? ""),
    enabled: selectedRoleId !== null,
  });
  const saveMutation = useMutation({
    mutationFn: (document: RoleConfigDocument) =>
      saveRoleConfig(document.role_id, document),
    onSuccess: (document) => {
      void message.success(t("settingsSaved"));
      queryClient.setQueryData(
        ["settings", "roles", "configs", document.role_id],
        document,
      );
      void queryClient.invalidateQueries({ queryKey: ["settings", "roles"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsSaveFailed"),
      );
    },
  });
  const normalRoles = roles?.normal_mode_roles ?? [];
  const subagentRoles = roles?.subagent_roles ?? [];
  const roleItems = useMemo(
    () => (roleConfigsQuery.data ?? []).map((role) => roleConfigListItem(role)),
    [roleConfigsQuery.data],
  );
  const selectedRoleSummary =
    selectedRoleId !== null
      ? roleConfigsQuery.data?.find((role) => role.role_id === selectedRoleId)
      : undefined;

  useEffect(() => {
    if (
      selectedRoleId !== null
      && roleConfigsQuery.data !== undefined
      && selectedRoleSummary === undefined
    ) {
      setSelectedRoleId(null);
    }
  }, [roleConfigsQuery.data, selectedRoleId, selectedRoleSummary]);

  return (
    <SettingsSection title={t("settingsRoles")}>
      <SettingsQueryState
        error={roleConfigsQuery.error ?? error}
        loading={roleConfigsQuery.isLoading || loading}
      />
      {selectedRoleId !== null ? (
        <RoleConfigDetail
          document={selectedRoleQuery.data}
          error={selectedRoleQuery.error}
          loading={selectedRoleQuery.isLoading}
          onBack={() => setSelectedRoleId(null)}
          onSave={(document) => saveMutation.mutate(document)}
          roleId={selectedRoleId}
          saving={saveMutation.isPending}
          summary={selectedRoleSummary}
        />
      ) : !roleConfigsQuery.isLoading && roleConfigsQuery.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsCoordinator")} value={roleName(roles?.coordinator_role)} />
            <Fact label={t("settingsMainAgent")} value={roleName(roles?.main_agent_role)} />
            <Fact label={t("settingsNormalRoles")} value={String(normalRoles.length)} />
            <Fact label={t("settingsSubagentRoles")} value={String(subagentRoles.length)} />
          </div>
          <SettingsList
            emptyText={t("settingsNoRoleConfigs")}
            items={roleItems}
            onSelect={(item) => setSelectedRoleId(item.key)}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}

function RoleConfigDetail({
  document,
  error,
  loading,
  onBack,
  onSave,
  roleId,
  saving,
  summary,
}: {
  document: RoleConfigDocument | undefined;
  error: Error | null;
  loading: boolean;
  onBack: () => void;
  onSave: (document: RoleConfigDocument) => void;
  roleId: string;
  saving: boolean;
  summary: RoleConfigSummary | undefined;
}) {
  const t = useTranslations();
  const [form] = Form.useForm<RoleConfigForm>();
  const formId = `at-role-config-form-${roleId}`;

  useEffect(() => {
    if (document !== undefined) {
      form.setFieldsValue(roleConfigFormValues(document));
    }
  }, [document, form]);

  const title = document?.name?.trim() || summary?.name?.trim() || roleId;
  const detail = roleConfigDetail(document ?? summary);

  return (
    <div className="at-settings-detail-page at-role-config-detail">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <span>{title}</span>
          <Typography.Text>{detail}</Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          {document !== undefined ? (
            <Button form={formId} htmlType="submit" loading={saving} type="primary">
              {t("settingsSave")}
            </Button>
          ) : null}
          <Button onClick={onBack}>{t("settingsBack")}</Button>
        </div>
      </div>
      <SettingsQueryState error={error} loading={loading} />
      {document !== undefined ? (
        <>
          <div className="at-settings-facts at-settings-workspace-facts">
            <Fact label={t("settingsRoleId")} value={document.role_id} />
            <Fact label={t("settingsRoleSource")} value={document.source ?? "-"} />
            <Fact label={t("settingsRoleFile")} value={document.file_name ?? "-"} />
            <Fact
              label={t("settingsRoleModelProfile")}
              value={document.model_profile ?? "-"}
            />
          </div>
          <Form
            className="at-settings-form at-settings-wide-form at-role-config-form"
            form={form}
            id={formId}
            layout="vertical"
            onFinish={(values) => {
              onSave(updateRoleConfigDocument(document, values));
            }}
          >
            <Form.Item label={t("settingsRoleName")} name="name">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item label={t("settingsRoleDescription")} name="description">
              <Input.TextArea autoSize={{ minRows: 2, maxRows: 5 }} />
            </Form.Item>
            <Form.Item label={t("settingsRoleVersion")} name="version">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item label={t("settingsRoleModelProfile")} name="model_profile">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item label={t("settingsRoleBoundAgent")} name="bound_agent_id">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item label={t("settingsRoleMode")} name="mode">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item label={t("settingsRoleSystemPrompt")} name="system_prompt">
              <Input.TextArea autoSize={{ minRows: 8, maxRows: 18 }} />
            </Form.Item>
          </Form>
          <div className="at-settings-list at-role-config-properties">
            <PropertyRow
              label={t("settingsMcpToolCount")}
              value={String(document.tools?.length ?? 0)}
            />
            <PropertyRow
              label={t("settingsMcpServers")}
              value={modalityList(document.mcp_servers ?? []) || "-"}
            />
            <PropertyRow
              label={t("settingsSkills")}
              value={modalityList(document.skills ?? []) || "-"}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}

function SettingsModels({
  error,
  loading,
  profiles,
}: {
  error: Error | null;
  loading: boolean;
  profiles: Awaited<ReturnType<typeof getModelProfiles>> | undefined;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const entries = useMemo(
    () => Object.entries(profiles ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    [profiles],
  );
  const selectedProfile =
    selectedProfileId !== null ? profiles?.[selectedProfileId] : undefined;

  useEffect(() => {
    if (selectedProfileId !== null && profiles?.[selectedProfileId] === undefined) {
      setSelectedProfileId(null);
    }
  }, [profiles, selectedProfileId]);

  const setDefaultMutation = useMutation({
    mutationFn: async ({
      profile,
      profileId,
    }: {
      profile: ModelProfileRecord;
      profileId: string;
    }) => {
      const result = await saveModelProfile(
        profileId,
        buildModelProfileSaveRequest(profile, { isDefault: true }),
      );
      await reloadModelConfig();
      return result;
    },
    onSuccess: (_result, variables) => {
      void message.success(t("settingsModelDefaultSaved", { name: variables.profileId }));
      void queryClient.invalidateQueries({ queryKey: ["settings", "models", "profiles"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsSaveFailed"),
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const result = await deleteModelProfile(profileId);
      await reloadModelConfig();
      return result;
    },
    onSuccess: (_result, profileId) => {
      if (selectedProfileId === profileId) {
        setSelectedProfileId(null);
      }
      void message.success(t("settingsModelDeleted", { name: profileId }));
      void queryClient.invalidateQueries({ queryKey: ["settings", "models", "profiles"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsSaveFailed"),
      );
    },
  });

  const requestDefault = (profileId: string, profile: ModelProfileRecord) => {
    if (profile.is_default === true) {
      return;
    }
    setDefaultMutation.mutate({ profile, profileId });
  };
  const requestDelete = (profileId: string) => {
    deleteMutation.mutate(profileId);
  };

  return (
    <SettingsSection title={t("settingsModels")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && profiles !== undefined ? (
        selectedProfileId !== null && selectedProfile !== undefined ? (
          <ModelProfileDetail
            onBack={() => setSelectedProfileId(null)}
            onDelete={requestDelete}
            onSetDefault={requestDefault}
            deleting={deleteMutation.isPending}
            profile={selectedProfile}
            profileId={selectedProfileId}
            settingDefault={setDefaultMutation.isPending}
          />
        ) : (
          <>
            <div className="at-settings-facts">
              <Fact label={t("settingsProfileCount")} value={String(entries.length)} />
              <Fact label={t("settingsDefaultProfile")} value={defaultProfile(entries)} />
            </div>
            {entries.length === 0 ? (
              <div className="at-settings-empty">{t("settingsNoModelProfiles")}</div>
            ) : (
              <div className="at-settings-list at-model-profiles-list">
                {entries.map(([profileId, profile]) => {
                  const detail = modelProfileDetail(profile);
                  const provider = profile.provider ?? t("settingsProviderUnknown");
                  return (
                    <div className="at-settings-list-row at-model-profile-row" key={profileId}>
                      <button
                        className="at-model-profile-row-main"
                        onClick={() => setSelectedProfileId(profileId)}
                        type="button"
                      >
                        <div className="at-settings-list-main">
                          <span>{profileId}</span>
                          <Typography.Text ellipsis title={detail}>
                            {detail}
                          </Typography.Text>
                        </div>
                        <Typography.Text
                          className="at-settings-list-meta"
                          ellipsis
                          title={provider}
                        >
                          {provider}
                        </Typography.Text>
                      </button>
                      <div className="at-model-profile-actions">
                        <Button
                          disabled={profile.is_default === true}
                          loading={setDefaultMutation.isPending}
                          onClick={() => requestDefault(profileId, profile)}
                          size="small"
                        >
                          {t("settingsModelSetDefaultShort")}
                        </Button>
                        <Popconfirm
                          cancelText={t("sidebarDeleteCancel")}
                          okText={t("sidebarDeleteConfirm")}
                          onConfirm={() => requestDelete(profileId)}
                          title={t("settingsModelDeleteConfirm", { name: profileId })}
                        >
                          <Button danger loading={deleteMutation.isPending} size="small">
                            {t("settingsModelDelete")}
                          </Button>
                        </Popconfirm>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )
      ) : null}
    </SettingsSection>
  );
}

function ModelProfileDetail({
  deleting,
  onBack,
  onDelete,
  onSetDefault,
  profile,
  profileId,
  settingDefault,
}: {
  deleting: boolean;
  onBack: () => void;
  onDelete: (profileId: string) => void;
  onSetDefault: (profileId: string, profile: ModelProfileRecord) => void;
  profile: ModelProfileRecord;
  profileId: string;
  settingDefault: boolean;
}) {
  const t = useTranslations();
  const input = capabilityModes(
    profile.resolved_capabilities?.input ?? profile.capabilities?.input,
  );
  const output = capabilityModes(
    profile.resolved_capabilities?.output ?? profile.capabilities?.output,
  );
  return (
    <div className="at-settings-detail-page at-model-profile-detail">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <span>{profileId}</span>
          <Typography.Text>{modelProfileDetail(profile)}</Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          <Button
            disabled={profile.is_default === true}
            loading={settingDefault}
            onClick={() => onSetDefault(profileId, profile)}
          >
            {t("settingsModelSetDefault")}
          </Button>
          <Popconfirm
            cancelText={t("sidebarDeleteCancel")}
            okText={t("sidebarDeleteConfirm")}
            onConfirm={() => onDelete(profileId)}
            title={t("settingsModelDeleteConfirm", { name: profileId })}
          >
            <Button danger loading={deleting}>
              {t("settingsModelDelete")}
            </Button>
          </Popconfirm>
          <Button onClick={onBack}>{t("settingsBack")}</Button>
        </div>
      </div>
      <div className="at-settings-facts at-settings-workspace-facts">
        <Fact
          label={t("settingsModelProvider")}
          value={profile.provider ?? t("settingsProviderUnknown")}
        />
        <Fact label={t("settingsModelName")} value={profile.model ?? "-"} />
        <Fact
          label={t("settingsModelDefault")}
          value={profile.is_default === true ? t("settingsEnabled") : t("settingsDisabled")}
        />
      </div>
      <div className="at-settings-list at-model-profile-properties">
        <PropertyRow label={t("settingsModelInput")} value={input || "-"} />
        <PropertyRow label={t("settingsModelOutput")} value={output || "-"} />
        <PropertyRow
          label={t("settingsModelModalities")}
          value={modalityList(profile.input_modalities ?? []) || "-"}
        />
        <PropertyRow
          label={t("settingsModelSpeechRealtime")}
          value={profile.speech_realtime?.model ?? "-"}
        />
      </div>
    </div>
  );
}

function buildModelProfileSaveRequest(
  profile: ModelProfileRecord,
  options: { isDefault?: boolean } = {},
): ModelProfileSaveRequest {
  const request: ModelProfileSaveRequest = {
    base_url: profile.base_url ?? "",
    connect_timeout_seconds: finiteNumber(profile.connect_timeout_seconds, 15),
    context_window: integerOrNull(profile.context_window),
    fallback_policy_id: profile.fallback_policy_id ?? null,
    fallback_priority: finiteNumber(profile.fallback_priority, 0),
    is_default: options.isDefault === true ? true : profile.is_default === true,
    model: profile.model ?? "",
    provider: profile.provider ?? "openai_compatible",
    temperature: finiteNumber(profile.temperature, 0.7),
    top_p: finiteNumber(profile.top_p, 1),
  };
  if (profile.max_tokens !== undefined) {
    request.max_tokens = integerOrNull(profile.max_tokens);
  }
  if (profile.catalog_provider_id !== undefined) {
    request.catalog_provider_id = profile.catalog_provider_id;
  }
  if (profile.catalog_provider_name !== undefined) {
    request.catalog_provider_name = profile.catalog_provider_name;
  }
  if (profile.catalog_model_name !== undefined) {
    request.catalog_model_name = profile.catalog_model_name;
  }
  if (profile.ssl_verify === true || profile.ssl_verify === false) {
    request.ssl_verify = profile.ssl_verify;
  }
  if (profile.api_key !== undefined) {
    request.api_key = profile.api_key;
  }
  if (profile.headers !== undefined) {
    request.headers = profile.headers;
  }
  if (profile.maas_auth !== undefined) {
    request.maas_auth = profile.maas_auth;
  }
  if (profile.codeagent_auth !== undefined) {
    request.codeagent_auth = profile.codeagent_auth;
  }
  if (profile.capabilities !== undefined) {
    request.capabilities = profile.capabilities;
  }
  if (profile.speech_realtime !== undefined) {
    request.speech_realtime = profile.speech_realtime;
  }
  return request;
}

function finiteNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function SettingsOrchestration({
  config,
  error,
  loading,
}: {
  config: Awaited<ReturnType<typeof getOrchestrationConfig>> | undefined;
  error: Error | null;
  loading: boolean;
}) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);
  const presets = config?.presets ?? [];
  const selectedPreset =
    selectedPresetId !== null
      ? presets.find((preset) => preset.preset_id === selectedPresetId)
      : undefined;

  useEffect(() => {
    if (selectedPresetId !== null && selectedPreset === undefined) {
      setSelectedPresetId(null);
    }
  }, [selectedPreset, selectedPresetId]);

  const saveMutation = useMutation({
    mutationFn: (nextConfig: OrchestrationConfig) => saveOrchestrationConfig(nextConfig),
    onSuccess: () => {
      void message.success(t("settingsSaved"));
      void queryClient.invalidateQueries({ queryKey: ["settings", "orchestration"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsSaveFailed"),
      );
    },
  });

  return (
    <SettingsSection title={t("settingsOrchestration")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && config !== undefined ? (
        selectedPreset !== undefined ? (
          <OrchestrationPresetDetail
            config={config}
            defaultPresetId={config.default_orchestration_preset_id}
            onBack={() => setSelectedPresetId(null)}
            onSave={(nextConfig) => saveMutation.mutate(nextConfig)}
            preset={selectedPreset}
            saving={saveMutation.isPending}
          />
        ) : (
          <>
            <div className="at-settings-facts">
              <Fact
                label={t("settingsDefaultPreset")}
                value={config.default_orchestration_preset_id ?? "-"}
              />
              <Fact label={t("settingsPresetCount")} value={String(presets.length)} />
            </div>
            <SettingsList
              emptyText={t("settingsNoOrchestrationPresets")}
              items={presets.map((preset) => ({
                detail: orchestrationPresetDetail(preset),
                key: preset.preset_id,
                meta: preset.preset_id,
                title: preset.name ?? preset.preset_id,
              }))}
              onSelect={(item) => setSelectedPresetId(item.key)}
            />
          </>
        )
      ) : null}
    </SettingsSection>
  );
}

interface SettingsListItem {
  detail: string;
  key: string;
  meta: string;
  title: string;
}

interface OrchestrationPresetForm {
  description?: string;
  name?: string;
  orchestration_prompt?: string;
  role_ids?: string;
}

interface RoleConfigForm {
  bound_agent_id?: string;
  description?: string;
  mode?: string;
  model_profile?: string;
  name?: string;
  system_prompt?: string;
  version?: string;
}

function SettingsList({
  emptyText,
  items,
  onSelect,
}: {
  emptyText: string;
  items: SettingsListItem[];
  onSelect?: (item: SettingsListItem) => void;
}) {
  if (items.length === 0) {
    return <div className="at-settings-empty">{emptyText}</div>;
  }
  return (
    <div className="at-settings-list">
      {items.map((item) => {
        const content = (
          <>
            <div className="at-settings-list-main">
              <span>{item.title}</span>
              <Typography.Text ellipsis title={item.detail}>
                {item.detail}
              </Typography.Text>
            </div>
            <Typography.Text className="at-settings-list-meta" ellipsis title={item.meta}>
              {item.meta}
            </Typography.Text>
          </>
        );
        if (onSelect !== undefined) {
          return (
            <button
              className="at-settings-list-button at-settings-list-row"
              key={item.key}
              onClick={() => onSelect(item)}
              type="button"
            >
              {content}
            </button>
          );
        }
        return (
          <div className="at-settings-list-row" key={item.key}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function OrchestrationPresetDetail({
  config,
  defaultPresetId,
  onBack,
  onSave,
  preset,
  saving,
}: {
  config: OrchestrationConfig;
  defaultPresetId: string | undefined;
  onBack: () => void;
  onSave: (config: OrchestrationConfig) => void;
  preset: OrchestrationPreset;
  saving: boolean;
}) {
  const t = useTranslations();
  const [form] = Form.useForm<OrchestrationPresetForm>();
  const formId = "at-orchestration-preset-form";
  const roleIds = preset.role_ids?.map((roleId) => roleId.trim()).filter(Boolean) ?? [];
  const policyRows = orchestrationPolicyRows(preset.policy);

  useEffect(() => {
    form.setFieldsValue(orchestrationPresetFormValues(preset));
  }, [form, preset]);

  return (
    <div className="at-settings-detail-page at-orchestration-preset-detail">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <span>{preset.name ?? preset.preset_id}</span>
          <Typography.Text>{orchestrationPresetDetail(preset)}</Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          <Button form={formId} htmlType="submit" loading={saving} type="primary">
            {t("settingsSave")}
          </Button>
          <Button onClick={onBack}>{t("settingsBack")}</Button>
        </div>
      </div>
      <div className="at-settings-facts at-settings-workspace-facts">
        <Fact label={t("settingsOrchestrationPresetId")} value={preset.preset_id} />
        <Fact
          label={t("settingsModelDefault")}
          value={preset.preset_id === defaultPresetId ? t("settingsEnabled") : t("settingsDisabled")}
        />
        <Fact label={t("settingsOrchestrationRoles")} value={String(roleIds.length)} />
      </div>
      <Form
        className="at-settings-form at-orchestration-preset-form"
        form={form}
        id={formId}
        layout="vertical"
        onFinish={(values) => {
          onSave(updateOrchestrationPreset(config, preset.preset_id, values));
        }}
      >
        <Form.Item label={t("settingsPresetName")} name="name">
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("settingsRoleDescription")} name="description">
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("settingsOrchestrationRoles")} name="role_ids">
          <Input autoComplete="off" />
        </Form.Item>
        <Form.Item label={t("settingsOrchestrationPrompt")} name="orchestration_prompt">
          <Input.TextArea autoSize={{ minRows: 4, maxRows: 10 }} />
        </Form.Item>
      </Form>
      <div className="at-settings-list at-orchestration-preset-properties">
        {policyRows.map((row) => (
          <PropertyRow key={row.label} label={row.label} value={row.value} />
        ))}
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="at-settings-property-row">
      <Typography.Text className="at-settings-list-meta">{label}</Typography.Text>
      <Typography.Text ellipsis title={value}>
        {value}
      </Typography.Text>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function roleName(role: RoleOption | null | undefined): string {
  return role?.name?.trim() || role?.role_id || "-";
}

function roleConfigListItem(role: RoleConfigSummary): SettingsListItem {
  return {
    detail: roleConfigDetail(role),
    key: role.role_id,
    meta: role.mode?.trim() || role.source?.trim() || "-",
    title: role.name?.trim() || role.role_id,
  };
}

function roleConfigDetail(role: RoleConfigSummary | undefined): string {
  if (role === undefined) {
    return "-";
  }
  return [
    role.description?.trim() || "",
    role.model_profile?.trim() || "",
    role.bound_agent_id?.trim() || "",
  ].filter(Boolean).join(" · ") || "-";
}

function roleConfigFormValues(document: RoleConfigDocument): RoleConfigForm {
  return {
    bound_agent_id: document.bound_agent_id ?? "",
    description: document.description ?? "",
    mode: document.mode ?? "",
    model_profile: document.model_profile ?? "",
    name: document.name ?? "",
    system_prompt: document.system_prompt ?? "",
    version: document.version ?? "",
  };
}

function updateRoleConfigDocument(
  document: RoleConfigDocument,
  values: RoleConfigForm,
): RoleConfigDocument {
  const mode = textValue(values.mode);
  return {
    ...document,
    bound_agent_id: nullableText(values.bound_agent_id),
    description: textValue(values.description),
    mode: mode || document.mode,
    model_profile: nullableText(values.model_profile),
    name: textValue(values.name),
    system_prompt: values.system_prompt ?? "",
    version: textValue(values.version),
  };
}

function defaultProfile(entries: Array<[string, ModelProfileRecord]>): string {
  return entries.find(([, profile]) => profile.is_default === true)?.[0] ?? "-";
}

function modelProfileDetail(profile: ModelProfileRecord): string {
  return [
    profile.model?.trim() || "",
    modalityList(profile.input_modalities ?? []),
    capabilitySummary(profile),
  ].filter(Boolean).join(" · ") || "-";
}

function orchestrationPresetDetail(preset: OrchestrationPreset): string {
  const roleCount = preset.role_ids?.length ?? 0;
  return [
    roleCount > 0 ? `${roleCount} roles` : "",
    preset.description?.trim() || "",
  ].filter(Boolean).join(" · ") || "-";
}

function orchestrationPresetFormValues(
  preset: OrchestrationPreset,
): OrchestrationPresetForm {
  return {
    description: preset.description ?? "",
    name: preset.name ?? "",
    orchestration_prompt: preset.orchestration_prompt ?? "",
    role_ids: preset.role_ids?.join(", ") ?? "",
  };
}

function updateOrchestrationPreset(
  config: OrchestrationConfig,
  presetId: string,
  values: OrchestrationPresetForm,
): OrchestrationConfig {
  return {
    ...config,
    presets: (config.presets ?? []).map((preset) => {
      if (preset.preset_id !== presetId) {
        return preset;
      }
      return {
        ...preset,
        description: optionalText(values.description),
        name: optionalText(values.name),
        orchestration_prompt: optionalText(values.orchestration_prompt),
        role_ids: parseRoleIds(values.role_ids),
      };
    }),
  };
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed || undefined;
}

function nullableText(value: string | undefined): string | null {
  const trimmed = textValue(value);
  return trimmed || null;
}

function textValue(value: string | undefined): string {
  return value?.trim() ?? "";
}

function parseRoleIds(value: string | undefined): string[] {
  const seen = new Set<string>();
  const roleIds: string[] = [];
  for (const part of (value ?? "").split(/[\n,]+/)) {
    const roleId = part.trim();
    if (!roleId || seen.has(roleId)) {
      continue;
    }
    seen.add(roleId);
    roleIds.push(roleId);
  }
  return roleIds;
}

function orchestrationPolicyRows(
  policy: OrchestrationPolicy | undefined,
): Array<{ label: string; value: string }> {
  if (policy === undefined) {
    return [];
  }
  return [
    ["max_orchestration_cycles", policy.max_orchestration_cycles],
    ["max_parallel_delegated_tasks", policy.max_parallel_delegated_tasks],
    ["auto_plan_long_tasks", policy.auto_plan_long_tasks],
    ["planner_role_id", policy.planner_role_id],
    ["coordinator_inline_budget_steps", policy.coordinator_inline_budget_steps],
    ["max_temporary_roles_per_run", policy.max_temporary_roles_per_run],
    [
      "prefer_temporary_roles_for_long_tasks",
      policy.prefer_temporary_roles_for_long_tasks,
    ],
  ]
    .map(([label, value]) => ({
      label: String(label),
      value: policyValue(value),
    }))
    .filter((row) => row.value !== "");
}

function policyValue(value: boolean | number | string | null | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  return String(value);
}

function modalityList(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(", ");
}

function capabilitySummary(profile: ModelProfileRecord): string {
  const input = capabilityModes(profile.resolved_capabilities?.input ?? profile.capabilities?.input);
  const output = capabilityModes(profile.resolved_capabilities?.output ?? profile.capabilities?.output);
  return [input ? `in: ${input}` : "", output ? `out: ${output}` : ""]
    .filter(Boolean)
    .join(" / ");
}

function capabilityModes(modes: ModalityCapabilities | undefined): string {
  if (modes === undefined) {
    return "";
  }
  return [
    ["audio", modes.audio],
    ["image", modes.image],
    ["text", modes.text],
    ["video", modes.video],
  ]
    .filter(([, enabled]) => enabled === true)
    .map(([name]) => name)
    .join(", ");
}
