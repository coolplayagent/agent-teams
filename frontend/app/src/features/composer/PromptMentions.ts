import type {
  CommandCatalogResponse,
  CommandDetail,
  RoleConfigOptions,
  RoleOption,
  RoleSkillOption,
  WorkspaceSearchResponse,
  WorkspaceSearchResult,
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

export interface PromptSkillMentionOption {
  aliases: string[];
  description: string;
  displayName: string;
  insertTerm: string;
  kind: "skill";
  skillName: string;
  skillRef: string;
  source: string;
}

export interface PromptResourceMentionOption {
  aliases: string[];
  description: string;
  displayName: string;
  insertTerm: string;
  kind: "resource";
  path: string;
  resourceKind: "directory" | "file";
}

export interface PromptActionMentionOption {
  actionId: "attach-image" | "toggle-thinking" | "use-normal-mode" | "use-orchestration-mode";
  aliases: string[];
  description: string;
  displayName: string;
  insertTerm: string;
  kind: "action";
}

export type PromptMentionOption =
  | PromptActionMentionOption
  | PromptCommandMentionOption
  | PromptResourceMentionOption
  | PromptRoleMentionOption
  | PromptSkillMentionOption;

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
    for (const term of roleMentionTerms(coordinatorRoleId, "Coordinator")) {
      pushCandidate(coordinatorRoleId, term);
    }
  }
  if (mainAgentRoleId) {
    for (const term of roleMentionTerms(
      mainAgentRoleId,
      roleDisplayName(roleOptions?.main_agent_role, mainAgentRoleId),
    )) {
      pushCandidate(mainAgentRoleId, term);
    }
  }
  for (const role of roleOptions?.normal_mode_roles ?? []) {
    for (const term of roleMentionTerms(
      role.role_id,
      roleDisplayName(role, role.role_id),
      [role.name, role.role_id],
    )) {
      pushCandidate(role.role_id, term);
    }
  }
  return entries;
}

export interface PromptCommandContext {
  end: number;
  query: string;
  start: number;
}

export interface PromptResourceContext {
  end: number;
  query: string;
  start: number;
  trigger: "@" | "＠";
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
  option: PromptCommandMentionOption | PromptSkillMentionOption,
): string {
  const before = text.slice(0, context.start);
  const after = text.slice(context.end);
  const tail = after ? (after.startsWith(" ") ? after : ` ${after}`) : " ";
  return `${before}/${option.insertTerm}${tail}`;
}

export function getPromptResourceContext(text: string): PromptResourceContext | null {
  const source = String(text ?? "");
  const mentionTokenMatch = source.match(/(^|\s)([@＠])([^\s]*)$/);
  if (mentionTokenMatch === null) {
    return null;
  }
  const trigger = mentionTokenMatch[2] === "＠" ? "＠" : "@";
  const query = mentionTokenMatch[3]?.trim() ?? "";
  const start = source.length - query.length - 1;
  return { end: source.length, query, start, trigger };
}

export function applyPromptMentionOption(
  text: string,
  context: PromptResourceContext,
  option: PromptResourceMentionOption | PromptRoleMentionOption,
): string {
  const before = text.slice(0, context.start);
  const after = text.slice(context.end);
  const shouldAppendSpace =
    option.kind === "role" ||
    (option.kind === "resource" && option.resourceKind !== "directory");
  const tail = after
    ? after.startsWith(" ")
      ? after
      : ` ${after}`
    : shouldAppendSpace
      ? " "
      : "";
  return `${before}${context.trigger}${option.insertTerm}${tail}`;
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

export function findPromptSlashMentionOptions({
  catalog,
  query,
  roleOptions,
  workspaceId,
}: {
  catalog: CommandCatalogResponse | undefined;
  query: string;
  roleOptions: RoleConfigOptions | undefined;
  workspaceId: string | null | undefined;
}): Array<PromptCommandMentionOption | PromptSkillMentionOption> {
  const commandOptions = findPromptCommandMentionOptions(
    catalog,
    workspaceId,
    query,
  ).map((option, index) => ({ index, option }));
  const skillOptions = listPromptSkillMentionOptions(roleOptions)
    .map((option, index) => ({
      index: commandOptions.length + index,
      option,
      score: mentionOptionScore(option, query),
    }))
    .filter((item) => item.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ index, option }) => ({ index, option }));
  return [...commandOptions, ...skillOptions].slice(0, 20).map((item) => item.option);
}

export function resolvePromptSkillInvocation({
  promptText,
  roleOptions,
  selectedSkill,
}: {
  promptText: string;
  roleOptions: RoleConfigOptions | undefined;
  selectedSkill: PromptSkillMentionOption | null;
}): { args: string; skill: PromptSkillMentionOption } | null {
  const invocation = extractPromptSlashInvocation(promptText);
  if (invocation === null) {
    return null;
  }
  const skillOptions = listPromptSkillMentionOptions(roleOptions);
  const selected = selectedSkill === null
    ? null
    : skillOptions.find((option) => option.skillRef === selectedSkill.skillRef) ?? null;
  if (
    selected !== null &&
    promptSlashInvocationMatchesSkill(invocation.name, selected)
  ) {
    return { args: invocation.args, skill: selected };
  }
  const matchedSkill = skillOptions.find((option) =>
    promptSlashInvocationMatchesSkill(invocation.name, option),
  );
  return matchedSkill === undefined ? null : { args: invocation.args, skill: matchedSkill };
}

