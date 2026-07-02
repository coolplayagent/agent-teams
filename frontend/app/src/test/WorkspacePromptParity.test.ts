/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const appShellSource = readFileSync("src/features/shell/AppShell.tsx", "utf8");
const composerSource = readFileSync("src/features/composer/Composer.tsx", "utf8");
const currentSessionIndicatorSource = readFileSync(
  "src/features/shell/CurrentSessionIndicator.tsx",
  "utf8",
);
const markdownMessageSource = readFileSync(
  "src/features/timeline/MarkdownMessage.tsx",
  "utf8",
);
const messageTimelineSource = readFileSync(
  "src/features/timeline/MessageTimeline.tsx",
  "utf8",
);
const sessionTokenUsageSource = readFileSync(
  "src/features/shell/SessionTokenUsage.tsx",
  "utf8",
);
const themeCss = readFileSync("src/styles/theme.css", "utf8");

const workspaceShellSources = [
  appShellSource,
  composerSource,
  currentSessionIndicatorSource,
  markdownMessageSource,
  messageTimelineSource,
  sessionTokenUsageSource,
  themeCss,
].join("\n");

describe("workspace prompt shell parity", () => {
  it("keeps retired V1 shell placeholders and rails out of the React shell", () => {
    for (const retiredToken of [
      "execution-mode-select",
      "Execution mode",
      "AI orchestration",
      "No session selected",
      "Start a session from the left sidebar",
      "right-rail",
      "right-rail-resizer",
      "system-logs",
      "agent-drawer",
    ]) {
      expect(workspaceShellSources).not.toContain(retiredToken);
    }

    expect(appShellSource).toContain('className="at-shell"');
    expect(appShellSource).toContain('className="at-body"');
    expect(appShellSource).toContain("<CurrentSessionIndicator");
    expect(currentSessionIndicatorSource).toContain('className="at-workspace-title"');
    expect(currentSessionIndicatorSource).toContain("workspaceLabel");
  });

  it("keeps top bar, mode, token, and prompt controls in the React shell contract", () => {
    expectOrdered(appShellSource, ["<CurrentSessionIndicator", 'className="at-topbar-right"']);
    expectOrdered(topbarRightBlock(), [
      "handleLanguageToggle",
      "<MessageExportMenu",
      'aria-label={t("appSettings")}',
      'aria-label={t("appToggleTheme")}',
      "at-topbar-health",
      'href="/"',
    ]);

    expect(composerSource).toContain('aria-label={t("composerPrompt")}');
    expect(composerSource).toContain("composerPromptPlaceholder");
    expect(composerSource).toContain('className="at-session-mode-control"');
    expect(composerSource).toContain('className="at-normal-root-role-select"');
    expect(composerSource).toContain('className="at-orchestration-preset-select"');
    expect(composerSource).toContain('className="at-role-select"');
    expect(composerSource).toContain('className="at-model-profile-select"');
    expect(composerSource).toContain('t("composerThinking")');
    expect(composerSource).toContain('t("composerShellSafetyPolicy")');
    expect(composerSource).toContain('t("composerShellSafetyShort")');
    expect(composerSource).toContain('t("composerYolo")');

    expect(sessionTokenUsageSource).toContain('className="at-token-usage"');
    expect(sessionTokenUsageSource).toContain('t("tokenUsage")');
    expect(sessionTokenUsageSource).toContain('t("tokenLatestContext")');
    expect(sessionTokenUsageSource).toContain('t("tokenRefresh")');
    expect(sessionTokenUsageSource).not.toContain("Tokens --");
  });

  it("keeps workspace prompt rendering on React surfaces, markdown, and stream primitives", () => {
    for (const legacyBeige of ["#ece4d8", "#e8dfd1", "#efe7db", "#fbf7f0"]) {
      expect(themeCss).not.toContain(legacyBeige);
    }

    expect(themeCss).toContain("--at-surface: #ffffff;");
    expect(themeCss).toContain("--at-surface-muted: #f1f1ec;");
    expect(themeCss).toContain("--at-primary: #2f6f5e;");
    expect(themeCss).toMatch(/body,\s*#root\s*{[\s\S]*?height:\s*100%;/);
    expect(themeCss).toMatch(/body\s*{[\s\S]*?overflow:\s*hidden;/);
    expect(themeCss).toContain(".at-message-tool-summary");
    expect(themeCss).toContain(".streaming-cursor");

    expect(messageTimelineSource).toMatch(/if \(!hasText\) \{[\s\S]*?return null;/);
    expect(messageTimelineSource).toContain('className="at-message-actions"');
    expect(messageTimelineSource).toContain("StreamingCursor");
    expect(markdownMessageSource).toContain("<ReactMarkdown");
    expect(markdownMessageSource).toContain("remarkGfm");
    expect(markdownMessageSource).toContain("rehypeCodeHighlight");
  });
});

function expectOrdered(source: string, markers: string[]) {
  let previousIndex = -1;
  for (const marker of markers) {
    const currentIndex = source.indexOf(marker);
    expect(currentIndex).toBeGreaterThan(previousIndex);
    previousIndex = currentIndex;
  }
}

function topbarRightBlock(): string {
  const start = appShellSource.indexOf('className="at-topbar-right"');
  const end = appShellSource.indexOf("</Header>", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return appShellSource.slice(start, end);
}
