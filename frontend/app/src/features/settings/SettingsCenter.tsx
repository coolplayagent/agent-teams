import {
  App,
  Button,
  Form,
  Segmented,
  Switch,
  Typography,
} from "antd";
import type { FormInstance } from "antd";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import {
  getGeneralConfig,
  getHealth,
  getModelProfiles,
  getOrchestrationConfig,
  getRoleConfigOptions,
  saveGeneralConfig,
} from "../../api/client";
import type {
  GeneralConfig,
  JsonValue,
  ModalityCapabilities,
  ModelProfileRecord,
  OrchestrationPreset,
  RoleOption,
} from "../../api/contracts";
import { useTranslations } from "../../i18n";
import { useUiStore, type Language } from "../../runtime/uiStore";
import { EnvironmentSettingsSection } from "./EnvironmentSettingsSection";
import { NotificationSettingsSection } from "./NotificationSettingsSection";
import { ProxySettingsSection } from "./ProxySettingsSection";
import { SettingsQueryState, SettingsSection } from "./SettingsShared";
import { SpeechSettingsSection } from "./SpeechSettingsSection";
import { WebSettingsSection } from "./WebSettingsSection";
import { WorkspaceSettingsSection } from "./WorkspaceSettingsSection";

type SettingsSection =
  | "appearance"
  | "environment"
  | "general"
  | "notifications"
  | "roles"
  | "models"
  | "orchestration"
  | "proxy"
  | "speech"
  | "system"
  | "web"
  | "workspace";

interface SettingsCenterProps {
  open: boolean;
}

export function SettingsCenter({ open }: SettingsCenterProps) {
  const { message } = App.useApp();
  const queryClient = useQueryClient();
  const t = useTranslations();
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [form] = Form.useForm<GeneralConfig>();
  const themeMode = useUiStore((state) => state.themeMode);
  const language = useUiStore((state) => state.language);
  const setThemeMode = useUiStore((state) => state.setThemeMode);
  const setLanguage = useUiStore((state) => state.setLanguage);

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
  const healthQuery = useQuery({
    queryKey: ["server-health"],
    queryFn: getHealth,
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
          <SettingsAppearance
            language={language}
            setLanguage={setLanguage}
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
        {activeSection === "proxy" ? <ProxySettingsSection /> : null}
        {activeSection === "workspace" ? <WorkspaceSettingsSection /> : null}
        {activeSection === "environment" ? <EnvironmentSettingsSection /> : null}
        {activeSection === "system" ? (
          <SettingsSystem
            error={healthQuery.error}
            health={healthQuery.data}
            loading={healthQuery.isLoading}
          />
        ) : null}
      </section>
    </div>
  );
}

function SettingsAppearance({
  language,
  setLanguage,
  setThemeMode,
  themeMode,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
  setThemeMode: (themeMode: "dark" | "light") => void;
  themeMode: "dark" | "light";
}) {
  const t = useTranslations();
  return (
    <SettingsSection title={t("settingsAppearance")}>
      <div className="at-settings-field-row">
        <span>{t("settingsTheme")}</span>
        <Segmented
          onChange={(value) => setThemeMode(value as "dark" | "light")}
          options={[
            { label: t("settingsThemeLight"), value: "light" },
            { label: t("settingsThemeDark"), value: "dark" },
          ]}
          value={themeMode}
        />
      </div>
      <div className="at-settings-field-row">
        <span>{t("settingsLanguage")}</span>
        <Segmented
          onChange={(value) => setLanguage(value as Language)}
          options={[
            { label: t("languageEnglish"), value: "en" },
            { label: t("languageChinese"), value: "zh-CN" },
          ]}
          value={language}
        />
      </div>
    </SettingsSection>
  );
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
  const t = useTranslations();
  const normalRoles = roles?.normal_mode_roles ?? [];
  const subagentRoles = roles?.subagent_roles ?? [];
  return (
    <SettingsSection title={t("settingsRoles")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && roles !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsCoordinator")} value={roleName(roles.coordinator_role)} />
            <Fact label={t("settingsMainAgent")} value={roleName(roles.main_agent_role)} />
            <Fact label={t("settingsNormalRoles")} value={String(normalRoles.length)} />
            <Fact label={t("settingsSubagentRoles")} value={String(subagentRoles.length)} />
          </div>
          <SettingsList
            emptyText={t("settingsNoRoles")}
            items={[...normalRoles, ...subagentRoles].map((role) => ({
              detail: roleDetail(role),
              key: role.role_id,
              meta: role.role_id,
              title: role.name || role.role_id,
            }))}
          />
        </>
      ) : null}
    </SettingsSection>
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
  const t = useTranslations();
  const entries = Object.entries(profiles ?? {});
  return (
    <SettingsSection title={t("settingsModels")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && profiles !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsProfileCount")} value={String(entries.length)} />
            <Fact label={t("settingsDefaultProfile")} value={defaultProfile(entries)} />
          </div>
          <SettingsList
            emptyText={t("settingsNoModelProfiles")}
            items={entries.map(([profileId, profile]) => ({
              detail: modelProfileDetail(profile),
              key: profileId,
              meta: profile.provider ?? t("settingsProviderUnknown"),
              title: profileId,
            }))}
          />
        </>
      ) : null}
    </SettingsSection>
  );
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
  const t = useTranslations();
  const presets = config?.presets ?? [];
  return (
    <SettingsSection title={t("settingsOrchestration")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && config !== undefined ? (
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
          />
        </>
      ) : null}
    </SettingsSection>
  );
}

