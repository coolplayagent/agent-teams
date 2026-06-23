import type { RoleConfigOptions, RoleOption } from "../../api/contracts";

export interface LeadingRoleMention {
  error: string;
  hasTrigger: boolean;
  promptText: string;
  roleId: string | null;
}

interface MentionCandidate {
  roleId: string;
  term: string;
}

export interface PromptMentionOption {
  aliases: string[];
  description: string;
  displayName: string;
  insertTerm: string;
  roleId: string;
}

interface InternalPromptMentionOption extends PromptMentionOption {
  aliasSet: Set<string>;
}

export function parseLeadingRoleMention(
  text: string,
  roleOptions: RoleConfigOptions | undefined,
): LeadingRoleMention {
  const source = text.trim();
  if (!startsWithPromptMention(source)) {
    return { error: "", hasTrigger: false, promptText: source, roleId: null };
  }
  const candidates = listMentionableRoleCandidates(roleOptions);
  const normalizedSource = normalizePromptMentionSource(source).toLowerCase();
  const matched = candidates.filter((candidate) => {
    const prefix = `@${candidate.term}`.toLowerCase();
    if (!normalizedSource.startsWith(prefix)) {
      return false;
    }
    const nextChar = source.charAt(prefix.length);
    return !nextChar || /\s/.test(nextChar);
  });
  if (matched.length === 0) {
    return { error: "", hasTrigger: true, promptText: source, roleId: null };
  }
  matched.sort((left, right) => right.term.length - left.term.length);
  const best = matched[0];
  const conflicts = matched.filter((candidate) => candidate.term.length === best.term.length);
  if (conflicts.length > 1) {
    return {
      error: `Mention is ambiguous: ${conflicts.map((candidate) => candidate.term).join(", ")}.`,
      hasTrigger: true,
      promptText: source,
      roleId: null,
    };
  }
  return {
    error: "",
    hasTrigger: true,
    promptText: source.slice(best.term.length + 1).trim(),
    roleId: best.roleId,
  };
}

export function startsWithPromptMention(value: string): boolean {
  const firstChar = value.charAt(0);
  return firstChar === "@" || firstChar === "＠";
}

