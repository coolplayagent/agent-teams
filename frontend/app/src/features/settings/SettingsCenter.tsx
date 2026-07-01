import {
  App,
  Button,
  Form,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Switch,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  deleteModelProfile,
  deleteRoleConfig,
  getGeneralConfig,
  getConfigStatus,
  getModelCatalog,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfig,
  getRoleConfigOptions,
  getAgentRuntimes,
  listRoleConfigs,
  probeModelConnection,
  refreshModelCatalog,
  reloadModelConfig,
  saveGeneralConfig,
  saveModelProfile,
  saveRoleConfig,
  validateRoleConfig,
} from "../../api/client";
import type {
  GeneralConfig,
  AgentRuntimeSummary,
  ModalityCapabilities,
  ModelCapabilities,
  ModelCatalogModel,
  ModelCatalogProvider,
  ModelCatalogResult,
  ModelConnectivityProbeResult,
  ModelProfileRecord,
  ModelProfileSaveRequest,
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
import { HooksSettingsSection } from "./HooksSettingsSection";
import { McpSettingsSection } from "./McpSettingsSection";
import { NotificationSettingsSection } from "./NotificationSettingsSection";
import { OrchestrationSettingsSection } from "./OrchestrationSettingsSection";
import { ProxySettingsSection } from "./ProxySettingsSection";
import {
  AgentRuntimeSettingsSection,
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

type GeneralRelatedSectionKey = Extract<
  SettingsSectionKey,
  "appearance" | "notifications" | "speech"
>;

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
            onNavigate={setActiveSection}
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
          <OrchestrationSettingsSection
            config={orchestrationQuery.data}
            error={orchestrationQuery.error}
            loading={orchestrationQuery.isLoading}
            roles={rolesQuery.data}
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
  onNavigate,
  onSubmit,
  saving,
}: {
  error: Error | null;
  form: FormInstance<GeneralConfig>;
  loading: boolean;
  onNavigate: (section: GeneralRelatedSectionKey) => void;
  onSubmit: (values: GeneralConfig) => void;
  saving: boolean;
}) {
  const t = useTranslations();
  const relatedItems: Array<{
    detail: string;
    key: GeneralRelatedSectionKey;
    title: string;
  }> = [
    {
      detail: t("settingsAppearanceShowDiagnosticsHelp"),
      key: "appearance",
      title: t("settingsAppearanceShowDiagnostics"),
    },
    {
      detail: t("settingsGeneralSpeechDetail"),
      key: "speech",
      title: t("settingsSpeech"),
    },
    {
      detail: t("settingsNotificationsHelp"),
      key: "notifications",
      title: t("settingsNotifications"),
    },
  ];

  return (
    <SettingsSection title={t("settingsGeneral")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading ? (
        <Form
          className="at-general-page"
          form={form}
          layout="vertical"
          onFinish={onSubmit}
        >
          <Typography.Text className="at-settings-help">
            {t("settingsGeneralDescription")}
          </Typography.Text>
          <section className="at-general-card">
            <div className="at-general-card-head">
              <div className="at-general-card-copy">
                <Typography.Text strong>
                  {t("settingsGeneralShellPolicyTitle")}
                </Typography.Text>
                <Typography.Text className="at-settings-help">
                  {t("settingsGeneralShellPolicyHelp")}
                </Typography.Text>
              </div>
              <Form.Item
                name="shell_safety_policy_enabled"
                noStyle
                valuePropName="checked"
              >
                <Switch aria-label={t("settingsShellSafetyPolicy")} />
              </Form.Item>
            </div>
            <div className="at-general-field">
              <Typography.Text>{t("settingsShellSafetyPolicy")}</Typography.Text>
              <Typography.Text className="at-settings-help">
                {t("settingsGeneralShellPolicyState")}
              </Typography.Text>
            </div>
          </section>

          <section className="at-general-related" aria-label={t("settingsGeneralRelated")}>
            <Typography.Text className="at-general-related-title" strong>
              {t("settingsGeneralRelated")}
            </Typography.Text>
            {relatedItems.map((item) => (
              <button
                className="at-general-related-row"
                key={item.key}
                onClick={() => onNavigate(item.key)}
                type="button"
              >
                <span className="at-general-related-copy">
                  <Typography.Text strong>{item.title}</Typography.Text>
                  <Typography.Text className="at-settings-help">
                    {item.detail}
                  </Typography.Text>
                </span>
                <span className="at-general-related-action">
                  {t("settingsGeneralOpen")}
                </span>
              </button>
            ))}
          </section>

          <div className="at-general-actions">
            <Button htmlType="submit" loading={saving} type="primary">
              {t("settingsSave")}
            </Button>
          </div>
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
  const [creatingRole, setCreatingRole] = useState(false);
  const roleConfigsQuery = useQuery({
    queryKey: ["settings", "roles", "configs"],
    queryFn: listRoleConfigs,
  });
  const agentRuntimesQuery = useQuery({
    queryKey: ["settings", "agent-runtimes"],
    queryFn: getAgentRuntimes,
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
      setCreatingRole(false);
      setSelectedRoleId(document.role_id);
      queryClient.setQueryData(
        ["settings", "roles", "configs", document.role_id],
        document,
      );
      queryClient.setQueryData<RoleConfigSummary[]>(
        ["settings", "roles", "configs"],
        (current) => upsertRoleConfigSummary(current ?? [], document),
      );
      void queryClient.invalidateQueries({ queryKey: ["settings", "roles"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsSaveFailed"),
      );
    },
  });
  const validateMutation = useMutation({
    mutationFn: (document: RoleConfigDocument) => validateRoleConfig(document),
    onSuccess: () => {
      void message.success(t("settingsRoleValidated"));
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error
          ? mutationError.message
          : t("settingsRoleValidationFailed"),
      );
    },
  });
  const deleteMutation = useMutation({
    mutationFn: (roleId: string) => deleteRoleConfig(roleId),
    onSuccess: () => {
      void message.success(t("settingsRoleDeleted"));
      const deletedRoleId = deleteMutation.variables;
      setSelectedRoleId(null);
      setCreatingRole(false);
      if (deletedRoleId !== undefined) {
        queryClient.setQueryData<RoleConfigSummary[]>(
          ["settings", "roles", "configs"],
          (current) =>
            (current ?? []).filter((role) => role.role_id !== deletedRoleId),
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["settings", "roles"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsRoleDeleteFailed"),
      );
    },
  });
  const normalRoles = roles?.normal_mode_roles ?? [];
  const subagentRoles = roles?.subagent_roles ?? [];
  const roleItems = useMemo(
    () => (roleConfigsQuery.data ?? []).map((role) => roleConfigListItem(role)),
    [roleConfigsQuery.data],
  );
  const creatingRoleDocument = useMemo(
    () => newRoleConfigDraft(),
    [creatingRole],
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
      {creatingRole ? (
        <RoleConfigDetail
          creating
          deleting={false}
          document={creatingRoleDocument}
          error={null}
          loading={false}
          onBack={() => setCreatingRole(false)}
          onDelete={() => undefined}
          onSave={(document) => saveMutation.mutate(document)}
          onValidate={(document) => validateMutation.mutate(document)}
          agentRuntimes={agentRuntimesQuery.data ?? []}
          agentRuntimesLoading={agentRuntimesQuery.isLoading}
          roleId="new-role"
          saving={saveMutation.isPending}
          summary={undefined}
          validating={validateMutation.isPending}
        />
      ) : selectedRoleId !== null ? (
        <RoleConfigDetail
          deleting={deleteMutation.isPending}
          document={selectedRoleQuery.data}
          error={selectedRoleQuery.error}
          loading={selectedRoleQuery.isLoading}
          onBack={() => setSelectedRoleId(null)}
          onDelete={(roleId) => deleteMutation.mutate(roleId)}
          onSave={(document) => saveMutation.mutate(document)}
          onValidate={(document) => validateMutation.mutate(document)}
          agentRuntimes={agentRuntimesQuery.data ?? []}
          agentRuntimesLoading={agentRuntimesQuery.isLoading}
          roleId={selectedRoleId}
          saving={saveMutation.isPending}
          summary={selectedRoleSummary}
          validating={validateMutation.isPending}
        />
      ) : !roleConfigsQuery.isLoading && roleConfigsQuery.data !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsCoordinator")} value={roleName(roles?.coordinator_role)} />
            <Fact label={t("settingsMainAgent")} value={roleName(roles?.main_agent_role)} />
            <Fact label={t("settingsNormalRoles")} value={String(normalRoles.length)} />
            <Fact label={t("settingsSubagentRoles")} value={String(subagentRoles.length)} />
          </div>
          <div className="at-settings-section-actions">
            <Button onClick={() => setCreatingRole(true)} type="primary">
              {t("settingsRoleNew")}
            </Button>
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
  creating = false,
  deleting,
  document,
  error,
  loading,
  onBack,
  onDelete,
  onSave,
  onValidate,
  agentRuntimes,
  agentRuntimesLoading,
  roleId,
  saving,
  summary,
  validating,
}: {
  creating?: boolean;
  deleting: boolean;
  document: RoleConfigDocument | undefined;
  error: Error | null;
  loading: boolean;
  onBack: () => void;
  onDelete: (roleId: string) => void;
  onSave: (document: RoleConfigDocument) => void;
  onValidate: (document: RoleConfigDocument) => void;
  agentRuntimes: AgentRuntimeSummary[];
  agentRuntimesLoading: boolean;
  roleId: string;
  saving: boolean;
  summary: RoleConfigSummary | undefined;
  validating: boolean;
}) {
  const t = useTranslations();
  const [form] = Form.useForm<RoleConfigForm>();
  const formId = `at-role-config-form-${roleId}`;
  const [systemPromptView, setSystemPromptView] =
    useState<"edit" | "preview">("edit");
  const [systemPromptPreview, setSystemPromptPreview] = useState("");
  const boundAgentOptions = useMemo(
    () => agentRuntimeSelectOptions(agentRuntimes, document?.bound_agent_id),
    [agentRuntimes, document?.bound_agent_id],
  );

  useEffect(() => {
    if (document !== undefined) {
      form.setFieldsValue(roleConfigFormValues(document));
      setSystemPromptPreview(document.system_prompt ?? "");
      setSystemPromptView("edit");
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
            <>
              <Button
                loading={validating}
                onClick={() => {
                  form
                    .validateFields()
                    .then((values) =>
                      onValidate(updateRoleConfigDocument(document, values)),
                    )
                    .catch(() => undefined);
                }}
              >
                {t("settingsRoleValidate")}
              </Button>
              <Button form={formId} htmlType="submit" loading={saving} type="primary">
                {t("settingsSave")}
              </Button>
              {!creating && (document.deletable === true || summary?.deletable === true) ? (
                <Popconfirm
                  onConfirm={() => onDelete(document.role_id)}
                  title={t("settingsRoleDeleteConfirm", { role: title })}
                >
                  <Button danger loading={deleting}>
                    {t("settingsRoleDelete")}
                  </Button>
                </Popconfirm>
              ) : null}
            </>
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
            onValuesChange={(changedValues: Partial<RoleConfigForm>) => {
              if (typeof changedValues.system_prompt === "string") {
                setSystemPromptPreview(changedValues.system_prompt);
              }
            }}
          >
            <Form.Item
              label={t("settingsRoleId")}
              name="role_id"
              rules={[{ message: t("settingsRoleIdRequired"), required: true }]}
            >
              <Input autoComplete="off" disabled={!creating} />
            </Form.Item>
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
            <Form.Item
              label={t("settingsRoleMemoryEnabled")}
              name="memory_enabled"
              valuePropName="checked"
            >
              <Switch />
            </Form.Item>
            <Form.Item label={t("settingsRoleBoundAgent")} name="bound_agent_id">
              <Select
                allowClear
                loading={agentRuntimesLoading}
                optionFilterProp="label"
                options={boundAgentOptions}
                showSearch
              />
            </Form.Item>
            <Form.Item label={t("settingsRoleMode")} name="mode">
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item label={t("settingsRoleSystemPrompt")}>
              <div className="at-role-prompt-editor">
                <Segmented
                  aria-label={t("settingsRolePromptView")}
                  onChange={(value) =>
                    setSystemPromptView(value as "edit" | "preview")
                  }
                  options={[
                    { label: t("settingsRolePromptEdit"), value: "edit" },
                    { label: t("settingsRolePromptPreview"), value: "preview" },
                  ]}
                  value={systemPromptView}
                />
                <div
                  className={
                    systemPromptView === "edit"
                      ? "at-role-prompt-textarea"
                      : "at-role-prompt-textarea is-hidden"
                  }
                >
                  <Form.Item name="system_prompt" noStyle>
                    <Input.TextArea
                      aria-label={t("settingsRoleSystemPrompt")}
                      autoSize={{ minRows: 8, maxRows: 18 }}
                    />
                  </Form.Item>
                </div>
                {systemPromptView === "preview" ? (
                  <div
                    aria-label={t("settingsRolePromptPreview")}
                    className="at-role-prompt-preview"
                    role="region"
                  >
                    {systemPromptPreview.trim() ? (
                      <pre>{systemPromptPreview}</pre>
                    ) : (
                      <Typography.Text type="secondary">
                        {t("settingsRolePromptPreviewEmpty")}
                      </Typography.Text>
                    )}
                  </div>
                ) : null}
              </div>
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
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [catalogEnabled, setCatalogEnabled] = useState(false);
  const [optimisticProfile, setOptimisticProfile] = useState<{
    profile: ModelProfileRecord;
    profileId: string;
  } | null>(null);
  const [probeStates, setProbeStates] = useState<Record<string, ModelProbeState>>({});
  const catalogQuery = useQuery({
    queryKey: ["settings", "models", "catalog"],
    queryFn: () => getModelCatalog(false),
    enabled: catalogEnabled,
  });
  const entries = useMemo(
    () => Object.entries(profiles ?? {}).sort(([left], [right]) => left.localeCompare(right)),
    [profiles],
  );
  const selectedProfile =
    selectedProfileId !== null
      ? profiles?.[selectedProfileId] ??
        (optimisticProfile?.profileId === selectedProfileId
          ? optimisticProfile.profile
          : undefined)
      : undefined;

  const refreshCatalogMutation = useMutation({
    mutationFn: refreshModelCatalog,
    onSuccess: (catalog) => {
      queryClient.setQueryData(["settings", "models", "catalog"], catalog);
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsModelCatalogFailed"),
      );
    },
  });

  useEffect(() => {
    if (selectedProfileId === null) {
      return;
    }
    if (profiles?.[selectedProfileId] !== undefined) {
      if (optimisticProfile?.profileId === selectedProfileId) {
        setOptimisticProfile(null);
      }
      return;
    }
    if (optimisticProfile?.profileId !== selectedProfileId) {
      setSelectedProfileId(null);
    }
  }, [optimisticProfile, profiles, selectedProfileId]);

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
        setOptimisticProfile(null);
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

  const saveMutation = useMutation({
    mutationFn: async ({
      currentProfileId,
      nextProfileId,
      profile,
      values,
    }: {
      currentProfileId: string | null;
      nextProfileId: string;
      profile: ModelProfileRecord;
      values: ModelProfileFormValues;
    }) => {
      const request = buildModelProfileSaveRequest(profile, {
        sourceName: currentProfileId ?? undefined,
        values,
      });
      const result = await saveModelProfile(nextProfileId, request);
      await reloadModelConfig();
      return { nextProfile: modelProfileRecordFromSaveRequest(profile, request), nextProfileId, result };
    },
    onSuccess: ({ nextProfile, nextProfileId }, variables) => {
      setCreatingProfile(false);
      setCatalogEnabled(false);
      setOptimisticProfile({ profile: nextProfile, profileId: nextProfileId });
      queryClient.setQueryData<Record<string, ModelProfileRecord>>(
        ["settings", "models", "profiles"],
        (current) => {
          const nextProfiles = { ...(current ?? {}) };
          if (variables.currentProfileId !== null && variables.currentProfileId !== nextProfileId) {
            delete nextProfiles[variables.currentProfileId];
          }
          nextProfiles[nextProfileId] = nextProfile;
          return nextProfiles;
        },
      );
      setSelectedProfileId(nextProfileId);
      void message.success(t("settingsModelSaved", { name: nextProfileId }));
      void queryClient.invalidateQueries({ queryKey: ["settings", "models", "profiles"] });
    },
    onError: (mutationError) => {
      void message.error(
        mutationError instanceof Error ? mutationError.message : t("settingsSaveFailed"),
      );
    },
  });

  const probeMutation = useMutation({
    mutationFn: async (profileId: string) => {
      const timeoutSeconds = finiteNumber(
        profiles?.[profileId]?.connect_timeout_seconds,
        15,
      );
      const result = await probeModelConnection({
        profile_name: profileId,
        timeout_ms: Math.round(timeoutSeconds * 1000),
      });
      return { profileId, result };
    },
    onSuccess: ({ profileId, result }) => {
      setProbeStates((current) => ({
        ...current,
        [profileId]: { result },
      }));
    },
    onError: (mutationError, profileId) => {
      setProbeStates((current) => ({
        ...current,
        [profileId]: {
          error:
            mutationError instanceof Error ? mutationError.message : t("settingsModelTestFailed"),
        },
      }));
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
  const requestSave = (
    currentProfileId: string | null,
    nextProfileId: string,
    profile: ModelProfileRecord,
    values: ModelProfileFormValues,
  ) => {
    saveMutation.mutate({ currentProfileId, nextProfileId, profile, values });
  };
  const requestProbe = (profileId: string) => {
    setProbeStates((current) => ({
      ...current,
      [profileId]: { result: undefined },
    }));
    probeMutation.mutate(profileId);
  };
  const openCreateProfile = () => {
    setSelectedProfileId(null);
    setCreatingProfile(true);
    setCatalogEnabled(true);
  };
  const cancelCreateProfile = () => {
    setCreatingProfile(false);
    setCatalogEnabled(false);
  };
  const refreshCatalog = () => {
    setCatalogEnabled(true);
    refreshCatalogMutation.mutate();
  };

  return (
    <SettingsSection title={t("settingsModels")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && profiles !== undefined ? (
        creatingProfile ? (
          <ModelProfileDetail
            catalog={catalogQuery.data}
            catalogError={catalogQuery.error}
            catalogLoading={catalogQuery.isLoading || refreshCatalogMutation.isPending}
            deleting={false}
            mode="create"
            onBack={cancelCreateProfile}
            onDelete={requestDelete}
            onProbe={requestProbe}
            onRefreshCatalog={refreshCatalog}
            onSave={requestSave}
            onSetDefault={requestDefault}
            probeState={null}
            probing={false}
            profile={newModelProfileDraft()}
            profileId=""
            saving={saveMutation.isPending}
            settingDefault={false}
          />
        ) : selectedProfileId !== null && selectedProfile !== undefined ? (
          <ModelProfileDetail
            catalog={undefined}
            catalogError={null}
            catalogLoading={false}
            mode="edit"
            onBack={() => setSelectedProfileId(null)}
            onDelete={requestDelete}
            onProbe={requestProbe}
            onRefreshCatalog={refreshCatalog}
            onSave={requestSave}
            onSetDefault={requestDefault}
            deleting={deleteMutation.isPending}
            probeState={probeStates[selectedProfileId] ?? null}
            probing={probeMutation.isPending && probeMutation.variables === selectedProfileId}
            profile={selectedProfile}
            profileId={selectedProfileId}
            saving={saveMutation.isPending}
            settingDefault={setDefaultMutation.isPending}
          />
        ) : (
          <>
            <div className="at-settings-toolbar at-model-profile-toolbar">
              <Button onClick={openCreateProfile} type="primary">
                {t("settingsModelNewProfile")}
              </Button>
            </div>
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
                        <Button
                          loading={probeMutation.isPending && probeMutation.variables === profileId}
                          onClick={() => requestProbe(profileId)}
                          size="small"
                        >
                          {t("settingsModelTest")}
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

interface ModelProfileFormValues {
  api_key?: string;
  base_url?: string;
  connect_timeout_seconds?: string;
  context_window?: string;
  fallback_policy_id?: string;
  fallback_priority?: string;
  image_capability?: ImageCapabilityMode;
  is_default?: boolean;
  max_tokens?: string;
  model?: string;
  profile_id?: string;
  provider?: string;
  ssl_verify?: string;
  temperature?: string;
  top_p?: string;
}

type ImageCapabilityMode = "follow" | "supported" | "unsupported";

interface ModelProbeState {
  result?: ModelConnectivityProbeResult;
  error?: string;
}

function ModelProfileDetail({
  catalog,
  catalogError,
  catalogLoading,
  deleting,
  mode,
  onBack,
  onDelete,
  onProbe,
  onRefreshCatalog,
  onSave,
  onSetDefault,
  probeState,
  probing,
  profile,
  profileId,
  saving,
  settingDefault,
}: {
  catalog: ModelCatalogResult | undefined;
  catalogError: Error | null;
  catalogLoading: boolean;
  deleting: boolean;
  mode: "create" | "edit";
  onBack: () => void;
  onDelete: (profileId: string) => void;
  onProbe: (profileId: string) => void;
  onRefreshCatalog: () => void;
  onSave: (
    currentProfileId: string | null,
    nextProfileId: string,
    profile: ModelProfileRecord,
    values: ModelProfileFormValues,
  ) => void;
  onSetDefault: (profileId: string, profile: ModelProfileRecord) => void;
  probeState: ModelProbeState | null;
  probing: boolean;
  profile: ModelProfileRecord;
  profileId: string;
  saving: boolean;
  settingDefault: boolean;
}) {
  const t = useTranslations();
  const [form] = Form.useForm<ModelProfileFormValues>();
  const [catalogProfilePatch, setCatalogProfilePatch] =
    useState<ModelProfileRecord | null>(null);
  const effectiveProfile =
    catalogProfilePatch !== null ? { ...profile, ...catalogProfilePatch } : profile;
  const input = capabilityModes(
    effectiveProfile.resolved_capabilities?.input ?? effectiveProfile.capabilities?.input,
  );
  const output = capabilityModes(
    effectiveProfile.resolved_capabilities?.output ?? effectiveProfile.capabilities?.output,
  );
  const probeMessage =
    probeState?.error ??
    (probeState?.result !== undefined ? formatModelProbeResult(probeState.result, t) : null);
  const probeTone =
    probeState?.error !== undefined || probeState?.result?.ok === false ? "is-error" : "is-ok";

  useEffect(() => {
    form.setFieldsValue(modelProfileToFormValues(profileId, profile));
    setCatalogProfilePatch(null);
  }, [form, profile, profileId]);

  const submitProfile = (values: ModelProfileFormValues) => {
    const nextProfileId = values.profile_id?.trim() ?? "";
    if (!nextProfileId) {
      void form.validateFields(["profile_id"]);
      return;
    }
    onSave(mode === "edit" ? profileId : null, nextProfileId, effectiveProfile, values);
  };

  const selectCatalogModel = (
    provider: ModelCatalogProvider,
    model: ModelCatalogModel,
  ) => {
    const nextBaseUrl = modelCatalogBaseUrl(provider);
    const nextProvider = provider.runtime_provider?.trim() || "openai_compatible";
    const nextPatch: ModelProfileRecord = {
      base_url: nextBaseUrl,
      catalog_model_name: model.name,
      catalog_provider_id: provider.id,
      catalog_provider_name: provider.name,
      capabilities: model.capabilities,
      context_window: model.context_window ?? null,
      input_modalities: model.input_modalities ?? [],
      max_tokens: model.output_limit ?? null,
      model: model.id,
      provider: nextProvider,
    };
    setCatalogProfilePatch(nextPatch);
    form.setFieldsValue({
      base_url: nextBaseUrl,
      context_window: model.context_window !== undefined && model.context_window !== null
        ? String(model.context_window)
        : "",
      image_capability: imageCapabilityMode(nextPatch.capabilities),
      max_tokens: model.output_limit !== undefined && model.output_limit !== null
        ? String(model.output_limit)
        : "",
      model: model.id,
      provider: nextProvider,
    });
  };

  const clearCatalogPatchOnManualEndpointEdit = (
    changedValues: Partial<ModelProfileFormValues>,
  ) => {
    if (
      "base_url" in changedValues ||
      "model" in changedValues ||
      "provider" in changedValues
    ) {
      setCatalogProfilePatch(null);
    }
  };

  return (
    <div className="at-settings-detail-page at-model-profile-detail">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <span>{profileId}</span>
          <Typography.Text>{modelProfileDetail(profile)}</Typography.Text>
        </div>
        <div className="at-settings-detail-actions">
          <Button loading={saving} onClick={() => form.submit()} type="primary">
            {t("settingsSave")}
          </Button>
          {mode === "edit" ? (
            <>
              <Button loading={probing} onClick={() => onProbe(profileId)}>
                {t("settingsModelTest")}
              </Button>
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
            </>
          ) : null}
          <Button onClick={onBack}>{t("settingsBack")}</Button>
        </div>
      </div>
      {probeMessage !== null ? (
        <div className={`at-model-profile-probe-state ${probeTone}`}>{probeMessage}</div>
      ) : null}
      <Form
        className="at-settings-form at-settings-wide-form at-model-profile-form"
        form={form}
        layout="vertical"
        onFinish={submitProfile}
        onValuesChange={clearCatalogPatchOnManualEndpointEdit}
      >
        {mode === "create" ? (
          <ModelCatalogPicker
            catalog={catalog}
            error={catalogError}
            loading={catalogLoading}
            onRefresh={onRefreshCatalog}
            onSelect={selectCatalogModel}
            selectedModelId={effectiveProfile.model ?? ""}
            selectedProviderId={effectiveProfile.catalog_provider_id ?? ""}
          />
        ) : null}
        <div className="at-settings-form-card at-model-profile-form-grid">
          <Form.Item
            label={t("settingsModelProfileId")}
            name="profile_id"
            rules={[{ message: t("settingsModelProfileIdRequired"), required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t("settingsModelProvider")}
            name="provider"
            rules={[{ message: t("settingsModelProviderRequired"), required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t("settingsModelName")}
            name="model"
            rules={[{ message: t("settingsModelNameRequired"), required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            label={t("settingsModelBaseUrl")}
            name="base_url"
            rules={[{ message: t("settingsModelBaseUrlRequired"), required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label={t("settingsModelTemperature")} name="temperature">
            <Input inputMode="decimal" type="number" />
          </Form.Item>
          <Form.Item label={t("settingsModelTopP")} name="top_p">
            <Input inputMode="decimal" type="number" />
          </Form.Item>
          <Form.Item label={t("settingsModelContextWindow")} name="context_window">
            <Input inputMode="numeric" type="number" />
          </Form.Item>
          <Form.Item label={t("settingsModelMaxTokens")} name="max_tokens">
            <Input inputMode="numeric" type="number" />
          </Form.Item>
          <Form.Item label={t("settingsModelTimeoutSeconds")} name="connect_timeout_seconds">
            <Input inputMode="decimal" type="number" />
          </Form.Item>
          <Form.Item label={t("settingsModelApiKey")} name="api_key">
            <Input.Password
              autoComplete="new-password"
              placeholder={
                modelProfileHasApiKey(profile)
                  ? t("settingsModelApiKeyPreserved")
                  : t("settingsModelApiKeyPlaceholder")
              }
            />
          </Form.Item>
          <Form.Item label={t("settingsModelImageCapability")} name="image_capability">
            <select className="at-settings-native-select">
              <option value="follow">{t("settingsModelImageCapabilityFollow")}</option>
              <option value="supported">{t("settingsModelImageCapabilitySupported")}</option>
              <option value="unsupported">{t("settingsModelImageCapabilityUnsupported")}</option>
            </select>
          </Form.Item>
          <Form.Item label={t("settingsModelFallbackPolicy")} name="fallback_policy_id">
            <Input />
          </Form.Item>
          <Form.Item label={t("settingsModelFallbackPriority")} name="fallback_priority">
            <Input inputMode="numeric" type="number" />
          </Form.Item>
          <Form.Item label={t("settingsModelSslVerify")} name="ssl_verify">
            <Input placeholder={t("settingsModelSslVerifyPlaceholder")} />
          </Form.Item>
          <Form.Item
            className="at-model-profile-switch-field"
            label={t("settingsModelDefault")}
            name="is_default"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
      </Form>
      <div className="at-settings-facts at-settings-workspace-facts">
        <Fact
          label={t("settingsModelProvider")}
          value={effectiveProfile.provider ?? t("settingsProviderUnknown")}
        />
        <Fact label={t("settingsModelName")} value={effectiveProfile.model ?? "-"} />
        <Fact
          label={t("settingsModelDefault")}
          value={
            effectiveProfile.is_default === true ? t("settingsEnabled") : t("settingsDisabled")
          }
        />
      </div>
      <div className="at-settings-list at-model-profile-properties">
        <PropertyRow label={t("settingsModelInput")} value={input || "-"} />
        <PropertyRow label={t("settingsModelOutput")} value={output || "-"} />
        <PropertyRow
          label={t("settingsModelModalities")}
          value={modalityList(effectiveProfile.input_modalities ?? []) || "-"}
        />
        <PropertyRow
          label={t("settingsModelSpeechRealtime")}
          value={effectiveProfile.speech_realtime?.model ?? "-"}
        />
      </div>
    </div>
  );
}

function ModelCatalogPicker({
  catalog,
  error,
  loading,
  onRefresh,
  onSelect,
  selectedModelId,
  selectedProviderId,
}: {
  catalog: ModelCatalogResult | undefined;
  error: Error | null;
  loading: boolean;
  onRefresh: () => void;
  onSelect: (provider: ModelCatalogProvider, model: ModelCatalogModel) => void;
  selectedModelId: string;
  selectedProviderId: string;
}) {
  const t = useTranslations();
  const [providerFilter, setProviderFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const providers = catalog?.providers ?? [];
  const filteredProviders = providers.filter((provider) =>
    textIncludes(`${provider.name} ${provider.id}`, providerFilter),
  );
  const activeProvider =
    providers.find((provider) => provider.id === selectedProviderId) ??
    filteredProviders[0] ??
    null;
  const filteredModels = (activeProvider?.models ?? []).filter((model) =>
    textIncludes(`${model.name} ${model.id} ${model.family ?? ""}`, modelFilter),
  );
  const catalogMessage = catalogStatusText(catalog, t);

  return (
    <div className="at-model-catalog-panel">
      <div className="at-model-catalog-header">
        <div>
          <Typography.Text strong>{t("settingsModelCatalogTitle")}</Typography.Text>
          <Typography.Text className="at-model-catalog-status">
            {error !== null
              ? t("settingsModelCatalogFailed")
              : catalogMessage}
          </Typography.Text>
        </div>
        <Button loading={loading} onClick={onRefresh} size="small">
          {t("settingsRefresh")}
        </Button>
      </div>
      <div className="at-model-catalog-grid">
        <div className="at-model-catalog-column">
          <Input
            aria-label={t("settingsModelCatalogProviderSearch")}
            onChange={(event) => setProviderFilter(event.target.value)}
            placeholder={t("settingsModelCatalogProviderSearch")}
            value={providerFilter}
          />
          <div className="at-model-catalog-list">
            {filteredProviders.length > 0 ? (
              filteredProviders.map((provider) => (
                <button
                  className={
                    provider.id === activeProvider?.id
                      ? "at-model-catalog-option is-active"
                      : "at-model-catalog-option"
                  }
                  key={provider.id}
                  onClick={() => {
                    const firstModel = provider.models?.[0];
                    if (firstModel !== undefined) {
                      onSelect(provider, firstModel);
                    }
                  }}
                  type="button"
                >
                  <span>{provider.name}</span>
                  <Typography.Text>{provider.runtime_provider ?? "-"}</Typography.Text>
                </button>
              ))
            ) : (
              <div className="at-settings-empty">{t("settingsModelCatalogEmpty")}</div>
            )}
          </div>
        </div>
        <div className="at-model-catalog-column">
          <Input
            aria-label={t("settingsModelCatalogModelSearch")}
            onChange={(event) => setModelFilter(event.target.value)}
            placeholder={t("settingsModelCatalogModelSearch")}
            value={modelFilter}
          />
          <div className="at-model-catalog-list">
            {activeProvider === null ? (
              <div className="at-settings-empty">
                {t("settingsModelCatalogSelectProvider")}
              </div>
            ) : filteredModels.length > 0 ? (
              filteredModels.map((model) => (
                <button
                  className={
                    model.id === selectedModelId
                      ? "at-model-catalog-option is-active"
                      : "at-model-catalog-option"
                  }
                  key={model.id}
                  onClick={() => onSelect(activeProvider, model)}
                  type="button"
                >
                  <span>{model.name}</span>
                  <Typography.Text>{modelCatalogModelMeta(model)}</Typography.Text>
                </button>
              ))
            ) : (
              <div className="at-settings-empty">{t("settingsModelCatalogNoModels")}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildModelProfileSaveRequest(
  profile: ModelProfileRecord,
  options: {
    isDefault?: boolean;
    sourceName?: string;
    values?: ModelProfileFormValues;
  } = {},
): ModelProfileSaveRequest {
  const values = options.values;
  const request: ModelProfileSaveRequest = {
    base_url: values?.base_url?.trim() ?? profile.base_url ?? "",
    connect_timeout_seconds:
      values !== undefined
        ? positiveNumberFromText(
            values.connect_timeout_seconds,
            finiteNumber(profile.connect_timeout_seconds, 15),
          )
        : finiteNumber(profile.connect_timeout_seconds, 15),
    context_window:
      values !== undefined
        ? positiveIntegerOrNullFromText(values.context_window)
        : integerOrNull(profile.context_window),
    fallback_policy_id:
      values !== undefined ? trimmedStringOrNull(values.fallback_policy_id) : profile.fallback_policy_id ?? null,
    fallback_priority:
      values !== undefined
        ? nonNegativeIntegerFromText(
            values.fallback_priority,
            finiteNumber(profile.fallback_priority, 0),
          )
        : finiteNumber(profile.fallback_priority, 0),
    is_default:
      options.isDefault === true
        ? true
        : values !== undefined
          ? values.is_default === true
          : profile.is_default === true,
    model: values?.model?.trim() ?? profile.model ?? "",
    provider: values?.provider?.trim() ?? profile.provider ?? "openai_compatible",
    temperature:
      values !== undefined
        ? finiteNumberFromText(values.temperature, finiteNumber(profile.temperature, 0.7))
        : finiteNumber(profile.temperature, 0.7),
    top_p:
      values !== undefined
        ? finiteNumberFromText(values.top_p, finiteNumber(profile.top_p, 1))
        : finiteNumber(profile.top_p, 1),
  };
  if (values !== undefined) {
    request.max_tokens = positiveIntegerOrNullFromText(values.max_tokens);
    const apiKey = textValue(values.api_key);
    if (apiKey.length > 0) {
      request.api_key = apiKey;
    }
    const imageCapabilities = modelCapabilitiesForImageMode(
      profile.capabilities,
      values.image_capability,
    );
    if (imageCapabilities !== undefined) {
      request.capabilities = imageCapabilities;
    }
    const sslVerify = optionalBooleanFromText(values.ssl_verify);
    if (sslVerify !== null) {
      request.ssl_verify = sslVerify;
    }
  } else if (profile.max_tokens !== undefined) {
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
  if (values === undefined && (profile.ssl_verify === true || profile.ssl_verify === false)) {
    request.ssl_verify = profile.ssl_verify;
  }
  if (options.sourceName !== undefined) {
    request.source_name = options.sourceName;
  }
  if (values === undefined && profile.api_key !== undefined) {
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
  if (values === undefined && profile.capabilities !== undefined) {
    request.capabilities = profile.capabilities;
  }
  if (profile.speech_realtime !== undefined) {
    request.speech_realtime = profile.speech_realtime;
  }
  return request;
}

function modelProfileToFormValues(
  profileId: string,
  profile: ModelProfileRecord,
): ModelProfileFormValues {
  return {
    base_url: profile.base_url ?? "",
    connect_timeout_seconds: String(finiteNumber(profile.connect_timeout_seconds, 15)),
    context_window:
      typeof profile.context_window === "number" && Number.isFinite(profile.context_window)
        ? String(profile.context_window)
        : "",
    fallback_policy_id: profile.fallback_policy_id ?? "",
    fallback_priority: String(finiteNumber(profile.fallback_priority, 0)),
    is_default: profile.is_default === true,
    max_tokens:
      typeof profile.max_tokens === "number" && Number.isFinite(profile.max_tokens)
        ? String(profile.max_tokens)
        : "",
    model: profile.model ?? "",
    api_key: "",
    image_capability: imageCapabilityMode(profile.capabilities),
    profile_id: profileId,
    provider: profile.provider ?? "openai_compatible",
    ssl_verify: serializeOptionalBoolean(profile.ssl_verify),
    temperature: String(finiteNumber(profile.temperature, 0.7)),
    top_p: String(finiteNumber(profile.top_p, 1)),
  };
}

function modelProfileHasApiKey(profile: ModelProfileRecord): boolean {
  return profile.has_api_key === true || textValue(profile.api_key ?? undefined).length > 0;
}

function imageCapabilityMode(
  capabilities: ModelCapabilities | undefined,
): ImageCapabilityMode {
  const imageCapability = capabilities?.input?.image;
  if (imageCapability === true) {
    return "supported";
  }
  if (imageCapability === false) {
    return "unsupported";
  }
  return "follow";
}

function modelCapabilitiesForImageMode(
  capabilities: ModelCapabilities | undefined,
  mode: ImageCapabilityMode | undefined,
): ModelCapabilities | undefined {
  if (mode === undefined) {
    return capabilities;
  }
  const input = { ...(capabilities?.input ?? {}) };
  if (mode === "follow") {
    delete input.image;
  } else {
    input.image = mode === "supported";
  }
  return compactModelCapabilities({
    ...capabilities,
    input,
  });
}

function compactModelCapabilities(
  capabilities: ModelCapabilities,
): ModelCapabilities | undefined {
  const input = compactModalityCapabilities(capabilities.input);
  const output = compactModalityCapabilities(capabilities.output);
  if (input === undefined && output === undefined) {
    return undefined;
  }
  return {
    ...(input === undefined ? {} : { input }),
    ...(output === undefined ? {} : { output }),
  };
}

function compactModalityCapabilities(
  capabilities: ModalityCapabilities | undefined,
): ModalityCapabilities | undefined {
  if (capabilities === undefined) {
    return undefined;
  }
  const next: ModalityCapabilities = {};
  if (capabilities.audio !== undefined) {
    next.audio = capabilities.audio;
  }
  if (capabilities.image !== undefined) {
    next.image = capabilities.image;
  }
  if (capabilities.text !== undefined) {
    next.text = capabilities.text;
  }
  if (capabilities.video !== undefined) {
    next.video = capabilities.video;
  }
  return Object.keys(next).length === 0 ? undefined : next;
}

function modelProfileRecordFromSaveRequest(
  profile: ModelProfileRecord,
  request: ModelProfileSaveRequest,
): ModelProfileRecord {
  return {
    ...profile,
    base_url: request.base_url,
    catalog_model_name: request.catalog_model_name,
    catalog_provider_id: request.catalog_provider_id,
    catalog_provider_name: request.catalog_provider_name,
    codeagent_auth: request.codeagent_auth,
    connect_timeout_seconds: request.connect_timeout_seconds,
    context_window: request.context_window,
    fallback_policy_id: request.fallback_policy_id,
    fallback_priority: request.fallback_priority,
    headers: request.headers,
    is_default: request.is_default,
    maas_auth: request.maas_auth,
    max_tokens: request.max_tokens,
    model: request.model,
    provider: request.provider,
    speech_realtime: request.speech_realtime,
    ssl_verify: request.ssl_verify,
    temperature: request.temperature,
    top_p: request.top_p,
    api_key: request.api_key ?? profile.api_key,
    has_api_key:
      textValue(request.api_key ?? undefined).length > 0
        ? true
        : profile.has_api_key,
    capabilities: request.capabilities ?? profile.capabilities,
  };
}

function newModelProfileDraft(): ModelProfileRecord {
  return {
    base_url: "",
    connect_timeout_seconds: 15,
    context_window: null,
    fallback_policy_id: null,
    fallback_priority: 0,
    is_default: false,
    max_tokens: null,
    model: "",
    provider: "openai_compatible",
    temperature: 0.7,
    top_p: 1,
  };
}

function modelCatalogBaseUrl(provider: ModelCatalogProvider): string {
  const providerApi = provider.api?.trim() ?? "";
  if (providerApi) {
    return providerApi;
  }
  const runtimeProvider = provider.runtime_provider?.trim() ?? "";
  if (runtimeProvider === "anthropic") {
    return "https://api.anthropic.com";
  }
  if (runtimeProvider === "maas") {
    return "http://snapengine.cida.cce.prod-szv-g.dragon.tools.huawei.com/api/v2/";
  }
  if (runtimeProvider === "codeagent") {
    return "https://codeagentcli.rnd.huawei.com/codeAgentPro";
  }
  return "";
}

function catalogStatusText(
  catalog: ModelCatalogResult | undefined,
  t: ReturnType<typeof useTranslations>,
): string {
  if (catalog === undefined) {
    return t("settingsModelCatalogLoading");
  }
  if (!catalog.ok) {
    return catalog.error_message ?? t("settingsModelCatalogFailed");
  }
  const providers = catalog.providers ?? [];
  const modelCount = providers.reduce(
    (total, provider) => total + (provider.models?.length ?? 0),
    0,
  );
  return t("settingsModelCatalogLoaded", {
    models: String(modelCount),
    providers: String(providers.length),
  });
}

function modelCatalogModelMeta(model: ModelCatalogModel): string {
  const parts: string[] = [];
  if (typeof model.context_window === "number") {
    parts.push(`${model.context_window} ctx`);
  }
  if (typeof model.output_limit === "number") {
    parts.push(`${model.output_limit} out`);
  }
  if (model.reasoning === true) {
    parts.push("reasoning");
  }
  if (model.tool_call === true) {
    parts.push("tools");
  }
  return parts.join(" / ") || model.id;
}

function textIncludes(value: string, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return true;
  }
  return value.toLocaleLowerCase().includes(normalizedQuery);
}

function formatModelProbeResult(
  result: ModelConnectivityProbeResult,
  t: ReturnType<typeof useTranslations>,
): string {
  if (result.ok) {
    return t("settingsModelTestPassed", { latency: String(result.latency_ms) });
  }
  return t("settingsModelTestFailedDetail", {
    error: result.error_message ?? result.error_code ?? t("settingsUnknown"),
  });
}

function finiteNumber(value: number | null | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function integerOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function finiteNumberFromText(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumberFromText(value: string | undefined, fallback: number): number {
  const parsed = finiteNumberFromText(value, fallback);
  return parsed > 0 ? parsed : fallback;
}

function nonNegativeIntegerFromText(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Math.max(0, Math.floor(fallback));
}

function positiveIntegerOrNullFromText(value: string | undefined): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  const parsed = Number.parseInt(normalized, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function trimmedStringOrNull(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function optionalBooleanFromText(value: string | undefined): boolean | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return null;
}

function serializeOptionalBoolean(value: boolean | null | undefined): string {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "";
}

interface SettingsListItem {
  detail: string;
  key: string;
  meta: string;
  title: string;
}

interface RoleConfigForm {
  bound_agent_id?: string;
  description?: string;
  memory_enabled?: boolean;
  mode?: string;
  model_profile?: string;
  name?: string;
  role_id?: string;
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

function agentRuntimeSelectOptions(
  runtimes: AgentRuntimeSummary[],
  currentAgentId: string | null | undefined,
): Array<{ label: string; value: string }> {
  const options = runtimes
    .filter((runtime) => runtime.agent_id.trim())
    .map((runtime) => ({
      label: agentRuntimeOptionLabel(runtime),
      value: runtime.agent_id,
    }));
  const current = currentAgentId?.trim() ?? "";
  if (current && options.every((option) => option.value !== current)) {
    return [
      ...options,
      {
        label: current,
        value: current,
      },
    ];
  }
  return options;
}

function agentRuntimeOptionLabel(runtime: AgentRuntimeSummary): string {
  const name = runtime.name?.trim();
  if (name && name !== runtime.agent_id) {
    return `${name} - ${runtime.agent_id}`;
  }
  return runtime.agent_id;
}

function roleConfigListItem(role: RoleConfigSummary): SettingsListItem {
  return {
    detail: roleConfigDetail(role),
    key: role.role_id,
    meta: role.mode?.trim() || role.source?.trim() || "-",
    title: role.name?.trim() || role.role_id,
  };
}

function upsertRoleConfigSummary(
  roles: RoleConfigSummary[],
  document: RoleConfigDocument,
): RoleConfigSummary[] {
  const summary: RoleConfigSummary = {
    bound_agent_id: document.bound_agent_id,
    deletable: document.deletable,
    description: document.description,
    execution_surface: document.execution_surface,
    mode: document.mode,
    model_profile: document.model_profile,
    name: document.name,
    role_id: document.role_id,
    source: document.source,
    version: document.version,
  };
  const existingIndex = roles.findIndex((role) => role.role_id === document.role_id);
  if (existingIndex === -1) {
    return [...roles, summary];
  }
  return roles.map((role, index) => (index === existingIndex ? summary : role));
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
    memory_enabled: document.memory_profile?.enabled === true,
    mode: document.mode ?? "",
    model_profile: document.model_profile ?? "",
    name: document.name ?? "",
    role_id: document.role_id,
    system_prompt: document.system_prompt ?? "",
    version: document.version ?? "",
  };
}

function updateRoleConfigDocument(
  document: RoleConfigDocument,
  values: RoleConfigForm,
): RoleConfigDocument {
  const mode = textValue(values.mode);
  const roleId = textValue(values.role_id);
  return {
    ...document,
    bound_agent_id: nullableText(values.bound_agent_id),
    description: textValue(values.description),
    mode: mode || document.mode,
    model_profile: nullableText(values.model_profile),
    memory_profile: {
      ...(document.memory_profile ?? {}),
      enabled: values.memory_enabled === true,
    },
    name: textValue(values.name),
    role_id: roleId || document.role_id,
    system_prompt: values.system_prompt ?? "",
    version: textValue(values.version),
  };
}

function newRoleConfigDraft(): RoleConfigDocument {
  return {
    bound_agent_id: null,
    description: "",
    file_name: "new-role.md",
    mcp_servers: [],
    memory_profile: {
      enabled: false,
    },
    mode: "primary",
    model_profile: "default",
    name: "",
    role_id: "",
    skills: [],
    source: "app",
    system_prompt: "",
    tools: [],
    version: "1.0.0",
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
