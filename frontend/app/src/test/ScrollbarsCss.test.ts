/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/styles/scrollbars.css", "utf8");
const main = readFileSync("src/main.tsx", "utf8");

describe("scoped native scrollbars", () => {
  it("is loaded after the application theme and stays opt-in", () => {
    expect(main.indexOf('import "./styles/scrollbars.css"')).toBeGreaterThan(
      main.indexOf('import "./styles/theme.css"'),
    );
    expect(css).toContain(".at-scroll-region");
    expect(css).not.toMatch(/(^|\n)\s*\*\s*{/);
  });

  it("supports Firefox and WebKit with stable native gutters", () => {
    expect(css).toContain("scrollbar-color: var(--at-scrollbar-thumb) transparent;");
    expect(css).toContain("scrollbar-gutter: stable;");
    expect(css).toContain("scrollbar-width: thin;");
    expect(css).toContain("::-webkit-scrollbar-thumb");
    expect(css).toContain("background-clip: padding-box;");
  });

  it("keeps sidebar scrollbars narrow and horizontal overflow discoverable", () => {
    expect(css).toMatch(
      /\.at-session-list::-webkit-scrollbar\s*{[\s\S]*?width:\s*7px;/,
    );
    expect(css).toMatch(
      /\.at-scroll-region\.is-horizontal, \.at-board-columns[\s\S]*?overscroll-behavior-inline:\s*contain;[\s\S]*?box-shadow:/,
    );
  });

  it.each([
    ".at-timeline",
    ".at-automation-list",
    ".at-memory-list",
    ".at-board-modal .ant-modal-body",
    ".at-connectors-modal .ant-modal-body",
    ".at-settings-modal .ant-modal-body",
    ".at-skills-detail-modal .ant-modal-body",
    ".at-workspace-diff-body",
    ".at-message-markdown pre",
    ".at-prompt-mention-menu-list",
  ])("styles the explicit scroll owner %s", (selector) => {
    expect(css).toContain(selector);
  });

  it("removes thumb motion when reduced motion is requested", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?transition:\s*none;/,
    );
  });
});
