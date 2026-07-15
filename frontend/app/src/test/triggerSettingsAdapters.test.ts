import { describe, expect, it } from "vitest";

import { triggerSettingsScope } from "../features/settings/triggerSettingsAdapters";

describe("triggerSettingsScope", () => {
  it.each([
    [undefined, true, true, "settingsTriggers"],
    ["feishu", true, false, "settingsTriggersFeishu"],
    ["wechat", false, true, "settingsTriggersWeChat"],
  ] as const)(
    "derives the %s connector surface from the typed registry",
    (provider, includeFeishu, includeWechat, titleKey) => {
      expect(triggerSettingsScope(provider)).toEqual({
        includeFeishu,
        includeWechat,
        titleKey,
      });
    },
  );
});
