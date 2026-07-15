/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const commandsSource = readFileSync(
  "src/features/settings/CommandsSettingsSection.tsx",
  "utf8",
);
const mcpSource = readFileSync(
  "src/features/settings/McpSettingsSection.tsx",
  "utf8",
);

describe("command and MCP finite controls", () => {
  it("uses searchable registry selects for command targets", () => {
    expect(commandsSource).not.toContain("<select");
    expect(commandsSource).toMatch(/name="scope"[\s\S]*?<Select/);
    expect(commandsSource).toMatch(
      /name="workspace_id"[\s\S]*?<Select[\s\S]*?showSearch/,
    );
    expect(commandsSource).toMatch(/name="source"[\s\S]*?<Select/);
  });

  it("uses the existing transport option registry in an MCP Select", () => {
    expect(mcpSource).not.toContain("<select");
    expect(mcpSource).toMatch(
      /name="transport"[\s\S]*?<Select[\s\S]*?transportOptions\.map/,
    );
  });
});
