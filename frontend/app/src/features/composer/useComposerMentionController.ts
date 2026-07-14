import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { SenderRef } from "@ant-design/x/es/sender";
import type { KeyboardEvent } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  getCommandCatalog,
  searchWorkspacePaths,
} from "../../api/client";
import type {
  RoleConfigOptions,
  WorkspaceSearchResponse,
} from "../../api/contracts";
import { promptMentionOptionId } from "./PromptMentionMenu";
import {
  applyPromptCommandOption,
  applyPromptMentionOption,
  findLeadingRoleMentionOptions,
  findPromptResourceMentionOptions,
  findPromptSlashMentionOptions,
  getPromptCommandContext,
  getPromptResourceContext,
  parseLeadingRoleMention,
  type PromptActionMentionOption,
  type PromptMentionOption,
  type PromptSkillMentionOption,
} from "./PromptMentions";

const MENTION_PAGE_SIZE = 8;

interface ComposerMentionControllerOptions {
  active: boolean;
  draft: string;
  onAction: (option: PromptActionMentionOption) => void;
  quickActionOptions: PromptActionMentionOption[];
  roleOptions: RoleConfigOptions | undefined;
  setDraft: (update: string | ((current: string) => string)) => void;
  workspaceId: string | null;
}

export function useComposerMentionController({
  active,
  draft,
  onAction,
  quickActionOptions,
  roleOptions,
  setDraft,
  workspaceId,
}: ComposerMentionControllerOptions) {
  const queryClient = useQueryClient();
  const inputRef = useRef<SenderRef | null>(null);
  const mentionAnchorRef = useRef<HTMLDivElement | null>(null);
  const quickMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const [activeMentionIndex, setActiveMentionIndex] = useState(0);
  const [dismissedMentionDraft, setDismissedMentionDraft] = useState("");
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [selectedPromptSkill, setSelectedPromptSkill] =
    useState<PromptSkillMentionOption | null>(null);
  const mentionMenuId = useId();
  const promptCommandContext = useMemo(
    () =>
      active && dismissedMentionDraft !== draft
        ? getPromptCommandContext(draft)
        : null,
    [active, dismissedMentionDraft, draft],
  );
  const promptResourceContext = useMemo(
    () =>
      active &&
      promptCommandContext === null &&
      dismissedMentionDraft !== draft
        ? getPromptResourceContext(draft)
        : null,
    [active, dismissedMentionDraft, draft, promptCommandContext],
  );
  const commandCatalogQuery = useQuery({
    queryKey: ["commands", "catalog", "composer"],
    queryFn: getCommandCatalog,
    enabled: promptCommandContext !== null || quickMenuOpen,
    staleTime: 30000,
  });
  const resourceSearchQuery = useQuery({
    queryKey: [
      "workspaces",
      workspaceId,
      "prompt-resources",
      promptResourceContext?.query ?? "",
    ],
    queryFn: () => {
      if (workspaceId === null || promptResourceContext === null) {
        throw new Error("Workspace and resource query are required.");
      }
      return searchWorkspacePaths(workspaceId, promptResourceContext.query, 80);
    },
    enabled:
      workspaceId !== null &&
      promptResourceContext !== null &&
      promptResourceContext.query.length > 0,
    staleTime: 30000,
  });
  const resourceResponse = useMemo(
    () =>
      promptResourceResponseForMentions({
        currentResponse: resourceSearchQuery.data,
        query: promptResourceContext?.query ?? "",
        queryClient,
        workspaceId,
      }),
    [
      promptResourceContext?.query,
      queryClient,
      resourceSearchQuery.data,
      workspaceId,
    ],
  );
  const leadingRoleMention = useMemo(
    () => parseLeadingRoleMention(draft, roleOptions),
    [draft, roleOptions],
  );
  const leadingMentionOptions = useMemo(
    () =>
      active && dismissedMentionDraft !== draft
        ? findLeadingRoleMentionOptions(draft, roleOptions)
        : [],
    [active, dismissedMentionDraft, draft, roleOptions],
  );
  const commandMentionOptions = useMemo(
    () =>
      promptCommandContext === null
        ? []
        : findPromptSlashMentionOptions({
            catalog: commandCatalogQuery.data,
            query: promptCommandContext.query,
            roleOptions,
            workspaceId,
          }),
    [commandCatalogQuery.data, promptCommandContext, roleOptions, workspaceId],
  );
  const resourceMentionOptions = useMemo(
    () =>
      promptResourceContext === null
        ? []
        : findPromptResourceMentionOptions({
            query: promptResourceContext.query,
            resourceResponse,
            roleOptions,
          }),
    [promptResourceContext, resourceResponse, roleOptions],
  );
  const quickCommandOptions = useMemo(
    () =>
      findPromptSlashMentionOptions({
        catalog: commandCatalogQuery.data,
        query: "",
        roleOptions,
        workspaceId,
      }),
    [commandCatalogQuery.data, roleOptions, workspaceId],
  );
  const quickMentionOptions = useMemo(
    () =>
      findPromptResourceMentionOptions({
        query: "",
        resourceResponse: undefined,
        roleOptions,
      }),
    [roleOptions],
  );
  const options = quickMenuOpen
    ? [...quickActionOptions, ...quickMentionOptions, ...quickCommandOptions]
    : promptCommandContext !== null
      ? commandMentionOptions
      : promptResourceContext !== null
        ? resourceMentionOptions
        : leadingMentionOptions;
  const open =
    quickMenuOpen ||
    promptCommandContext !== null ||
    promptResourceContext !== null ||
    leadingMentionOptions.length > 0;
  const loading = quickMenuOpen
    ? commandCatalogQuery.isLoading
    : promptCommandContext !== null
      ? commandCatalogQuery.isLoading
      : promptResourceContext !== null && promptResourceContext.query.length > 0
        ? resourceSearchQuery.isLoading
        : false;

  useEffect(
    () => setActiveMentionIndex(0),
    [draft, options.length, quickMenuOpen],
  );

  useEffect(() => {
    const promptInput = inputRef.current?.nativeElement.querySelector("textarea");
    if (promptInput === undefined || promptInput === null) {
      return;
    }
    promptInput.setAttribute("role", "combobox");
    promptInput.setAttribute("aria-autocomplete", "list");
    promptInput.setAttribute("aria-haspopup", "listbox");
    promptInput.setAttribute("aria-expanded", String(open));
    if (open) {
      promptInput.setAttribute("aria-controls", mentionMenuId);
    } else {
      promptInput.removeAttribute("aria-controls");
    }
    if (open && options.length > 0) {
      promptInput.setAttribute(
        "aria-activedescendant",
        promptMentionOptionId(
          mentionMenuId,
          Math.min(activeMentionIndex, options.length - 1),
        ),
      );
    } else {
      promptInput.removeAttribute("aria-activedescendant");
    }
  }, [activeMentionIndex, mentionMenuId, open, options.length]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (
        mentionAnchorRef.current?.contains(target) ||
        quickMenuButtonRef.current?.contains(target) ||
        target.closest(".at-prompt-mention-menu") !== null
      ) {
        return;
      }
      setQuickMenuOpen(false);
      setDismissedMentionDraft(draft);
    };
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [draft, open]);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setQuickMenuOpen(false);
      setDismissedMentionDraft(draft);
      return;
    }
    if (options.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setActiveMentionIndex((current) =>
        wrapIndex(current + (event.key === "ArrowDown" ? 1 : -1), options.length),
      );
      return;
    }
    if (event.key === "PageDown" || event.key === "PageUp") {
      event.preventDefault();
      setActiveMentionIndex((current) =>
        clampIndex(
          current +
            (event.key === "PageDown" ? MENTION_PAGE_SIZE : -MENTION_PAGE_SIZE),
          options.length,
        ),
      );
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      setActiveMentionIndex(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      selectOption(options[Math.min(activeMentionIndex, options.length - 1)]);
      return;
    }
  }

  function selectOption(option: PromptMentionOption | undefined): void {
    if (option === undefined) {
      return;
    }
    if (option.kind === "action") {
      onAction(option);
      setQuickMenuOpen(false);
      inputRef.current?.focus();
      return;
    }
    if (option.kind === "command" || option.kind === "skill") {
      setSelectedPromptSkill(option.kind === "skill" ? option : null);
      setDraft((current) => {
        const context = promptCommandContext ?? getPromptCommandContext(current);
        return context === null
          ? `/${option.insertTerm} `
          : applyPromptCommandOption(current, context, option);
      });
    } else {
      if (option.kind === "role") {
        setSelectedPromptSkill(null);
      }
      setDraft((current) => {
        const context = promptResourceContext ?? getPromptResourceContext(current);
        return context === null
          ? `@${option.insertTerm} `
          : applyPromptMentionOption(current, context, option);
      });
    }
    setQuickMenuOpen(false);
    setDismissedMentionDraft("");
    inputRef.current?.focus();
  }

  return {
    activeIndex: activeMentionIndex,
    effectivePromptText:
      leadingRoleMention.roleId === null
        ? draft.trim()
        : leadingRoleMention.promptText,
    inputRef,
    hasLeadingMentionOptions: leadingMentionOptions.length > 0,
    leadingRoleMention,
    loading,
    mentionAnchorRef,
    mentionMenuId,
    open,
    options,
    promptCommandContext,
    promptResourceContext,
    quickMenuButtonRef,
    quickMenuOpen,
    selectedPromptSkill,
    setDismissedMentionDraft,
    setQuickMenuOpen,
    setSelectedPromptSkill,
    handleKeyDown,
    selectOption,
  };
}

