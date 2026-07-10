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

export const V1_LEGACY_SETTINGS_TAB_DEFINITIONS = [
  { key: "appearance", label: "Appearance", v2Section: "appearance" },
  { key: "general", label: "General", v2Section: "general" },
  { key: "model", label: "Model", v2Section: "models" },
  { key: "mcp", label: "MCP", v2SystemPage: "mcp" },
  { key: "plugins", label: "Plugins", v2SystemPage: "plugins" },
  { key: "commands", label: "Commands", v2SystemPage: "commands" },
  { key: "hooks", label: "Hooks", v2SystemPage: "hooks" },
  { key: "agents", label: "Agent Runtime", v2SystemPage: "agent-runtime" },
  { key: "roles", label: "Roles", v2Section: "roles" },
  {
    key: "orchestration",
    label: "Orchestration",
    v2Section: "orchestration",
  },
  { key: "web", label: "Web", v2Section: "web" },
  { key: "proxy", label: "Proxy", v2Section: "proxy" },
  {
    key: "workspace",
    label: "Remote Workspace",
    v2Section: "workspace",
  },
  {
    key: "environment",
    label: "Environment",
    v2Section: "environment",
  },
] as const;

export function isSystemSettingsPage(key: string): key is SystemSettingsPage {
  return SYSTEM_SETTINGS_PAGE_DEFINITIONS.some((page) => page.key === key);
}
