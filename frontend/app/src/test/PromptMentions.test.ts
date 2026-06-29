import { describe, expect, it } from "vitest";

import type {
  CommandCatalogResponse,
  RoleConfigOptions,
  WorkspaceSearchResponse,
} from "../api/contracts";
import {
  applyPromptCommandOption,
  applyPromptMentionOption,
  findLeadingRoleMentionOptions,
  findPromptCommandMentionOptions,
  findPromptResourceMentionOptions,
  getPromptCommandContext,
  getPromptResourceContext,
  parseLeadingRoleMention,
} from "../features/composer/PromptMentions";

describe("PromptMentions", () => {
  it("builds typed command, resource, and role prompt options", () => {
    const commandOptions = findPromptCommandMentionOptions(
      commandCatalog(),
      "workspace-1",
      "opsx",
    );
    expect(commandOptions).toHaveLength(1);
    expect(commandOptions[0]).toMatchObject({
      commandName: "opsx:propose",
      displayName: "opsx:propose",
      insertTerm: "opsx:propose",
      kind: "command",
    });

    const commandContext = getPromptCommandContext("Run /opsx");
    if (commandContext === null) {
      throw new Error("Expected command context.");
    }
    expect(applyPromptCommandOption("Run /opsx", commandContext, commandOptions[0]))
      .toBe("Run /opsx:propose ");

    const resourceOptions = findPromptResourceMentionOptions({
      query: "main",
      resourceResponse: workspaceSearchResponse(),
      roleOptions: roleOptions(),
    });
    const fileOption = resourceOptions.find(
      (option) => option.kind === "resource" && option.resourceKind === "file",
    );
    if (fileOption === undefined) {
      throw new Error("Expected file resource option.");
    }
    expect(fileOption).toMatchObject({
      displayName: "main.py",
      insertTerm: "src/relay_teams/main.py",
      kind: "resource",
      path: "src/relay_teams/main.py",
      resourceKind: "file",
    });

    const fileContext = getPromptResourceContext("Inspect @main");
    if (fileContext === null) {
      throw new Error("Expected file mention context.");
    }
    expect(applyPromptMentionOption("Inspect @main", fileContext, fileOption))
      .toBe("Inspect @src/relay_teams/main.py ");

    const roleOptionsForQuery = findLeadingRoleMentionOptions("@Main", roleOptions());
    expect(roleOptionsForQuery[0]).toMatchObject({
      displayName: "Main Agent",
      insertTerm: "Main Agent",
      kind: "role",
      roleId: "MainAgent",
    });
    expect(parseLeadingRoleMention("@Main Agent Draft an update", roleOptions()))
      .toEqual({
        error: "",
        hasTrigger: true,
        promptText: "Draft an update",
        roleId: "MainAgent",
      });
  });

  it("keeps directory prompt mentions open for deeper resource paths", () => {
    const resourceOptions = findPromptResourceMentionOptions({
      query: "src",
      resourceResponse: workspaceSearchResponse(),
      roleOptions: roleOptions(),
    });
    const directoryOption = resourceOptions.find(
      (option) => option.kind === "resource" && option.resourceKind === "directory",
    );
    if (directoryOption === undefined) {
      throw new Error("Expected directory resource option.");
    }
    const context = getPromptResourceContext("@src");
    if (context === null) {
      throw new Error("Expected directory mention context.");
    }
    expect(applyPromptMentionOption("@src", context, directoryOption))
      .toBe("@src/");
  });
});

function commandCatalog(): CommandCatalogResponse {
  return {
    app_commands: [
      {
        allowed_modes: ["normal"],
        aliases: ["propose"],
        argument_hint: "<topic>",
        description: "Propose an implementation plan",
        discovery_source: "app",
        name: "opsx:propose",
        scope: "app",
        source_path: "C:/Users/yex/.codex/commands/opsx/propose.md",
        template: "Propose {{args}}",
      },
    ],
    workspaces: [],
  };
}

function workspaceSearchResponse(): WorkspaceSearchResponse {
  return {
    query: "main",
    results: [
      {
        kind: "file",
        name: "main.py",
        path: "src/relay_teams/main.py",
      },
      {
        kind: "directory",
        name: "src",
        path: "src",
      },
    ],
    workspace_id: "workspace-1",
  };
}

function roleOptions(): RoleConfigOptions {
  return {
    coordinator_role_id: "Coordinator",
    main_agent_role: {
      description: "Handles primary chat work.",
      name: "Main Agent",
      role_id: "MainAgent",
    },
    main_agent_role_id: "MainAgent",
    normal_mode_roles: [
      {
        description: "Writes copy",
        name: "Writer",
        role_id: "Writer",
      },
    ],
    subagent_roles: [],
  };
}
