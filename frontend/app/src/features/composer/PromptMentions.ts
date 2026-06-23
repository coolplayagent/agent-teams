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

function roleDisplayName(role: RoleOption | null | undefined): string {
  return normalizeRoleId(role?.name) || normalizeRoleId(role?.role_id);
}

function normalizePromptMentionSource(value: string): string {
  return value.replace(/^＠/, "@");
}

function normalizeRoleId(value: string | null | undefined): string {
  return String(value ?? "").trim();
}
