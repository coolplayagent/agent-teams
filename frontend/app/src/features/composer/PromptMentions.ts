import type {
  CommandCatalogResponse,
  CommandDetail,
  RoleConfigOptions,
  RoleOption,
} from "../../api/contracts";

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

export interface PromptRoleMentionOption {
  aliases: string[];
  kind: "role";
  description: string;
  displayName: string;
  insertTerm: string;
  roleId: string;
}

export interface PromptCommandMentionOption {
  aliases: string[];
  commandName: string;
  description: string;
  displayName: string;
  insertTerm: string;
  kind: "command";
}

export type PromptMentionOption =
  | PromptCommandMentionOption
  | PromptRoleMentionOption;

interface InternalPromptRoleMentionOption extends PromptRoleMentionOption {
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
): PromptRoleMentionOption[] {
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

export interface PromptCommandContext {
  end: number;
  query: string;
  start: number;
}

export function getPromptCommandContext(text: string): PromptCommandContext | null {
  const source = String(text ?? "");
  const beforeCursor = source;
  const commandTokenMatch = beforeCursor.match(/(^|\s)\/([^\s]*)$/);
  if (commandTokenMatch === null) {
    return null;
  }
  const query = commandTokenMatch[2]?.trim() ?? "";
  const start = beforeCursor.length - query.length - 1;
  return { end: source.length, query, start };
}

export function applyPromptCommandOption(
  text: string,
  context: PromptCommandContext,
  option: PromptCommandMentionOption,
): string {
  const before = text.slice(0, context.start);
  const after = text.slice(context.end);
  const tail = after ? (after.startsWith(" ") ? after : ` ${after}`) : " ";
  return `${before}/${option.insertTerm}${tail}`;
}

export function findPromptCommandMentionOptions(
  catalog: CommandCatalogResponse | undefined,
  workspaceId: string | null | undefined,
  query: string,
): PromptCommandMentionOption[] {
  const safeWorkspaceId = normalizeRoleId(workspaceId);
  const commands = [
    ...(catalog?.app_commands ?? []),
    ...(catalog?.workspaces ?? [])
      .filter((workspace) => workspace.workspace_id === safeWorkspaceId)
      .flatMap((workspace) => workspace.commands ?? []),
  ];
  return commands
    .map((command, index) => {
      const option = commandMentionOption(command);
      return {
        index,
        option,
        score: mentionOptionScore(option, query),
      };
    })
    .filter((item) => item.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, 10)
    .map((item) => item.option);
}

function listMentionableRoleOptions(
  roleOptions: RoleConfigOptions | undefined,
): PromptRoleMentionOption[] {
  const entries: InternalPromptRoleMentionOption[] = [];
  const byRoleId = new Map<string, InternalPromptRoleMentionOption>();
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
      kind: "role" as const,
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

function commandMentionOption(command: CommandDetail): PromptCommandMentionOption {
  const name = normalizeRoleId(command.name);
  const insertTerm = name.startsWith("/") ? name.slice(1) : name;
  return {
    aliases: [name, insertTerm, ...(command.aliases ?? [])]
      .map(normalizeRoleId)
      .filter(Boolean),
    commandName: name,
    description: command.description?.trim() ?? "",
    displayName: name,
    insertTerm,
    kind: "command",
  };
}

function mentionOptionScore(option: PromptMentionOption, query: string): number {
  const safeQuery = normalizeRoleId(query).toLowerCase();
  if (!safeQuery) {
    return 0;
  }
  const aliases = option.aliases.map((alias) => alias.toLowerCase());
  if (aliases.some((alias) => alias === safeQuery)) {
    return 0;
  }
  if (aliases.some((alias) => alias.startsWith(safeQuery))) {
    return 1;
  }
  if (aliases.some((alias) => alias.includes(safeQuery))) {
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
