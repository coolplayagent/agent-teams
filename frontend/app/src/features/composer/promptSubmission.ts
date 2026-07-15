import { resolveCommandPrompt } from "../../api/client";
import type {
  RoleConfigOptions,
  SessionMode,
  SessionRecord,
} from "../../api/contracts";
import type { Translate } from "../../i18n";
import {
  resolvePromptSkillInvocation,
  type PromptSkillMentionOption,
} from "./PromptMentions";

interface PromptSlashInvocation {
  args: string;
  rawText: string;
}

export async function resolveComposerPromptSubmission({
  promptText,
  roleOptions,
  selectedSkill,
  session,
  sessionMode,
  t,
}: {
  promptText: string;
  roleOptions: RoleConfigOptions | undefined;
  selectedSkill: PromptSkillMentionOption | null;
  session: Pick<SessionRecord, "workspace_id"> | undefined;
  sessionMode: SessionMode;
  t: Translate;
}): Promise<{ promptText: string; skills: string[] }> {
  const selectedSkillInvocation = resolvePromptSkillInvocation({
    promptText,
    roleOptions,
    selectedSkill,
  });
  if (selectedSkill !== null && selectedSkillInvocation !== null) {
    return {
      promptText: selectedSkillInvocation.args,
      skills: [selectedSkillInvocation.skill.skillRef],
    };
  }
  const invocation = extractPromptSlashInvocation(promptText);
  if (invocation === null) {
    return { promptText, skills: [] };
  }
  const workspaceId = normalizeOptionalId(session?.workspace_id);
  if (workspaceId !== null) {
    const response = await resolveCommandPrompt({
      workspace_id: workspaceId,
      raw_text: invocation.rawText,
      mode: sessionMode,
    });
    if (response.matched) {
      const expandedPrompt = normalizeOptionalId(response.expanded_prompt);
      return { promptText: expandedPrompt ?? promptText, skills: [] };
    }
  }
  const fallbackSkillInvocation = resolvePromptSkillInvocation({
    promptText,
    roleOptions,
    selectedSkill: null,
  });
  if (fallbackSkillInvocation !== null) {
    return {
      promptText: fallbackSkillInvocation.args,
      skills: [fallbackSkillInvocation.skill.skillRef],
    };
  }
  if (workspaceId === null) {
    throw new Error(t("composerCommandRequiresWorkspace"));
  }
  return { promptText, skills: [] };
}

function extractPromptSlashInvocation(
  promptText: string,
): PromptSlashInvocation | null {
  const trimmedPrompt = promptText.trim();
  // semantic-special-case-allow: prompt-command-prefix — "/" is public command syntax.
  if (!trimmedPrompt.startsWith("/")) {
    return null;
  }
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(trimmedPrompt);
  if (match === null) {
    return null;
  }
  const name = normalizeOptionalId(match[1]);
  if (name === null) {
    return null;
  }
  const args = normalizeOptionalId(match[2]) ?? "";
  return {
    args,
    rawText: `/${name}${args ? ` ${args}` : ""}`,
  };
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized || null;
}
