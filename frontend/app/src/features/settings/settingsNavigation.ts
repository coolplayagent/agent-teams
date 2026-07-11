import type { TranslationKey } from "../../i18n";

export const SETTINGS_SECTION_DEFINITIONS = [
  { key: "appearance", labelKey: "settingsAppearance" },
  { key: "general", labelKey: "settingsGeneral" },
  { key: "speech", labelKey: "settingsSpeech" },
  { key: "notifications", labelKey: "settingsNotifications" },
  { key: "models", labelKey: "settingsModels" },
  { key: "roles", labelKey: "settingsRoles" },
  { key: "orchestration", labelKey: "settingsOrchestration" },
  { key: "web", labelKey: "settingsWeb" },
  { key: "clawhub", labelKey: "settingsClawHub" },
  { key: "proxy", labelKey: "settingsProxy" },
  { key: "workspace", labelKey: "settingsWorkspace" },
  { key: "environment", labelKey: "settingsEnvironment" },
  { key: "system", labelKey: "settingsSystem" },
] as const satisfies ReadonlyArray<{
  key: string;
  labelKey: TranslationKey;
}>;

export type SettingsSectionKey =
  (typeof SETTINGS_SECTION_DEFINITIONS)[number]["key"];

export const SYSTEM_SETTINGS_PAGE_DEFINITIONS = [
  {
    detailKey: "settingsSystemMcpDetail",
    key: "mcp",
    labelKey: "settingsMcp",
  },
  {
    detailKey: "settingsSystemPluginsDetail",
    key: "plugins",
    labelKey: "settingsPlugins",
  },
  {
    detailKey: "settingsSystemCommandsDetail",
    key: "commands",
    labelKey: "settingsCommands",
  },
  {
    detailKey: "settingsSystemHooksDetail",
    key: "hooks",
    labelKey: "settingsHooks",
  },
  {
    detailKey: "settingsSystemAgentRuntimeDetail",
    key: "agent-runtime",
    labelKey: "settingsAgentRuntime",
  },
  {
    detailKey: "settingsSystemGitHubDetail",
    key: "github",
    labelKey: "settingsGitHub",
  },
  {
    detailKey: "settingsSystemTriggersDetail",
    key: "triggers",
    labelKey: "settingsTriggers",
  },
] as const satisfies ReadonlyArray<{
  detailKey: TranslationKey;
  key: string;
  labelKey: TranslationKey;
}>;

export type SystemSettingsPage =
  (typeof SYSTEM_SETTINGS_PAGE_DEFINITIONS)[number]["key"];

export const LEGACY_SETTINGS_TAB_DEFINITIONS = [
  { key: "appearance", label: "Appearance", section: "appearance" },
  { key: "general", label: "General", section: "general" },
  { key: "model", label: "Model", section: "models" },
  { key: "mcp", label: "MCP", systemPage: "mcp" },
  { key: "plugins", label: "Plugins", systemPage: "plugins" },
  { key: "commands", label: "Commands", systemPage: "commands" },
  { key: "hooks", label: "Hooks", systemPage: "hooks" },
  { key: "agents", label: "Agent Runtime", systemPage: "agent-runtime" },
  { key: "roles", label: "Roles", section: "roles" },
  {
    key: "orchestration",
    label: "Orchestration",
    section: "orchestration",
  },
  { key: "web", label: "Web", section: "web" },
  { key: "proxy", label: "Proxy", section: "proxy" },
  {
    key: "workspace",
    label: "Remote Workspace",
    section: "workspace",
  },
  {
    key: "environment",
    label: "Environment",
    section: "environment",
  },
] as const;

export function isSystemSettingsPage(key: string): key is SystemSettingsPage {
  return SYSTEM_SETTINGS_PAGE_DEFINITIONS.some((page) => page.key === key);
}
