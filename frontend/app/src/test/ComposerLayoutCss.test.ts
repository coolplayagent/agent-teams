/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composerCss = readFileSync("src/features/composer/Composer.css", "utf8");
const composerSource = readFileSync(
  "src/features/composer/Composer.tsx",
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

  it("moves infrequent configuration into a dense contextual surface", () => {
    expect(composerSource).toContain('overlayClassName="at-composer-advanced-popover"');
    expect(composerCss).toMatch(
      /\.at-composer-advanced-panel\s*{[\s\S]*?width:\s*min\(680px, calc\(100vw - 50px\)\);/,
    );
    expect(composerCss).toMatch(
      /\.at-composer-advanced-panel \.at-composer-control-set\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(composerCss).toMatch(
      /@media \(max-width:\s*720px\)[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
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
      /@container composer \(max-width:\s*380px\)[\s\S]*?\.at-composer \.at-composer-summary-copy,[\s\S]*?display:\s*none;/,
    );
    expect(composerCss).toContain("@media (prefers-reduced-motion: reduce)");
  });

  it("uses an intrinsic compact topology summary in split-width composers", () => {
    expect(composerSource).toContain("composerTopologySummary");
    expect(composerSource).toContain("abbreviateComposerModeLabel(composerModeLabel)");
    expect(composerSource).toContain("title={composerTopologySummary}");
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-topology-summary\s*{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?max-width:\s*260px;/,
    );
    expect(composerCss).toMatch(
      /@container composer \(max-width:\s*680px\)[\s\S]*?\.at-composer \.at-composer-summary-full\s*{[\s\S]*?display:\s*none;[\s\S]*?\.at-composer \.at-composer-summary-compact\s*{[\s\S]*?display:\s*inline;/,
    );
  });

  it("renders suggestions as a bounded floating surface", () => {
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu\.at-prompt-mention-menu\s*{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*1100;[\s\S]*?max-width:\s*calc\(100vw - 24px\);[\s\S]*?overflow:\s*hidden;/,
    );
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu \.at-prompt-mention-menu-list\s*{[\s\S]*?max-height:\s*inherit;[\s\S]*?overflow-y:\s*auto;/,
    );
  });
});
