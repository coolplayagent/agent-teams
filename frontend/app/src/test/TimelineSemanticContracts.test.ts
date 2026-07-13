import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const timelineSource = readFileSync(
  "src/features/timeline/MessageTimeline.tsx",
  "utf8",
);
const sidebarSource = readFileSync(
  "src/features/sessions/SessionsSidebar.tsx",
  "utf8",
);
const shellSource = readFileSync(
  "src/features/shell/AppShell.tsx",
  "utf8",
);

describe("timeline semantic contracts", () => {
  it("does not infer internal visibility from user-visible content", () => {
    expect(timelineSource).not.toContain("<background-task-notification>");
    expect(timelineSource.toLowerCase()).not.toContain(
      "return only the delegation plan json object",
    );
    expect(timelineSource).not.toContain('startsWith("Injection applied:")');
  });

  it("does not infer subagent identity from id naming conventions", () => {
    expect(sidebarSource).not.toContain('startsWith("subagent_run_")');
    expect(timelineSource).not.toMatch(/identifiers\.includes\(["']subagent["']\)/);
    expect(timelineSource).not.toContain("subagentReferenceFromText");
    expect(timelineSource).not.toMatch(/MAIN_TIMELINE_AGENT_ROLES/);
    expect(timelineSource).not.toMatch(/INTERNAL_ORCHESTRATION_TIMELINE_ROLES/);
    for (const fixedRoleName of [
      '"coordinator"',
      '"mainagent"',
      '"delegationplanner"',
      '"llmsecurityevaluator"',
    ]) {
      expect(timelineSource.toLowerCase()).not.toContain(fixedRoleName);
    }
  });

  it("does not bind subagent panels using fuzzy title scoring", () => {
    expect(shellSource).not.toContain("timelineReferenceSubagentMatchScore");
    expect(shellSource).not.toMatch(/subagentText\.includes\(referenceText\)/);
  });

  it("does not reserve configurable role names in identity decisions", () => {
    const identitySources = `${timelineSource}\n${sidebarSource}\n${shellSource}`
      .toLowerCase();
    for (const roleName of [
      '"coordinator"',
      '"mainagent"',
      '"delegationplanner"',
      '"llmsecurityevaluator"',
    ]) {
      expect(identitySources).not.toContain(roleName);
    }
  });
});