function SettingsSystem({
  error,
  health,
  loading,
}: {
  error: Error | null;
  health: Awaited<ReturnType<typeof getHealth>> | undefined;
  loading: boolean;
}) {
  const t = useTranslations();
  const components = Object.entries(health?.components ?? {});
  return (
    <SettingsSection title={t("settingsSystem")}>
      <SettingsQueryState error={error} loading={loading} />
      {!loading && health !== undefined ? (
        <>
          <div className="at-settings-facts">
            <Fact label={t("settingsServerStatus")} value={health.status ?? "-"} />
            <Fact label={t("settingsVersion")} value={health.version ?? "-"} />
            <Fact label={t("settingsComponents")} value={String(components.length)} />
          </div>
          <SettingsList
            emptyText={t("settingsNoComponents")}
            items={components.map(([name, value]) => ({
              detail: jsonSummary(value),
              key: name,
              meta: t("settingsComponent"),
              title: name,
            }))}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}

function SettingsList({
  emptyText,
  items,
}: {
  emptyText: string;
  items: Array<{
    detail: string;
    key: string;
    meta: string;
    title: string;
  }>;
}) {
  if (items.length === 0) {
    return <div className="at-settings-empty">{emptyText}</div>;
  }
  return (
    <div className="at-settings-list">
      {items.map((item) => (
        <div className="at-settings-list-row" key={item.key}>
          <div className="at-settings-list-main">
            <span>{item.title}</span>
            <Typography.Text ellipsis title={item.detail}>
              {item.detail}
            </Typography.Text>
          </div>
          <Typography.Text className="at-settings-list-meta" ellipsis title={item.meta}>
            {item.meta}
          </Typography.Text>
        </div>
      ))}
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

function roleDetail(role: RoleOption): string {
  return [
    role.model_profile?.trim() || "",
    role.model_name?.trim() || "",
    modalityList(role.input_modalities ?? []),
  ].filter(Boolean).join(" · ") || "-";
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

function jsonSummary(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  const entries = Object.entries(value);
  return entries
    .slice(0, 4)
    .map(([key, entry]) => `${key}: ${jsonScalar(entry)}`)
    .join(", ") || "{}";
}

function jsonScalar(value: JsonValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `${value.length} items`;
  }
  return "{...}";
}