export function findLeadingRoleMentionOptions(
  text: string,
  roleOptions: RoleConfigOptions | undefined,
): PromptMentionOption[] {
  const query = leadingMentionQuery(text);
  if (query === null) {
    return [];
  }
  return listMentionableRoleOptions(roleOptions)
    .map((option, index) => ({
      index,
      option,
      score: mentionOptionScore(option, query),
    }))
    .filter((item) => item.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((item) => item.option);
}

function listMentionableRoleCandidates(
  roleOptions: RoleConfigOptions | undefined,
): MentionCandidate[] {
  const seen = new Set<string>();
  const entries: MentionCandidate[] = [];
  const pushCandidate = (roleId: string | undefined, term: string | undefined) => {
    const safeRoleId = String(roleId ?? "").trim();
    const safeTerm = String(term ?? "").trim();
    if (!safeRoleId || !safeTerm) {
      return;
    }
    const key = `${safeRoleId}::${safeTerm.toLowerCase()}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    entries.push({ roleId: safeRoleId, term: safeTerm });
  };

  const coordinatorRoleId =
    normalizeRoleId(roleOptions?.coordinator_role_id) ||
    normalizeRoleId(roleOptions?.coordinator_role?.role_id);
  const mainAgentRoleId =
    normalizeRoleId(roleOptions?.main_agent_role_id) ||
    normalizeRoleId(roleOptions?.main_agent_role?.role_id) ||
    "MainAgent";
  if (coordinatorRoleId) {
    pushCandidate(coordinatorRoleId, "Coordinator");
    pushCandidate(coordinatorRoleId, coordinatorRoleId);
  }
  if (mainAgentRoleId) {
    pushCandidate(mainAgentRoleId, roleDisplayName(roleOptions?.main_agent_role));
    pushCandidate(mainAgentRoleId, mainAgentRoleId);
  }
  for (const role of roleOptions?.normal_mode_roles ?? []) {
    pushCandidate(role.role_id, role.name);
    pushCandidate(role.role_id, role.role_id);
  }
  return entries;
}

function listMentionableRoleOptions(
  roleOptions: RoleConfigOptions | undefined,
): PromptMentionOption[] {
  const entries: InternalPromptMentionOption[] = [];
  const byRoleId = new Map<string, InternalPromptMentionOption>();
  const upsertOption = (
    roleId: string | undefined,
    displayName: string | undefined,
    { aliases = [], description = "" }: { aliases?: string[]; description?: string } = {},
  ) => {
    const safeRoleId = normalizeRoleId(roleId);
    const safeDisplayName = normalizeRoleId(displayName) || safeRoleId;
    if (!safeRoleId || !safeDisplayName) {
      return;
    }
    const nextAliases = [safeDisplayName, safeRoleId, ...aliases]
      .map(normalizeRoleId)
      .filter(Boolean);
    const existing = byRoleId.get(safeRoleId);
    if (existing !== undefined) {
      if (
        existing.displayName.toLowerCase() === existing.roleId.toLowerCase() &&
        safeDisplayName.toLowerCase() !== safeRoleId.toLowerCase()
      ) {
        existing.displayName = safeDisplayName;
        existing.insertTerm = safeDisplayName;
      }
      if (!existing.description && description.trim()) {
        existing.description = description.trim();
      }
      for (const alias of nextAliases) {
        existing.aliasSet.add(alias);
      }
      existing.aliases = Array.from(existing.aliasSet);
      return;
    }
    const entry = {
      aliasSet: new Set(nextAliases),
      aliases: nextAliases,
      description: description.trim(),
      displayName: safeDisplayName,
      insertTerm: safeDisplayName,
      roleId: safeRoleId,
    };
    byRoleId.set(safeRoleId, entry);
    entries.push(entry);
  };

  const coordinatorRoleId =
    normalizeRoleId(roleOptions?.coordinator_role_id) ||
    normalizeRoleId(roleOptions?.coordinator_role?.role_id);
  const mainAgentRoleId =
    normalizeRoleId(roleOptions?.main_agent_role_id) ||
    normalizeRoleId(roleOptions?.main_agent_role?.role_id) ||
    "MainAgent";
  if (coordinatorRoleId) {
    upsertOption(coordinatorRoleId, "Coordinator");
  }
  if (mainAgentRoleId) {
    upsertOption(mainAgentRoleId, roleDisplayName(roleOptions?.main_agent_role));
  }
  for (const role of roleOptions?.normal_mode_roles ?? []) {
    upsertOption(role.role_id, role.name || role.role_id, {
      aliases: [role.role_id],
      description: role.description,
    });
  }
  return entries.map(({ aliasSet: _aliasSet, ...entry }) => entry);
}

function leadingMentionQuery(text: string): string | null {
  const match = text.match(/^[@＠]([^\s]*)$/);
  return match === null ? null : match[1]?.trim().toLowerCase() ?? "";
}

function mentionOptionScore(option: PromptMentionOption, query: string): number {
  if (!query) {
    return 0;
  }
  const aliases = option.aliases.map((alias) => alias.toLowerCase());
  if (aliases.some((alias) => alias === query)) {
    return 0;
  }
  if (aliases.some((alias) => alias.startsWith(query))) {
    return 1;
  }
  if (aliases.some((alias) => alias.includes(query))) {
    return 2;
  }
  return Number.POSITIVE_INFINITY;
}

function roleDisplayName(role: RoleOption | null | undefined): string {
  return normalizeRoleId(role?.name) || normalizeRoleId(role?.role_id);
}

function normalizePromptMentionSource(value: string): string {
  return value.replace(/^＠/, "@");
}

function normalizeRoleId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}
