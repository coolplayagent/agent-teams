import type { TranslationKey } from "../../i18n";

export type TriggerSettingsProvider = "feishu" | "wechat";

export interface TriggerSettingsScope {
  includeFeishu: boolean;
  includeWechat: boolean;
  titleKey: TranslationKey;
}

const TRIGGER_SETTINGS_SCOPES: Readonly<
  Record<TriggerSettingsProvider | "all", TriggerSettingsScope>
> = {
  all: {
    includeFeishu: true,
    includeWechat: true,
    titleKey: "settingsTriggers",
  },
  feishu: {
    includeFeishu: true,
    includeWechat: false,
    titleKey: "settingsTriggersFeishu",
  },
  wechat: {
    includeFeishu: false,
    includeWechat: true,
    titleKey: "settingsTriggersWeChat",
  },
};

export function triggerSettingsScope(
  provider: TriggerSettingsProvider | undefined,
): TriggerSettingsScope {
  return TRIGGER_SETTINGS_SCOPES[provider ?? "all"];
}
