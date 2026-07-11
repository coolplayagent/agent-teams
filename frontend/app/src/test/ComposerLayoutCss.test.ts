/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const composerCss = readFileSync(
  "src/features/composer/Composer.css",
  "utf8",
);
const composerSource = readFileSync(
  "src/features/composer/Composer.tsx",
  "utf8",
);

describe("composer control layout CSS", () => {
  it("keeps the desktop controls compact on one row without fixed wide selects", () => {
    expect(composerSource).toContain('import "./Composer.css";');
    expect(composerSource).toContain('className="at-composer-toggles"');
    expect(composerSource).toContain('className="at-composer-actions"');

    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-controls\s*{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*8px;[\s\S]*?min-width:\s*0;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-control-set\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?flex-wrap:\s*nowrap;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-field\s*{[\s\S]*?flex:\s*1 1 132px;[\s\S]*?min-width:\s*110px;[\s\S]*?max-width:\s*176px;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-mode-field\s*{[\s\S]*?flex:\s*0 1 218px;[\s\S]*?min-width:\s*206px;[\s\S]*?max-width:\s*224px;/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-session-mode-control,[\s\S]*?\.at-composer \.at-model-profile-select\s*{[\s\S]*?flex:\s*1 1 auto;[\s\S]*?min-width:\s*0;[\s\S]*?width:\s*100%;/,
    );
    expect(composerCss).not.toContain("width: 218px");
  });

  it("uses the composer width for orderly wrapping and keeps actions available", () => {
    expect(composerCss).toMatch(
      /@container composer \(max-width: 920px\)[\s\S]*?\.at-composer \.at-composer-controls\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\) max-content;/,
    );
    expect(composerCss).toMatch(
      /@container composer \(max-width: 680px\)[\s\S]*?\.at-composer \.at-composer-control-set\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(composerCss).toMatch(
      /@container composer \(max-width: 440px\)[\s\S]*?\.at-composer \.at-composer-control-set\s*{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\);/,
    );
    expect(composerCss).toMatch(
      /\.at-composer \.at-composer-actions\.ant-space\s*{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?justify-content:\s*flex-end;/,
    );
  });

  it("renders mention suggestions as a bounded floating surface", () => {
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu\.at-prompt-mention-menu\s*{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*1100;[\s\S]*?max-width:\s*calc\(100vw - 24px\);[\s\S]*?overflow:\s*hidden;/,
    );
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu \.at-prompt-mention-menu-list\s*{[\s\S]*?max-height:\s*inherit;[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(composerCss).toMatch(
      /\.at-prompt-mention-menu \.at-prompt-mention-description\s*{[\s\S]*?overflow:\s*hidden;[\s\S]*?-webkit-line-clamp:\s*2;/,
    );
    expect(composerSource).toContain(
      'className="at-composer-prompt-anchor"',
    );
  });
});
