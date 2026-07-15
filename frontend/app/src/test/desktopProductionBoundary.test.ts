import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const productionEntry = readFileSync("src/desktop/main.ts", "utf-8");
const desktopApplication = readFileSync("src/desktop/application.ts", "utf-8");
const testEntry = readFileSync("src/desktop/testMain.ts", "utf-8");
const productionConfig = JSON.parse(
  readFileSync("tsconfig.desktop.json", "utf-8"),
) as {
  exclude?: string[];
};
const testConfig = JSON.parse(
  readFileSync("tsconfig.desktop-test.json", "utf-8"),
) as {
  compilerOptions?: { outDir?: string };
  include?: string[];
};

describe("desktop production boundary", () => {
  it("keeps test host behavior out of the production entry and application", () => {
    const productionSources = `${productionEntry}\n${desktopApplication}`;

    expect(productionSources).not.toContain("AGENT_TEAMS_DESKTOP_TEST_MODE");
    expect(productionSources).not.toContain("AGENT_TEAMS_DESKTOP_COPY_TEXT_LOG");
    expect(productionSources).not.toContain("AGENT_TEAMS_DESKTOP_OPEN_EXTERNAL_LOG");
    expect(productionSources).not.toContain(
      "AGENT_TEAMS_DESKTOP_AUTO_QUIT_AFTER_READY_MS",
    );
    expect(productionEntry).toContain("clipboard.writeText(text)");
    expect(productionEntry).toContain("shell.openExternal(url)");
  });

  it("owns smoke-test substitutions in the dedicated test entry", () => {
    expect(testEntry).toContain("AGENT_TEAMS_DESKTOP_COPY_TEXT_LOG");
    expect(testEntry).toContain("AGENT_TEAMS_DESKTOP_OPEN_EXTERNAL_LOG");
    expect(testEntry).toContain("AGENT_TEAMS_DESKTOP_AUTO_QUIT_AFTER_READY_MS");
  });

  it("compiles the test host outside the production desktop output", () => {
    expect(productionConfig.exclude).toContain("src/desktop/testMain.ts");
    expect(testConfig.compilerOptions?.outDir).toBe("dist-desktop-test");
    expect(testConfig.include).toContain("src/desktop/testMain.ts");
  });

  it("selects startup copy from Electron's application locale", () => {
    expect(desktopApplication).toContain(
      "desktopStartupCopy(app.getLocale())",
    );
    expect(desktopApplication).not.toContain("<h1>Startup failed</h1>");
    expect(desktopApplication).not.toContain(">Copy diagnostics</button>");
    expect(desktopApplication).not.toContain(">Retry startup</button>");
  });
});
