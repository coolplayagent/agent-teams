import type { Translate } from "../../i18n";
import type { PromptActionMentionOption } from "./PromptMentions";

export function buildComposerQuickActionOptions(
  t: Translate,
  thinkingEnabled: boolean,
): PromptActionMentionOption[] {
  return [
    {
      actionId: "browse-workspace",
      aliases: ["file", "folder", "context"],
      description: t("composerBrowseWorkspaceHelp"),
      displayName: t("composerBrowseWorkspace"),
      insertTerm: "",
      kind: "action",
    },
    {
      actionId: "attach-image",
      aliases: ["image", "attachment"],
      description: t("composerAddImageHelp"),
      displayName: t("composerAddImage"),
      insertTerm: "",
      kind: "action",
    },
    {
      actionId: "toggle-thinking",
      aliases: ["thinking"],
      description: t("composerThinkingEffort"),
      displayName: thinkingEnabled
        ? t("composerDisableThinking")
        : t("composerEnableThinking"),
      insertTerm: "",
      kind: "action",
    },
    {
      actionId: "use-normal-mode",
      aliases: ["normal"],
      description: t("composerRootRole"),
      displayName: t("composerSwitchNormal"),
      insertTerm: "",
      kind: "action",
    },
    {
      actionId: "use-orchestration-mode",
      aliases: ["orchestration"],
      description: t("composerOrchestrationPreset"),
      displayName: t("composerSwitchOrchestration"),
      insertTerm: "",
      kind: "action",
    },
  ];
}
