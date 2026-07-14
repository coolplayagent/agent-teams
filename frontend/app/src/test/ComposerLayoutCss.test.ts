/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composerCss = readFileSync("src/features/composer/Composer.css", "utf8");
const composerSource = readFileSync(
  "src/features/composer/Composer.tsx",
  "utf8",
);
const composerSurfaceSource = readFileSync(
  "src/features/composer/ComposerSurface.tsx",
  "utf8",
);
const runControlsSource = readFileSync(
  "src/features/composer/ComposerRunControls.tsx",
  "utf8",
);
const newSessionSource = readFileSync(
  "src/features/sessions/NewSessionView.tsx",
  "utf8",
);

describe("contextual composer layout", () => {
  it("keeps the prompt primary and the action rail fixed inside the composer", () => {
    expect(composerSource).toContain('className="at-composer-toolbar-start"');
    expect(composerSource).toContain('className="at-composer-primary-action"');
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-sender\.ant-sender\s*{[\s\S]*?min-height:\s*72px;[\s\S]*?background:\s*transparent;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-controls\s*{[\s\S]*?justify-content:\s*space-between;[\s\S]*?min-height:\s*36px;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-actions\s*{[\s\S]*?flex:\s*0 0 auto;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-primary-action\s*{[\s\S]*?width:\s*36px;[\s\S]*?min-width:\s*36px;[\s\S]*?height:\s*36px;/,
    );
  });

  it("keeps runtime settings visible through one shared contextual control rail", () => {
    expect(composerSource).toContain("<ComposerRunControls");
    expect(newSessionSource).toContain("<ComposerRunControls");
    expect(runControlsSource).toContain('role="group"');
    expect(runControlsSource).toContain(
      'aria-label={t("composerSessionMode")}',
    );
    expect(runControlsSource).toContain(
      'aria-label={t("composerModelProfile")}',
    );
    expect(runControlsSource).toContain('ariaLabel={t("composerThinking")}');
    expect(runControlsSource).toContain(
      'ariaLabel={t("composerShellSafetyPolicy")}',
    );
    expect(runControlsSource).toContain('label={t("composerYolo")}');
    expect(composerSurfaceSource).not.toContain("ComposerRunSettingsPopover");
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-run-controls\s*{[\s\S]*?display:\s*flex;[\s\S]*?min-width:\s*0;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-topology-controls,[\s\S]*?\.at-composer \.at-composer-execution-controls\s*{[\s\S]*?display:\s*flex;/,
    );
    expect(composerCss).toMatch(
      /@container composer \(max-width: 560px\)[\s\S]*?\.at-composer \.at-composer-topology-controls\s*{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
  });

  it("keeps attachments and narrow layouts from displacing the primary action", () => {
    expect(composerCss).toMatch(
      /\.at-composer \.at-prompt-attachments\s*{[\s\S]*?flex-wrap:\s*nowrap;[\s\S]*?overflow-x:\s*auto;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-prompt-attachment\s*{[\s\S]*?flex:\s*0 0 54px;[\s\S]*?max-width:\s*54px;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-toolbar-start\s*{[\s\S]*?min-width:\s*0;[\s\S]*?overflow:\s*hidden;/,
    );
    expect(composerCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("scopes target role to orchestration without duplicating runtime controls", () => {
    expect(runControlsSource).toMatch(
      /mode === "normal"[\s\S]*?at-composer-role-select[\s\S]*?at-composer-preset-select/,
    );
    expect(runControlsSource).toMatch(
      /mode === "orchestration"[\s\S]*?at-composer-target-select/,
    );
    expect(composerSource).not.toContain("ComposerRunSettingsPopover");
    expect(newSessionSource).not.toContain("NewSessionRunSettings");
  });

  it("renders suggestions as a bounded floating surface", () => {
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu\.at-prompt-mention-menu\s*{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*1100;[\s\S]*?max-width:\s*calc\(100vw - 24px\);[\s\S]*?overflow:\s*hidden;/,
    );
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu \.at-prompt-mention-menu-list\s*{[\s\S]*?max-height:\s*inherit;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu \.at-prompt-mention-item\s*{[\s\S]*?grid-template-columns:[\s\S]*?height:\s*30px;[\s\S]*?font-size:\s*12px;/,
    );
  });
});
