import type { TranslationKey } from "../../i18n";

export const SETTINGS_SECTION_DEFINITIONS = [
  { key: "appearance", labelKey: "settingsAppearance" },
  { key: "general", labelKey: "settingsGeneral" },
  { key: "speech", labelKey: "settingsSpeech" },
  { key: "notifications", labelKey: "settingsNotifications" },
  { key: "models", labelKey: "settingsModels" },
  { key: "mcp", labelKey: "settingsMcp" },
  { key: "plugins", labelKey: "settingsPlugins" },
  { key: "commands", labelKey: "settingsCommands" },
  { key: "hooks", labelKey: "settingsHooks" },
  { key: "agent-runtime", labelKey: "settingsAgentRuntime" },
  { key: "roles", labelKey: "settingsRoles" },
  { key: "orchestration", labelKey: "settingsOrchestration" },
  { key: "web", labelKey: "settingsWeb" },
  { key: "proxy", labelKey: "settingsProxy" },
  { key: "workspace", labelKey: "settingsWorkspace" },
  { key: "environment", labelKey: "settingsEnvironment" },
] as const satisfies ReadonlyArray<{
  key: string;
  labelKey: TranslationKey;
}>;

export type SettingsSectionKey =
  (typeof SETTINGS_SECTION_DEFINITIONS)[number]["key"];

/**
 * Infrastructure pages that belong to the settings navigation itself.
 * Keep this list key-only so their labels and order have a single source of
 * truth in SETTINGS_SECTION_DEFINITIONS.
 */
export const INFRASTRUCTURE_SETTINGS_SECTION_KEYS = [
  "mcp",
  "plugins",
  "commands",
  "hooks",
  "agent-runtime",
] as const satisfies ReadonlyArray<SettingsSectionKey>;

/**
 * Settings pages reached from a product-specific context, rather than a
 * duplicate item in the settings navigation. GitHub is opened from Connectors
 * or Automation; gateway configuration is opened from Connectors.
 */
export const CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS = [
  { key: "github", labelKey: "settingsGitHub" },
  { key: "triggers", labelKey: "settingsTriggers" },
] as const satisfies ReadonlyArray<{
  key: string;
  labelKey: TranslationKey;
}>;

export const CONTEXTUAL_SETTINGS_PAGE_KEYS =
  CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS.map((page) => page.key);

export type SystemSettingsPage =
  | (typeof INFRASTRUCTURE_SETTINGS_SECTION_KEYS)[number]
  | (typeof CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS)[number]["key"];

export function isSystemSettingsPage(key: string): key is SystemSettingsPage {
  return (
    INFRASTRUCTURE_SETTINGS_SECTION_KEYS.some((pageKey) => pageKey === key) ||
    CONTEXTUAL_SETTINGS_PAGE_DEFINITIONS.some((page) => page.key === key)
  );
}

export const LEGACY_SETTINGS_TAB_DEFINITIONS = [
  { key: "appearance", label: "Appearance", section: "appearance" },
  { key: "general", label: "General", section: "general" },
  { key: "model", label: "Model", section: "models" },
  { key: "mcp", label: "MCP", section: "mcp" },
  { key: "plugins", label: "Plugins", section: "plugins" },
  { key: "commands", label: "Commands", section: "commands" },
  { key: "hooks", label: "Hooks", section: "hooks" },
  { key: "agents", label: "Agent Runtime", section: "agent-runtime" },
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
