import { describe, expect, it } from "vitest";

import { translate } from "../i18n";

describe("i18n", () => {
  it("translates core shell copy between English and Chinese", () => {
    expect(translate("en", "composerPromptPlaceholder")).toBe(
      "What would you like the agents to do?",
    );
    expect(translate("zh-CN", "composerPromptPlaceholder")).toBe(
      "你希望这些代理帮你做什么？",
    );
    expect(translate("en", "sidebarBackendChecking")).toBe("Checking backend...");
    expect(translate("zh-CN", "sidebarBackendChecking")).toBe("正在检查后端...");
    expect(translate("en", "languageEnglish")).toBe("EN");
    expect(translate("zh-CN", "languageChinese")).toBe("中文");
  });

  it("keeps readable Chinese labels for model and account authentication", () => {
    expect(translate("zh-CN", "connectorsAuthUsernamePassword")).toBe("用户名/密码");
    expect(translate("zh-CN", "settingsModelProvider")).toBe("提供方");
    expect(translate("zh-CN", "settingsModelName")).toBe("模型");
    expect(translate("zh-CN", "settingsModelApiKeyPlaceholder")).toBe(
      "可选的模型提供方 API Key",
    );
  });

  it("interpolates translated status messages", () => {
    expect(translate("en", "settingsModelTestPassed", { latency: 42 })).toBe(
      "Connection ok in 42ms.",
    );
    expect(translate("zh-CN", "settingsModelTestPassed", { latency: 42 })).toBe(
      "连接正常，用时 42ms。",
    );
    expect(
      translate("zh-CN", "settingsGitHubProbeSuccess", {
        latency: 88,
        username: "yex",
      }),
    ).toBe("已用 yex 连接，耗时 88 ms。");
  });
});
