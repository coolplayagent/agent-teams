import {
  App,
  Button,
  Form,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  deleteModelProfile,
  deleteRoleConfig,
  getGeneralConfig,
  getModelCatalog,
  getModelFallbackConfig,
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
  ModelFallbackPolicy,
  ModelProfileRecord,
  ModelProfileSaveRequest,
  JsonValue,
  RoleConfigDocument,
  RoleConfigSummary,
  RoleSkillOption,
} from "../../api/contracts";
import { FormChoiceControl } from "../../components/ChoiceControl";
import { useTranslations } from "../../i18n";
import { useUiStore } from "../../runtime/uiStore";
import { CommandsSettingsSection } from "./CommandsSettingsSection";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";
import { GitHubSettingsSection } from "./GitHubSettingsSection";
import { HooksSettingsSection } from "./HooksSettingsSection";
import { McpSettingsSection } from "./McpSettingsSection";
import { ModelCatalogPicker } from "./ModelCatalogPicker";
import { NotificationSettingsSection } from "./NotificationSettingsSection";
import { OrchestrationSettingsSection } from "./OrchestrationSettingsSection";
import { ProxySettingsSection } from "./ProxySettingsSection";
import {
  AgentRuntimeSettingsSection,
  PluginsSettingsSection,
} from "./RuntimeSettingsSections";
import { SettingsAppearanceSection } from "./SettingsAppearanceSection";
import {
  SettingsFormCard,
  SettingsFormGrid,
  SettingsFormLayout,
  SettingsQueryState,
  SettingsSection,
} from "./SettingsShared";
import { SpeechSettingsSection } from "./SpeechSettingsSection";
import { TriggerSettingsSection } from "./TriggerSettingsSection";
import { WebSettingsSection } from "./WebSettingsSection";
import { WorkspaceSettingsSection } from "./WorkspaceSettingsSection";
import {
  CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS,
  SETTINGS_SECTION_DEFINITIONS,
  isSystemSettingsPage,
  type SettingsSectionKey,
  type SystemSettingsPage,
} from "./settingsNavigation";
import "./ModelProbeStatus.css";
import "./SettingsModelEditor.css";
import "./SettingsRoleEditor.css";

type GeneralRelatedSectionKey = Extract<
  SettingsSectionKey,
  "appearance" | "notifications" | "speech"
>;

interface SettingsCenterProps {
  initialSystemPage?: SystemSettingsPage | null;
  open: boolean;
}

export function SettingsCenter({
  initialSystemPage = null,
  open,
}: SettingsCenterProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [activeSection, setActiveSection] = useState<
    SettingsSectionKey | SystemSettingsPage
  >("appearance");
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
    if (activeSection === "general" && generalQuery.data !== undefined) {
      form.setFieldsValue(generalQuery.data);
    }
  }, [activeSection, generalQuery.data, form]);
  useEffect(() => {
    if (open && initialSystemPage !== null) {
      setActiveSection(initialSystemPage);
    }
  }, [initialSystemPage, open]);

  const sections = useMemo(
    () => SETTINGS_SECTION_DEFINITIONS.map((section) => ({
      key: section.key,
      label: t(section.labelKey),
    })),
    [t],
  );
  const mobileSections = useMemo(() => {
    const options: Array<{
      label: string;
      value: SettingsSectionKey | SystemSettingsPage;
    }> = sections.map((section) => ({
      label: section.label,
      value: section.key,
    }));
    const contextualPage = CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS.find(
      (page) => page.key === activeSection,
    );
    if (contextualPage !== undefined) {
      options.unshift({
        label: t(contextualPage.labelKey),
        value: contextualPage.key,
      });
    }
    return options;
  }, [activeSection, sections, t]);

  return (
    <div className="at-settings-center">
      <nav
        aria-label={t("settingsSections")}
        className="at-settings-nav at-settings-desktop-nav"
      >
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
      <div className="at-settings-mobile-navigation">
        <Select
          aria-label={t("settingsSections")}
          onChange={(section) => setActiveSection(section)}
          options={mobileSections}
          value={activeSection}
        />
      </div>
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
            onNavigate={(section) => setActiveSection(section)}
            onRetry={() => void generalQuery.refetch()}
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
            modelProfiles={modelsQuery.data}
            modelProfilesLoading={modelsQuery.isLoading}
            onRetry={() => void rolesQuery.refetch()}
            roles={rolesQuery.data}
          />
        ) : null}
        {activeSection === "models" ? (
          <SettingsModels
            error={modelsQuery.error}
            loading={modelsQuery.isLoading}
            onRetry={() => void modelsQuery.refetch()}
            profiles={modelsQuery.data}
          />
        ) : null}
        {activeSection === "orchestration" ? (
          <OrchestrationSettingsSection
            config={orchestrationQuery.data}
            error={orchestrationQuery.error}
            loading={orchestrationQuery.isLoading}
            onRetry={() => void orchestrationQuery.refetch()}
            onRoleOptionsRetry={() => void rolesQuery.refetch()}
            roleOptionsError={rolesQuery.error}
            roleOptionsLoading={rolesQuery.isLoading}
            roles={rolesQuery.data}
          />
        ) : null}
        {activeSection === "web" ? <WebSettingsSection /> : null}
        {activeSection === "proxy" ? <ProxySettingsSection /> : null}
        {activeSection === "workspace" ? <WorkspaceSettingsSection /> : null}
        {activeSection === "environment" ? <EnvironmentSettingsSection /> : null}
        {isSystemSettingsPage(activeSection) ? (
          <SystemSettingsPageContent page={activeSection} />
        ) : null}
      </section>
    </div>
  );
}