export function findPromptResourceMentionOptions({
  query,
  resourceResponse,
  roleOptions,
}: {
  query: string;
  resourceResponse: WorkspaceSearchResponse | undefined;
  roleOptions: RoleConfigOptions | undefined;
}): Array<PromptResourceMentionOption | PromptRoleMentionOption> {
  const roleMentionOptions = listMentionableRoleOptions(roleOptions)
    .map((option, index) => ({
      index,
      option,
      score: mentionOptionScore(option, query),
    }))
    .filter((item) => item.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map((item) => item.option);
  const resourceMentionOptions = normalizePromptResourceResponse(resourceResponse)
    .map((option, index) => ({
      index,
      option,
      score: mentionOptionScore(option, query),
    }))
    .filter((item) => item.score < Number.POSITIVE_INFINITY)
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, 20)
    .map((item) => item.option);
  return [...roleMentionOptions, ...resourceMentionOptions].slice(0, 20);
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
    const nextAliases = roleMentionTerms(safeRoleId, safeDisplayName, aliases);
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
    upsertOption(
      mainAgentRoleId,
      roleDisplayName(roleOptions?.main_agent_role, mainAgentRoleId),
    );
  }
  for (const role of roleOptions?.normal_mode_roles ?? []) {
    upsertOption(role.role_id, roleDisplayName(role, role.role_id), {
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

function listPromptSkillMentionOptions(
  roleOptions: RoleConfigOptions | undefined,
): PromptSkillMentionOption[] {
  const seen = new Set<string>();
  const options: PromptSkillMentionOption[] = [];
  for (const skill of roleOptions?.skills ?? []) {
    const option = skillMentionOption(skill);
    if (option === null || seen.has(option.skillRef.toLowerCase())) {
      continue;
    }
    seen.add(option.skillRef.toLowerCase());
    options.push(option);
  }
  return options;
}

function skillMentionOption(skill: RoleSkillOption): PromptSkillMentionOption | null {
  const ref = normalizeRoleId(skill.ref);
  const name = normalizeRoleId(skill.name) || ref;
  if (!ref || !name) {
    return null;
  }
  return {
    aliases: uniqueMentionTerms([name, ref]),
    description: skill.description?.trim() ?? "",
    displayName: name,
    insertTerm: name,
    kind: "skill",
    skillName: name,
    skillRef: ref,
    source: normalizeRoleId(skill.source),
  };
}

function extractPromptSlashInvocation(
  promptText: string,
): { args: string; name: string } | null {
  const trimmedPrompt = promptText.trim();
  if (!trimmedPrompt.startsWith("/")) {
    return null;
  }
  const match = /^\/([^\s/]+)(?:\s+([\s\S]*))?$/.exec(trimmedPrompt);
  if (match === null) {
    return null;
  }
  const name = normalizeRoleId(match[1]);
  if (!name) {
    return null;
  }
  return {
    args: normalizeRoleId(match[2]),
    name,
  };
}

function promptSlashInvocationMatchesSkill(
  invocationName: string,
  option: PromptSkillMentionOption,
): boolean {
  const normalizedName = normalizeRoleId(invocationName).toLowerCase();
  return option.aliases.some((alias) => alias.toLowerCase() === normalizedName);
}

function normalizePromptResourceResponse(
  response: WorkspaceSearchResponse | undefined,
): PromptResourceMentionOption[] {
  return (response?.results ?? [])
    .map(resourceMentionOption)
    .filter((option) => option !== null);
}

function resourceMentionOption(
  result: WorkspaceSearchResult,
): PromptResourceMentionOption | null {
  const path = normalizeRoleId(result.path);
  const name = normalizeRoleId(result.name) || path;
  if (!path || !name) {
    return null;
  }
  const resourceKind = result.kind === "directory" ? "directory" : "file";
  return {
    aliases: [name, path].map(normalizeRoleId).filter(Boolean),
    description: path,
    displayName: name,
    insertTerm: resourceKind === "directory" && !path.endsWith("/") ? `${path}/` : path,
    kind: "resource",
    path,
    resourceKind,
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

function roleDisplayName(
  role: RoleOption | null | undefined,
  fallbackRoleId?: string,
): string {
  const explicitName = normalizeRoleId(role?.name);
  if (explicitName) {
    return explicitName;
  }
  const roleId = normalizeRoleId(role?.role_id) || normalizeRoleId(fallbackRoleId);
  return humanizeRoleId(roleId);
}

function roleMentionTerms(
  roleId: string,
  displayName: string,
  aliases: string[] = [],
): string[] {
  return uniqueMentionTerms([
    displayName,
    roleId,
    separatedRoleAlias(roleId, " "),
    separatedRoleAlias(roleId, "_"),
    separatedRoleAlias(roleId, "-"),
    ...aliases,
  ]);
}

function separatedRoleAlias(roleId: string, separator: string): string {
  const words = normalizeRoleId(roleId)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  return words.join(separator);
}

function uniqueMentionTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const value of values) {
    const term = normalizeRoleId(value);
    const key = term.toLowerCase();
    if (!term || seen.has(key)) {
      continue;
    }
    seen.add(key);
    terms.push(term);
  }
  return terms;
}

function humanizeRoleId(roleId: string): string {
  const safeRoleId = normalizeRoleId(roleId);
  if (!safeRoleId) {
    return "";
  }
  if (isMainAgentRoleIdentifier(safeRoleId)) {
    return "Main Agent";
  }
  return (
    safeRoleId
      .split(/[_\s-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || safeRoleId
  );
}

function isMainAgentRoleIdentifier(roleId: string): boolean {
  return normalizeRoleId(roleId).toLowerCase().replace(/[\s_-]+/g, "") === "mainagent";
}

function normalizePromptMentionSource(value: string): string {
  return value.replace(/^＠/, "@");
}

function normalizeRoleId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}
