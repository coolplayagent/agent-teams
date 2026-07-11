import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const shell = readFileSync("src/features/shell/AppShell.tsx", "utf8");
const exportMenu = readFileSync("src/features/shell/MessageExportMenu.tsx", "utf8");
const css = readFileSync("src/styles/theme.css", "utf8");

describe("topbar actions", () => {
  it("uses one shared button treatment for language and icon actions", () => {
    expect(shell.match(/className="at-topbar-action/g)).toHaveLength(3);
    expect(shell).toContain('className="at-topbar-action is-language"');
    expect(shell).toContain('"at-topbar-action is-active"');
    expect(exportMenu).toContain('className="at-topbar-action"');
    expect(css).toMatch(/\.at-topbar-action\.ant-btn\s*\{[^}]*height:\s*32px[^}]*border-radius:\s*7px/s);
  });
});