function SystemSettingsPageContent({ page }: { page: SystemSettingsPage }) {
  switch (page) {
    case "mcp":
      return <McpSettingsSection />;
    case "plugins":
      return <PluginsSettingsSection />;
    case "commands":
      return <CommandsSettingsSection />;
    case "hooks":
      return <HooksSettingsSection />;
    case "agent-runtime":
      return <AgentRuntimeSettingsSection />;
    case "triggers":
      return <TriggerSettingsSection />;
    case "github":
      return <GitHubSettingsSection />;
  }
}

function SettingsGeneral({
  error,
  form,
  loading,
  onNavigate,
  onRetry,
  onSubmit,
  saving,
}: {
  error: Error | null;
  form: FormInstance<GeneralConfig>;
  loading: boolean;
  onNavigate: (section: GeneralRelatedSectionKey) => void;
  onRetry: () => void;
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
      detail: t("settingsAppearanceHelp"),
      key: "appearance",
      title: t("settingsAppearance"),
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
      <SettingsQueryState error={error} loading={loading} onRetry={onRetry} />
      {!loading && error === null ? (
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
                getValueProps={booleanChoiceValueProps}
              >
                <FormChoiceControl
                  ariaLabel={t("settingsShellSafetyPolicy")}
                  kind="switch"
                  label={t("settingsEnabled")}
                />
              </Form.Item>
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
  modelProfiles,
  modelProfilesLoading,
  onRetry,
  roles,
}: {
  error: Error | null;
  loading: boolean;
  modelProfiles: Record<string, ModelProfileRecord> | undefined;
  modelProfilesLoading: boolean;
  onRetry: () => void;
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
  const roleItems = useMemo(
    () => (roleConfigsQuery.data ?? []).map((role) => roleConfigListItem(role)),
    [roleConfigsQuery.data],
  );
  const creatingRoleDocument = useMemo(
    () => newRoleConfigDraft(modelProfiles),
    [creatingRole, modelProfiles],
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
        onRetry={() => {
          onRetry();
          void roleConfigsQuery.refetch();
          void agentRuntimesQuery.refetch();
        }}
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
          roleOptions={roles}
          modelProfiles={modelProfiles}
          modelProfilesLoading={modelProfilesLoading}
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
          onRetry={() => void selectedRoleQuery.refetch()}
          agentRuntimes={agentRuntimesQuery.data ?? []}
          agentRuntimesLoading={agentRuntimesQuery.isLoading}
          roleOptions={roles}
          modelProfiles={modelProfiles}
          modelProfilesLoading={modelProfilesLoading}
          roleId={selectedRoleId}
          saving={saveMutation.isPending}
          summary={selectedRoleSummary}
          validating={validateMutation.isPending}
        />
      ) : !roleConfigsQuery.isLoading && roleConfigsQuery.data !== undefined ? (
        <>
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
  onRetry,
  agentRuntimes,
  agentRuntimesLoading,
  roleOptions,
  modelProfiles,
  modelProfilesLoading,
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
  onRetry?: () => void;
  agentRuntimes: AgentRuntimeSummary[];
  agentRuntimesLoading: boolean;
  roleOptions: Awaited<ReturnType<typeof getRoleConfigOptions>> | undefined;
  modelProfiles: Record<string, ModelProfileRecord> | undefined;
  modelProfilesLoading: boolean;
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
  const registryOptions = roleOptions as
    | (typeof roleOptions & RoleRegistryOptionsView)
    | undefined;
  const boundAgentOptions = useMemo(
    () => agentRuntimeSelectOptions(agentRuntimes, document?.bound_agent_id),
    [agentRuntimes, document?.bound_agent_id],
  );
  const skillOptions = useMemo(
    () => roleSkillSelectOptions(roleOptions?.skills ?? [], document?.skills ?? [], t),
    [document?.skills, roleOptions?.skills, t],
  );
  const toolOptions = useMemo(
    () => roleCapabilitySelectOptions(registryOptions?.tools ?? [], document?.tools ?? [], t),
    [document?.tools, registryOptions?.tools, t],
  );
  const mcpServerOptions = useMemo(
    () => roleCapabilitySelectOptions(
      ["*", ...(registryOptions?.mcp_servers ?? [])],
      document?.mcp_servers ?? [],
      t,
    ),
    [document?.mcp_servers, registryOptions?.mcp_servers, t],
  );
  const modelProfileOptions = useMemo(
    () => roleModelProfileOptions(modelProfiles, document?.model_profile, t),
    [document?.model_profile, modelProfiles, t],
  );
  const modeOptions = useMemo(
    () => roleModeOptions(registryOptions?.role_modes, document?.mode, t),
    [document?.mode, registryOptions?.role_modes, t],
  );
  const executionSurfaceOptions = useMemo(
    () => roleCapabilitySelectOptions(
      registryOptions?.execution_surfaces ?? [],
      document?.execution_surface ? [document.execution_surface] : [],
      t,
    ),
    [document?.execution_surface, registryOptions?.execution_surfaces, t],
  );

  useEffect(() => {
    if (document !== undefined) {
      form.setFieldsValue(roleConfigFormValues(document));
      setSystemPromptPreview(document.system_prompt ?? "");
      setSystemPromptView("edit");
    }
  }, [document, form]);

  const title = document?.name?.trim() || summary?.name?.trim() || roleId;
  return (
    <div className="at-settings-detail-page at-role-config-detail">
      <div className="at-settings-detail-header">
        <div className="at-settings-list-main">
          <span>{title}</span>
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
      <SettingsQueryState error={error} loading={loading} onRetry={onRetry} />
      {document !== undefined ? (
        <>
          <div className="at-settings-facts at-settings-workspace-facts at-role-config-metadata">
            <Fact label={t("settingsRoleSource")} value={document.source ?? "-"} />
            <Fact label={t("settingsRoleFile")} value={document.file_name ?? "-"} />
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
            <SettingsFormLayout>
              <SettingsFormCard>
                <SettingsFormGrid className="at-role-primary-grid">
            <Form.Item
              label={t("settingsRoleId")}
              name="role_id"
              rules={[{ message: t("settingsRoleIdRequired"), required: true }]}
            >
              <Input autoComplete="off" disabled={!creating} />
            </Form.Item>
            <Form.Item
              label={t("settingsRoleName")}
              name="name"
              rules={[{ message: t("settingsRoleNameRequired"), required: true }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              label={t("settingsRoleVersion")}
              name="version"
              rules={[{ message: t("settingsRoleVersionRequired"), required: true }]}
            >
              <Input autoComplete="off" />
            </Form.Item>
            <Form.Item
              className="at-role-description-field"
              label={t("settingsRoleDescription")}
              name="description"
              rules={[{ message: t("settingsRoleDescriptionRequired"), required: true }]}
            >
              <Input.TextArea autoSize={{ minRows: 3, maxRows: 7 }} />
            </Form.Item>
            <Form.Item
              className="at-role-model-field"
              label={t("settingsRoleModelProfile")}
              name="model_profile"
              rules={[{ message: t("settingsRoleModelProfileRequired"), required: true }]}
            >
              <Select
                loading={modelProfilesLoading}
                optionFilterProp="label"
                options={modelProfileOptions}
                showSearch
              />
            </Form.Item>
            <Form.Item
              label={t("settingsRoleMode")}
              name="mode"
              rules={[{ message: t("settingsRoleModeRequired"), required: true }]}
            >
              <Select options={modeOptions} />
            </Form.Item>
                </SettingsFormGrid>
              </SettingsFormCard>
              <SettingsFormCard>
                <SettingsFormGrid className="at-role-capability-grid">
            <Form.Item label={t("settingsMcpToolCount")} name="tools">
              <Select
                mode="multiple"
                optionFilterProp="label"
                options={toolOptions}
                showSearch
              />
            </Form.Item>
            <Form.Item label={t("settingsMcpServers")} name="mcp_servers">
              <Select
                mode="multiple"
                optionFilterProp="label"
                options={mcpServerOptions}
                showSearch
              />
            </Form.Item>
            <Form.Item label={t("settingsSkills")} name="skills">
              <Select
                mode="multiple"
                optionLabelProp="label"
                optionFilterProp="label"
                options={skillOptions}
                tokenSeparators={[",", "\n"]}
              />
            </Form.Item>
                </SettingsFormGrid>
              </SettingsFormCard>
              <details className="at-settings-advanced-disclosure at-role-advanced-disclosure">
                <summary>{t("settingsRoleAdvanced")}</summary>
                <SettingsFormGrid className="at-role-advanced-grid">
                  <Form.Item
                    label={t("settingsRoleExecutionSurface")}
                    name="execution_surface"
                    rules={[{ message: t("settingsRoleExecutionSurfaceRequired"), required: true }]}
                  >
                    <Select
                      optionFilterProp="label"
                      options={executionSurfaceOptions}
                      showSearch
                    />
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
                  <Form.Item
                    className="at-role-memory-field"
                    getValueProps={booleanChoiceValueProps}
                    label={t("settingsRoleMemoryEnabled")}
                    name="memory_enabled"
                  >
                    <FormChoiceControl
                      ariaLabel={t("settingsRoleMemoryEnabled")}
                      kind="switch"
                      label={t("settingsEnabled")}
                    />
                  </Form.Item>
                </SettingsFormGrid>
              </details>
              <SettingsFormCard>
            <Form.Item
              label={t("settingsRoleSystemPrompt")}
            >
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
                  <Form.Item
                    name="system_prompt"
                    noStyle
                    rules={[{ message: t("settingsRoleSystemPromptRequired"), required: true }]}
                  >
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
              </SettingsFormCard>
            </SettingsFormLayout>
          </Form>
        </>
      ) : null}
    </div>
  );
}

function SettingsModels({
  error,
  loading,
  onRetry,
  profiles,
}: {
  error: Error | null;
  loading: boolean;
  onRetry: () => void;
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
  const fallbackQuery = useQuery({
    queryKey: ["settings", "models", "fallback"],
    queryFn: getModelFallbackConfig,
  });
  const fallbackPolicies = fallbackQuery.data?.policies ?? [];
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
        buildModelProfileSaveRequest(profile, {
          isDefault: true,
          providerRequiredMessage: t("settingsModelProviderRequired"),
        }),
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
        providerRequiredMessage: t("settingsModelProviderRequired"),
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
        [profileId]: { result, status: result.ok ? "success" : "error" },
      }));
    },
    onError: (mutationError, profileId) => {
      setProbeStates((current) => ({
        ...current,
        [profileId]: {
          error: safeModelProbeError(
            mutationError instanceof Error
              ? mutationError.message
              : t("settingsModelTestFailed"),
          ),
          status: "error",
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
      [profileId]: { status: "testing" },
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
      <SettingsQueryState error={error} loading={loading} onRetry={onRetry} />
      {!loading && profiles !== undefined ? (
        creatingProfile ? (
          <ModelProfileDetail
            catalog={catalogQuery.data}
            catalogError={catalogQuery.error}
            catalogLoading={catalogQuery.isLoading || refreshCatalogMutation.isPending}
            deleting={false}
            fallbackPolicies={fallbackPolicies}
            fallbackPoliciesLoading={fallbackQuery.isLoading}
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
            fallbackPolicies={fallbackPolicies}
            fallbackPoliciesLoading={fallbackQuery.isLoading}
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
                  const probeState = probeStates[profileId];
                  const probeMessage = modelProbeStateMessage(probeState, t);
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
                      {probeMessage !== null ? (
                        <div
                          aria-live="polite"
                          className={`at-model-profile-row-probe is-${probeState?.status ?? "testing"}`}
                          role="status"
                        >
                          {probeMessage}
                        </div>
                      ) : null}
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
  codeagent_auth_method?: string;
  codeagent_password?: string;
  codeagent_username?: string;
  connect_timeout_seconds?: string;
  context_window?: string;
  fallback_policy_id?: string;
  fallback_priority?: string;
  image_capability?: ImageCapabilityMode;
  is_default?: boolean;
  maas_password?: string;
  maas_username?: string;
  max_tokens?: string;
  model?: string;
  profile_id?: string;
  provider?: string;
  ssl_verify?: string;
  temperature?: string;
  top_p?: string;
}

type ModelProviderAuthKind = "codeagent" | "generic" | "maas";

interface ModelProviderAdapter {
  acceptsGenericApiKey: boolean;
  authKind: ModelProviderAuthKind;
  applyAuth: (
    profile: ModelProfileRecord,
    values: ModelProfileFormValues,
    request: ModelProfileSaveRequest,
  ) => void;
}

const GENERIC_MODEL_PROVIDER_ADAPTER: ModelProviderAdapter = {
  acceptsGenericApiKey: true,
  applyAuth: () => undefined,
  authKind: "generic",
};

const MODEL_PROVIDER_ADAPTERS: Readonly<Record<string, ModelProviderAdapter>> = {
  codeagent: {
    acceptsGenericApiKey: false,
    applyAuth: (profile, values, request) => {
      request.codeagent_auth = modelCodeAgentAuthFromForm(profile.codeagent_auth, values);
    },
    authKind: "codeagent",
  },
  maas: {
    acceptsGenericApiKey: false,
    applyAuth: (profile, values, request) => {
      request.maas_auth = modelMaasAuthFromForm(profile.maas_auth, values);
    },
    authKind: "maas",
  },
};

function modelProviderAdapter(provider: string): ModelProviderAdapter {
  return MODEL_PROVIDER_ADAPTERS[provider] ?? GENERIC_MODEL_PROVIDER_ADAPTER;
}

type ImageCapabilityMode = "follow" | "supported" | "unsupported";

interface ModelProbeState {
  result?: ModelConnectivityProbeResult;
  error?: string;
  status: "error" | "success" | "testing";
}

function ModelProfileDetail({
  catalog,
  catalogError,
  catalogLoading,
  deleting,
  fallbackPolicies,
  fallbackPoliciesLoading,
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
  fallbackPolicies: ModelFallbackPolicy[];
  fallbackPoliciesLoading: boolean;
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
  const [providerOverride, setProviderOverride] = useState<string | null>(null);
  const effectiveProfile =
    catalogProfilePatch !== null ? { ...profile, ...catalogProfilePatch } : profile;
  const probeMessage = modelProbeStateMessage(probeState ?? undefined, t);
  const probeTone =
    probeState?.status === "error"
      ? "is-error"
      : probeState?.status === "success"
        ? "is-ok"
        : "";
  const normalizedProvider = normalizeModelProvider(
    providerOverride ?? effectiveProfile.provider,
  );
  const providerAdapter = modelProviderAdapter(normalizedProvider);
  const showMaasAuth = providerAdapter.authKind === "maas";
  const showCodeAgentAuth = providerAdapter.authKind === "codeagent";
  const showGenericApiKey = providerAdapter.acceptsGenericApiKey;
  const providerOptions = modelProviderOptions(effectiveProfile.provider);
  const fallbackPolicyOptions = modelFallbackPolicyOptions(
    fallbackPolicies,
    effectiveProfile.fallback_policy_id,
  );

  useEffect(() => {
    form.setFieldsValue(modelProfileToFormValues(profileId, profile));
    setCatalogProfilePatch(null);
    setProviderOverride(null);
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
    const nextProvider = provider.runtime_provider?.trim() ?? "";
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
    setProviderOverride(nextProvider);
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

  const updateFormDerivedState = (
    changedValues: Partial<ModelProfileFormValues>,
  ) => {
    if ("provider" in changedValues) {
      setProviderOverride(changedValues.provider ?? null);
    }
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
        onValuesChange={updateFormDerivedState}
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
            className="at-model-field-short"
            label={t("settingsModelProfileId")}
            name="profile_id"
            rules={[{ message: t("settingsModelProfileIdRequired"), required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            className="at-model-field-short"
            label={t("settingsModelProvider")}
            name="provider"
            rules={[{ message: t("settingsModelProviderRequired"), required: true }]}
          >
            <Select
              onChange={(value) => setProviderOverride(value)}
              optionFilterProp="label"
              options={providerOptions}
              showSearch
            />
          </Form.Item>
          <Form.Item
            className="at-model-field-wide"
            label={t("settingsModelName")}
            name="model"
            rules={[{ message: t("settingsModelNameRequired"), required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item
            className="at-model-field-wide"
            label={t("settingsModelBaseUrl")}
            name="base_url"
            rules={[{ message: t("settingsModelBaseUrlRequired"), required: true }]}
          >
            <Input />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelTemperature")} name="temperature">
            <Input inputMode="decimal" type="number" />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelTopP")} name="top_p">
            <Input inputMode="decimal" type="number" />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelContextWindow")} name="context_window">
            <Input inputMode="numeric" type="number" />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelMaxTokens")} name="max_tokens">
            <Input inputMode="numeric" type="number" />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelTimeoutSeconds")} name="connect_timeout_seconds">
            <Input inputMode="decimal" type="number" />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelSslVerify")} name="ssl_verify">
            <Select
              options={[
                { label: t("settingsProxySslInherit"), value: "" },
                { label: t("settingsProxySslVerifyOption"), value: "true" },
                { label: t("settingsProxySslSkipOption"), value: "false" },
              ]}
            />
          </Form.Item>
          {showGenericApiKey ? (
            <Form.Item className="at-model-field-wide" label={t("settingsModelApiKey")} name="api_key">
              <Input.Password
                autoComplete="new-password"
                placeholder={
                  modelProfileHasApiKey(profile)
                    ? t("settingsModelApiKeyPreserved")
                    : t("settingsModelApiKeyPlaceholder")
                }
              />
            </Form.Item>
          ) : null}
          {showMaasAuth ? (
            <>
              <Form.Item className="at-model-field-short" label={t("settingsModelMaasUsername")} name="maas_username">
                <Input autoComplete="username" />
              </Form.Item>
              <Form.Item className="at-model-field-wide" label={t("settingsModelMaasPassword")} name="maas_password">
                <Input.Password
                  autoComplete="new-password"
                  placeholder={
                    modelProfileHasPassword(profile.maas_auth)
                      ? t("settingsModelPasswordPreserved")
                      : t("settingsModelPasswordPlaceholder")
                  }
                />
              </Form.Item>
            </>
          ) : null}
          {showCodeAgentAuth ? (
            <>
              <Form.Item
                label={t("settingsModelCodeAgentAuthMethod")}
                name="codeagent_auth_method"
              >
                <Select
                  options={[
                    {
                      label: t("settingsModelCodeAgentAuthMethodSso"),
                      value: "sso",
                    },
                    {
                      label: t("settingsModelCodeAgentAuthMethodPassword"),
                      value: "password",
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                label={t("settingsModelCodeAgentUsername")}
                name="codeagent_username"
              >
                <Input autoComplete="username" />
              </Form.Item>
              <Form.Item
                label={t("settingsModelCodeAgentPassword")}
                name="codeagent_password"
              >
                <Input.Password
                  autoComplete="new-password"
                  placeholder={
                    modelProfileHasPassword(profile.codeagent_auth)
                      ? t("settingsModelPasswordPreserved")
                      : t("settingsModelPasswordPlaceholder")
                  }
                />
              </Form.Item>
            </>
          ) : null}
          <Form.Item className="at-model-field-short" label={t("settingsModelImageCapability")} name="image_capability">
            <Select
              options={[
                { label: t("settingsModelImageCapabilityFollow"), value: "follow" },
                {
                  label: t("settingsModelImageCapabilitySupported"),
                  value: "supported",
                },
                {
                  label: t("settingsModelImageCapabilityUnsupported"),
                  value: "unsupported",
                },
              ]}
            />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelFallbackPolicy")} name="fallback_policy_id">
            <Select
              allowClear
              loading={fallbackPoliciesLoading}
              optionFilterProp="label"
              options={fallbackPolicyOptions}
              showSearch
            />
          </Form.Item>
          <Form.Item className="at-model-field-short" label={t("settingsModelFallbackPriority")} name="fallback_priority">
            <Input inputMode="numeric" type="number" />
          </Form.Item>
          <Form.Item
            className="at-model-profile-switch-field"
            getValueProps={booleanChoiceValueProps}
            name="is_default"
          >
            <FormChoiceControl
              kind="switch"
              label={t("settingsModelDefault")}
            />
          </Form.Item>
        </div>
      </Form>
    </div>
  );
}

function buildModelProfileSaveRequest(
  profile: ModelProfileRecord,
  options: {
    isDefault?: boolean;
    providerRequiredMessage: string;
    sourceName?: string;
    values?: ModelProfileFormValues;
  },
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
    provider: requiredModelProvider(
      values?.provider ?? profile.provider,
      options.providerRequiredMessage,
    ),
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
    const provider = normalizeModelProvider(values.provider ?? profile.provider);
    const providerAdapter = modelProviderAdapter(provider);
    if (apiKey.length > 0 && providerAdapter.acceptsGenericApiKey) {
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
    providerAdapter.applyAuth(profile, values, request);
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
  if (values === undefined && profile.maas_auth !== undefined) {
    request.maas_auth = profile.maas_auth;
  }
  if (values === undefined && profile.codeagent_auth !== undefined) {
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
    codeagent_auth_method: stringFromJsonObject(profile.codeagent_auth, "auth_method") || "sso",
    codeagent_password: "",
    codeagent_username: stringFromJsonObject(profile.codeagent_auth, "username"),
    image_capability: imageCapabilityMode(profile.capabilities),
    maas_password: "",
    maas_username: stringFromJsonObject(profile.maas_auth, "username"),
    profile_id: profileId,
    provider: profile.provider?.trim() ?? "",
    ssl_verify: serializeOptionalBoolean(profile.ssl_verify),
    temperature: String(finiteNumber(profile.temperature, 0.7)),
    top_p: String(finiteNumber(profile.top_p, 1)),
  };
}

function modelProfileHasApiKey(profile: ModelProfileRecord): boolean {
  return profile.has_api_key === true || textValue(profile.api_key ?? undefined).length > 0;
}

function modelProfileHasPassword(auth: JsonValue | null | undefined): boolean {
  const authObject = jsonObject(auth);
  if (authObject === null) {
    return false;
  }
  return authObject.has_password === true;
}

function modelMaasAuthFromForm(
  previousAuth: JsonValue | null | undefined,
  values: ModelProfileFormValues,
): JsonValue {
  const auth: { [key: string]: JsonValue } = {
    auth_source: "profile",
  };
  const username = trimmedStringOrNull(values.maas_username);
  const password = textValue(values.maas_password);
  if (username !== null) {
    auth.username = username;
  }
  if (password.length > 0) {
    auth.password = password;
  }
  if (password.length === 0 && modelProfileHasPassword(previousAuth)) {
    auth.has_password = true;
  }
  return auth;
}

function modelCodeAgentAuthFromForm(
  previousAuth: JsonValue | null | undefined,
  values: ModelProfileFormValues,
): JsonValue {
  const authMethod = values.codeagent_auth_method === "password" ? "password" : "sso";
  const auth: { [key: string]: JsonValue } = {
    auth_method: authMethod,
    auth_source: "profile",
  };
  const username = trimmedStringOrNull(values.codeagent_username);
  const password = textValue(values.codeagent_password);
  if (username !== null) {
    auth.username = username;
  }
  if (authMethod === "password" && password.length > 0) {
    auth.password = password;
  }
  if (authMethod === "password" && password.length === 0 && modelProfileHasPassword(previousAuth)) {
    auth.has_password = true;
  }
  return auth;
}

function stringFromJsonObject(
  auth: JsonValue | null | undefined,
  key: string,
): string {
  const authObject = jsonObject(auth);
  if (authObject === null) {
    return "";
  }
  return jsonString(authObject[key]);
}

function jsonObject(value: JsonValue | null | undefined): { [key: string]: JsonValue } | null {
  if (value === null || value === undefined || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}

function normalizeModelProvider(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function requiredModelProvider(
  value: string | null | undefined,
  errorMessage: string,
): string {
  const provider = value?.trim() ?? "";
  if (!provider) {
    throw new Error(errorMessage);
  }
  return provider;
}

const MODEL_PROVIDER_OPTIONS = [
  "openai_compatible",
  "anthropic",
  "bigmodel",
  "minimax",
  "maas",
  "codeagent",
  "echo",
];

function modelProviderOptions(currentProvider: string | undefined): Array<{
  label: string;
  value: string;
}> {
  const normalizedCurrent = normalizeModelProvider(currentProvider);
  const providers = new Set(MODEL_PROVIDER_OPTIONS);
  if (normalizedCurrent) {
    providers.add(normalizedCurrent);
  }
  return [...providers].map((provider) => ({
    label: provider,
    value: provider,
  }));
}

function modelFallbackPolicyOptions(
  policies: ModelFallbackPolicy[],
  currentPolicyId: string | null | undefined,
): Array<{ label: string; value: string }> {
  const options = policies
    .filter((policy) => policy.enabled !== false && policy.policy_id.trim())
    .map((policy) => ({
      label:
        policy.name.trim() && policy.name.trim() !== policy.policy_id
          ? `${policy.name} (${policy.policy_id})`
          : policy.policy_id,
      value: policy.policy_id,
    }));
  const current = currentPolicyId?.trim() ?? "";
  if (current && options.every((option) => option.value !== current)) {
    options.push({ label: current, value: current });
  }
  return options;
}

function jsonString(value: JsonValue | undefined): string {
  return typeof value === "string" ? value : "";
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
    provider: "",
    temperature: 0.7,
    top_p: 1,
  };
}

function modelCatalogBaseUrl(provider: ModelCatalogProvider): string {
  return provider.default_base_url?.trim() || provider.api?.trim() || "";
}

function formatModelProbeResult(
  result: ModelConnectivityProbeResult,
  t: ReturnType<typeof useTranslations>,
): string {
  if (result.ok) {
    return t("settingsModelTestPassed", { latency: String(result.latency_ms) });
  }
  return t("settingsModelTestFailedDetail", {
    error: safeModelProbeError(
      result.error_message ?? result.error_code ?? t("settingsUnknown"),
    ),
  });
}

function modelProbeStateMessage(
  state: ModelProbeState | undefined,
  t: ReturnType<typeof useTranslations>,
): string | null {
  if (state === undefined) {
    return null;
  }
  if (state.status === "testing") {
    return t("settingsModelTestRunning");
  }
  if (state.error !== undefined) {
    return state.error;
  }
  return state.result !== undefined ? formatModelProbeResult(state.result, t) : null;
}

function safeModelProbeError(message: string): string {
  return message
    .replace(/\b(Bearer)\s+\S+/gi, "$1 [redacted]")
    .replace(
      /\b(api[ _-]?key|token|secret|password)\b(\s*[:=]\s*)\S+/gi,
      "$1$2[redacted]",
    );
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
  execution_surface?: string;
  memory_enabled?: boolean;
  mcp_servers?: string[];
  mode?: string;
  model_profile?: string;
  name?: string;
  role_id?: string;
  skills?: string[];
  system_prompt?: string;
  tools?: string[];
  version?: string;
}

interface RoleRegistryOptionsView {
  execution_surfaces?: string[];
  mcp_servers?: string[];
  role_modes?: string[];
  tools?: string[];
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
            {item.meta ? (
              <Typography.Text className="at-settings-list-meta" ellipsis title={item.meta}>
                {item.meta}
              </Typography.Text>
            ) : null}
          </>
        );
        if (onSelect !== undefined) {
          return (
            <button
              className={
                item.meta
                  ? "at-settings-list-button at-settings-list-row"
                  : "at-settings-list-button at-settings-list-row is-single-column"
              }
              key={item.key}
              onClick={() => onSelect(item)}
              type="button"
            >
              {content}
            </button>
          );
        }
        return (
          <div
            className={
              item.meta
                ? "at-settings-list-row"
                : "at-settings-list-row is-single-column"
            }
            key={item.key}
          >
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
    execution_surface: document.execution_surface ?? "",
    memory_enabled: document.memory_profile?.enabled === true,
    mcp_servers: normalizeStringList(document.mcp_servers ?? []),
    mode: document.mode ?? "",
    model_profile: document.model_profile ?? "",
    name: document.name ?? "",
    role_id: document.role_id,
    skills: normalizeStringList(document.skills ?? []),
    system_prompt: document.system_prompt ?? "",
    tools: normalizeStringList(document.tools ?? []),
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
    execution_surface: nullableText(values.execution_surface),
    mcp_servers: normalizeStringList(values.mcp_servers ?? []),
    mode: mode || document.mode,
    model_profile: nullableText(values.model_profile),
    memory_profile: {
      ...(document.memory_profile ?? {}),
      enabled: values.memory_enabled === true,
    },
    name: textValue(values.name),
    role_id: roleId || document.role_id,
    skills: normalizeStringList(values.skills ?? []),
    system_prompt: values.system_prompt ?? "",
    tools: normalizeStringList(values.tools ?? []),
    version: textValue(values.version),
  };
}

function newRoleConfigDraft(
  modelProfiles: Record<string, ModelProfileRecord> | undefined,
): RoleConfigDocument {
  return {
    bound_agent_id: null,
    description: "",
    execution_surface: "api",
    file_name: "new-role.md",
    mcp_servers: [],
    memory_profile: {
      enabled: false,
    },
    mode: "primary",
    model_profile: defaultModelProfileId(modelProfiles),
    name: "",
    role_id: "",
    skills: [],
    source: "app",
    system_prompt: "",
    tools: [],
    version: "1.0.0",
  };
}

function defaultModelProfileId(
  modelProfiles: Record<string, ModelProfileRecord> | undefined,
): string | null {
  const defaultProfileIds = Object.entries(modelProfiles ?? {})
    .filter(([profileId, profile]) => profileId.trim() && profile.is_default === true)
    .map(([profileId]) => profileId);
  return defaultProfileIds.length === 1 ? defaultProfileIds[0] ?? null : null;
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

function booleanChoiceValueProps(value: boolean | undefined): { checked: boolean } {
  return { checked: value === true };
}

function modalityList(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(", ");
}

function normalizeStringList(values: string[]): string[] {
  return Array.from(
    new Set(values.map((value) => value.trim()).filter(Boolean)),
  );
}

function roleSkillSelectOptions(
  skills: RoleSkillOption[],
  selectedSkills: string[],
  t: ReturnType<typeof useTranslations>,
): Array<{ label: string; value: string }> {
  const options = skills
    .filter((skill) => skill.ref.trim())
    .map((skill) => ({
      label: roleSkillLabel(skill),
      value: skill.ref,
    }));
  const optionRefs = new Set(options.map((option) => option.value));
  for (const selectedSkill of normalizeStringList(selectedSkills)) {
    if (!optionRefs.has(selectedSkill)) {
      options.push({
        label: t("settingsRolePersistedUnknownOption", { value: selectedSkill }),
        value: selectedSkill,
      });
    }
  }
  return options;
}

function roleModelProfileOptions(
  profiles: Record<string, ModelProfileRecord> | undefined,
  currentProfile: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
): Array<{ label: string; value: string }> {
  const options = Object.keys(profiles ?? {})
    .filter((profileId) => profileId.trim())
    .sort((left, right) => left.localeCompare(right))
    .map((profileId) => ({ label: profileId, value: profileId }));
  const current = currentProfile?.trim() ?? "";
  if (current && options.every((option) => option.value !== current)) {
    options.push({
      label: t("settingsRolePersistedUnknownOption", { value: current }),
      value: current,
    });
  }
  return options;
}

function roleModeOptions(
  availableModes: string[] | undefined,
  currentMode: string | null | undefined,
  t: ReturnType<typeof useTranslations>,
): Array<{ label: string; value: string }> {
  const labels = new Map([
    ["primary", t("settingsRoleModePrimary")],
    ["subagent", t("settingsRoleModeSubagent")],
    ["all", t("settingsRoleModeAll")],
  ]);
  const modes = availableModes?.length ? availableModes : ["primary", "subagent", "all"];
  const options = normalizeStringList(modes).map((mode) => ({
    label: labels.get(mode) ?? mode,
    value: mode,
  }));
  const current = currentMode?.trim() ?? "";
  if (current && options.every((option) => option.value !== current)) {
    options.push({
      label: t("settingsRolePersistedUnknownOption", { value: current }),
      value: current,
    });
  }
  return options;
}

function roleCapabilitySelectOptions(
  availableValues: string[],
  selectedValues: string[],
  t: ReturnType<typeof useTranslations>,
): Array<{ label: string; value: string }> {
  const values = normalizeStringList(availableValues);
  const options = values.map((value) => ({ label: value, value }));
  const available = new Set(values);
  for (const selected of normalizeStringList(selectedValues)) {
    if (!available.has(selected)) {
      options.push({
        label: t("settingsRolePersistedUnknownOption", { value: selected }),
        value: selected,
      });
    }
  }
  return options;
}

function roleSkillLabel(skill: RoleSkillOption): string {
  const name = skill.name.trim() || skill.ref;
  const source = skill.source?.trim();
  if (source && source !== skill.ref && source !== name) {
    return `${name} (${source})`;
  }
  return name;
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