function promptResourceResponseForMentions({
  currentResponse,
  query,
  queryClient,
  workspaceId,
}: {
  currentResponse: WorkspaceSearchResponse | undefined;
  query: string;
  queryClient: ReturnType<typeof useQueryClient>;
  workspaceId: string | null;
}): WorkspaceSearchResponse | undefined {
  if (currentResponse !== undefined && currentResponse.results.length > 0) {
    return currentResponse;
  }
  const safeWorkspaceId = workspaceId?.trim() ?? "";
  const safeQuery = query.trim();
  if (!safeWorkspaceId || !safeQuery) {
    return currentResponse;
  }
  const cachedResults = queryClient
    .getQueriesData<WorkspaceSearchResponse>({
      queryKey: ["workspaces", safeWorkspaceId, "prompt-resources"],
    })
    .flatMap(([, response]) => response?.results ?? []);
  const seen = new Set<string>();
  const results = cachedResults.filter((result) => {
    const key = `${result.kind}:${result.path.trim()}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return results.length === 0
    ? currentResponse
    : { query: safeQuery, results, workspace_id: safeWorkspaceId };
}

function clampIndex(index: number, length: number): number {
  return Math.max(0, Math.min(length - 1, index));
}

function wrapIndex(index: number, length: number): number {
  return length <= 0 ? 0 : ((index % length) + length) % length;
}
