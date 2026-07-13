import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const productionEntry = readFileSync("src/desktop/main.ts", "utf-8");
const desktopApplication = readFileSync("src/desktop/application.ts", "utf-8");
const testEntry = readFileSync("src/desktop/testMain.ts", "utf-8");

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
});
