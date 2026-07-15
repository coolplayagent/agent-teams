import type {
  ModelProfilesPayload,
  RoleConfigOptions,
  RoleOption,
  SessionMode,
} from "../../api/contracts";
import type { Translate } from "../../i18n";
import type { PromptAttachment } from "./PromptAttachments";

export function resolveImageInputBlockedMessage({
  activeRunId,
  attachments,
  modelProfiles,
  roleOptions,
  selectedModelProfile,
  selectedNormalRootRoleId,
  selectedSessionMode,
  targetRoleId,
  t,
}: {
  activeRunId: string | null;
  attachments: PromptAttachment[];
  modelProfiles: ModelProfilesPayload | undefined;
  roleOptions: RoleConfigOptions | undefined;
  selectedModelProfile: string | null;
  selectedNormalRootRoleId: string;
  selectedSessionMode: SessionMode;
  targetRoleId: string | null;
  t: Translate;
}): string {
  if (attachments.length === 0) {
    return "";
  }
  if (activeRunId !== null) {
    return t("composerRuntimeTextOnly");
  }
  const resolvedTargetRoleId = resolveValidationRoleId(
    selectedSessionMode,
    roleOptions,
    selectedNormalRootRoleId,
    targetRoleId,
  );
  if (!resolvedTargetRoleId) {
    return "";
  }
  const selectedProfileSupport =
    selectedSessionMode === "normal"
      ? resolveModelProfileInputModalitySupport(
          modelProfiles,
          selectedModelProfile,
          "image",
        )
      : { label: "", support: null };
  const roleSupport = resolveRoleInputModalitySupport(
    roleOptions,
    resolvedTargetRoleId,
    "image",
  );
  const imageSupport = selectedProfileSupport.support ?? roleSupport.support;
  if (imageSupport === true) {
    return "";
  }
  const targetLabel =
    selectedProfileSupport.label ||
    roleSupport.label ||
    resolvedTargetRoleId ||
    t("composerSelectedAgent");
  if (imageSupport === null) {
    return t("composerImageSupportUnknown", { target: targetLabel });
  }
  return t("composerImageUnsupported", { target: targetLabel });
}

function resolveValidationRoleId(
  sessionMode: SessionMode,
  roleOptions: RoleConfigOptions | undefined,
  selectedNormalRootRoleId: string,
  targetRoleId: string | null,
): string {
  if (sessionMode === "normal") {
    return (
      normalizeProfileName(targetRoleId) ||
      resolvePrimaryRoleId(sessionMode, roleOptions, selectedNormalRootRoleId)
    );
  }
  return resolvePrimaryRoleId(sessionMode, roleOptions, selectedNormalRootRoleId);
}

function resolveModelProfileInputModalitySupport(
  profiles: ModelProfilesPayload | undefined,
  selectedProfile: string | null,
  modality: "image",
): { label: string; support: boolean | null } {
  const profileName = normalizeProfileName(selectedProfile);
  if (!profileName) {
    return { label: "", support: null };
  }
  const profile = profiles?.[profileName];
  if (profile === undefined) {
    return { label: profileName, support: null };
  }
  const inputModalities = normalizeInputModalities(profile.input_modalities);
  if (inputModalities !== null) {
    return {
      label: normalizeProfileName(profile.model) || profileName,
      support: inputModalities.includes(modality),
    };
  }
  return {
    label: normalizeProfileName(profile.model) || profileName,
    support:
      resolveCapabilityInputSupport(profile.resolved_capabilities?.input, modality) ??
      resolveCapabilityInputSupport(profile.capabilities?.input, modality),
  };
}

function resolveRoleInputModalitySupport(
  roleOptions: RoleConfigOptions | undefined,
  roleId: string,
  modality: "image",
): { label: string; support: boolean | null } {
  const role = findRoleOption(roleOptions, roleId);
  if (role === undefined) {
    return { label: roleId, support: null };
  }
  const label =
    normalizeProfileName(role.model_name) ||
    normalizeProfileName(role.model_profile) ||
    normalizeProfileName(role.name) ||
    role.role_id;
  const capabilitySupport = resolveCapabilityInputSupport(
    role.capabilities?.input,
    modality,
  );
  if (capabilitySupport !== null) {
    return { label, support: capabilitySupport };
  }
  const inputModalities = normalizeInputModalities(role.input_modalities);
  return {
    label,
    support: inputModalities === null ? null : inputModalities.includes(modality),
  };
}

function resolvePrimaryRoleId(
  sessionMode: SessionMode,
  roleOptions: RoleConfigOptions | undefined,
  selectedNormalRootRoleId: string,
): string {
  if (sessionMode === "orchestration") {
    return (
      normalizeProfileName(roleOptions?.coordinator_role_id) ||
      normalizeProfileName(roleOptions?.coordinator_role?.role_id)
    );
  }
  return (
    normalizeProfileName(selectedNormalRootRoleId) ||
    normalizeProfileName(roleOptions?.main_agent_role_id) ||
    normalizeProfileName(roleOptions?.main_agent_role?.role_id) ||
    normalizeProfileName(roleOptions?.normal_mode_roles?.[0]?.role_id)
  );
}

function findRoleOption(
  roleOptions: RoleConfigOptions | undefined,
  roleId: string,
): RoleOption | undefined {
  const normalizedRoleId = normalizeProfileName(roleId);
  return [
    roleOptions?.coordinator_role,
    roleOptions?.main_agent_role,
    ...(roleOptions?.normal_mode_roles ?? []),
    ...(roleOptions?.subagent_roles ?? []),
  ]
    .filter((option): option is RoleOption => option !== null && option !== undefined)
    .find((option) => option.role_id === normalizedRoleId);
}

function resolveCapabilityInputSupport(
  inputCapabilities: { image?: boolean | null } | undefined,
  modality: "image",
): boolean | null {
  const support = inputCapabilities?.[modality];
  return typeof support === "boolean" ? support : null;
}

function normalizeInputModalities(
  inputModalities: string[] | undefined,
): string[] | null {
  if (!Array.isArray(inputModalities)) {
    return null;
  }
  return inputModalities
    .map((modality) => modality.trim().toLowerCase())
    .filter(Boolean);
}

function normalizeProfileName(value: string | null | undefined): string {
  return String(value ?? "").trim();
}
