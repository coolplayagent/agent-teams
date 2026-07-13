import { createPortal } from "react-dom";
import {
  AtSign,
  Brain,
  FileText,
  FolderSearch,
  Paperclip,
  Terminal,
  Users,
  Workflow,
} from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from "react";

import type { PromptMentionOption } from "./PromptMentions";
import { useTranslations, type Translate } from "../../i18n";

interface PromptMentionMenuProps {
  activeIndex: number;
  anchorRef: RefObject<HTMLElement | null>;
  emptyLabel: string;
  loading: boolean;
  loadingLabel: string;
  menuId?: string;
  menuLabel?: string;
  onSelect: (option: PromptMentionOption) => void;
  open: boolean;
  options: PromptMentionOption[];
}

interface PromptMentionMenuPosition {
  bottom: number;
  left: number;
  maxHeight: number;
  width: number;
}

export function PromptMentionMenu({
  activeIndex,
  anchorRef,
  emptyLabel,
  loading,
  loadingLabel,
  menuId: providedMenuId,
  menuLabel = "Prompt suggestions",
  onSelect,
  open,
  options,
}: PromptMentionMenuProps) {
  const t = useTranslations();
  const generatedMenuId = useId();
  const menuId = providedMenuId ?? generatedMenuId;
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PromptMentionMenuPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const anchor = anchorRef.current;
    if (anchor === null) {
      return;
    }
    const updatePosition = () => {
      setPosition(promptMentionMenuPosition(anchor.getBoundingClientRect()));
    };
    updatePosition();
    const handleScroll = (event: Event) => {
      const target = event.target;
      if (
        target instanceof Node &&
        listRef.current !== null &&
        listRef.current.contains(target)
      ) {
        return;
      }
      updatePosition();
    };
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", handleScroll, true);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    resizeObserver?.observe(anchor);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    const activeOption = activeOptionRef.current;
    if (activeOption !== null && typeof activeOption.scrollIntoView === "function") {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, options, position]);

  useEffect(() => {
    const list = listRef.current;
    if (!open || list === null) {
      return;
    }
    const handleWheel = (event: WheelEvent) => {
      handlePromptMentionWheel(event, list);
    };
    list.addEventListener("wheel", handleWheel, { passive: false });
    return () => list.removeEventListener("wheel", handleWheel);
  }, [open, options.length, position]);

  if (!open || position === null) {
    return null;
  }
  const activeOptionId =
    options.length > 0
      ? promptMentionOptionId(menuId, Math.min(activeIndex, options.length - 1))
      : undefined;
  const menuStyle: CSSProperties = position;
  return createPortal(
    <div
      aria-label={menuLabel}
      className="at-prompt-mention-menu"
      style={menuStyle}
    >
      {options.length > 0 ? (
        <div
          aria-activedescendant={activeOptionId}
          aria-busy={loading}
          className="at-prompt-mention-menu-list"
          id={menuId}
          onTouchMove={(event) => event.stopPropagation()}
          ref={listRef}
          role="listbox"
        >
          {options.map((option, index) => {
            const isActive = index === activeIndex;
            const showGroup =
              index === 0 || promptMentionGroup(options[index - 1]) !== promptMentionGroup(option);
            return (
              <div className="at-prompt-mention-option-group" key={promptMentionOptionKey(option)}>
                {showGroup ? (
                  <div className="at-prompt-mention-group-label">
                    {promptMentionGroupLabel(option, t)}
                  </div>
                ) : null}
                <button
                  aria-selected={isActive}
                  className={
                    isActive
                      ? "at-prompt-mention-item is-active"
                      : "at-prompt-mention-item"
                  }
                  id={promptMentionOptionId(menuId, index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(option);
                  }}
                  ref={isActive ? activeOptionRef : undefined}
                  role="option"
                  type="button"
                >
                  <span aria-hidden className="at-prompt-mention-icon">
                    {promptMentionIcon(option)}
                  </span>
                  <span className="at-prompt-mention-name">
                    {promptMentionPrefix(option)}
                    {option.displayName}
                  </span>
                  <span
                    className="at-prompt-mention-description"
                    title={option.description}
                  >
                    {option.description}
                  </span>
                  <span className="at-prompt-mention-kind">
                    {promptMentionKindLabel(option, t)}
                  </span>
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div
          aria-live="polite"
          className="at-prompt-mention-state"
          role="status"
        >
          {loading ? loadingLabel : emptyLabel}
        </div>
      )}
    </div>,
    document.body,
  );
}

export function promptMentionOptionId(menuId: string, index: number): string {
  return `${menuId}-option-${index}`;
}

function handlePromptMentionWheel(event: WheelEvent, list: HTMLDivElement) {
  if (event.deltaY === 0) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const lineHeight = 20;
  const pageHeight = Math.max(1, list.clientHeight);
  const delta = event.deltaMode === 1
    ? event.deltaY * lineHeight
    : event.deltaMode === 2
      ? event.deltaY * pageHeight
      : event.deltaY;
  list.scrollTop += delta;
}

function promptMentionMenuPosition(
  anchorRect: DOMRect,
): PromptMentionMenuPosition {
  const viewportWidth = document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
  const viewportPadding = 12;
  const anchorGap = 8;
  const width = Math.max(
    0,
    Math.min(640, anchorRect.width, viewportWidth - viewportPadding * 2),
  );
  const left = Math.min(
    Math.max(viewportPadding, anchorRect.left),
    Math.max(viewportPadding, viewportWidth - viewportPadding - width),
  );
  return {
    bottom: Math.max(viewportPadding, viewportHeight - anchorRect.top + anchorGap),
    left,
    maxHeight: Math.max(
      80,
      Math.min(320, anchorRect.top - anchorGap - viewportPadding),
    ),
    width,
  };
}

function promptMentionOptionKey(option: PromptMentionOption): string {
  if (option.kind === "action") {
    return `action:${option.actionId}`;
  }
  if (option.kind === "command") {
    return `command:${option.commandName}`;
  }
  if (option.kind === "skill") {
    return `skill:${option.skillRef}`;
  }
  if (option.kind === "resource") {
    return `resource:${option.path}`;
  }
  return `role:${option.roleId}`;
}

function promptMentionPrefix(option: PromptMentionOption): "/" | "@" | "" {
  if (option.kind === "action") {
    return "";
  }
  return option.kind === "command" || option.kind === "skill" ? "/" : "@";
}

function promptMentionKindLabel(
  option: PromptMentionOption,
  t: Translate,
): string {
  if (option.kind === "action") {
    return t("connectorsColumnActions");
  }
  if (option.kind === "command") {
    return t("composerMentionCommand");
  }
  if (option.kind === "skill") {
    return t("composerMentionSkill");
  }
  if (option.kind === "resource") {
    return option.resourceKind === "directory"
      ? t("automationWorkspaceRoot")
      : t("settingsRoleFile");
  }
  return t("composerRole");
}

function promptMentionGroup(option: PromptMentionOption): string {
  if (option.kind === "action") {
    return "action";
  }
  if (option.kind === "command") {
    return "command";
  }
  if (option.kind === "skill") {
    return "skill";
  }
  if (option.kind === "resource") {
    return "resource";
  }
  return "role";
}

function promptMentionGroupLabel(option: PromptMentionOption, t: Translate): string {
  const group = promptMentionGroup(option);
  if (group === "action") {
    return t("connectorsColumnActions");
  }
  if (group === "command") {
    return t("composerMentionCommand");
  }
  if (group === "skill") {
    return t("composerMentionSkill");
  }
  if (group === "resource") {
    return t("composerMentionResource");
  }
  return t("composerMentionTarget");
}

function promptMentionIcon(option: PromptMentionOption) {
  if (option.kind === "action") {
    if (option.actionId === "attach-image") {
      return <Paperclip size={15} />;
    }
    if (option.actionId === "browse-workspace") {
      return <FolderSearch size={15} />;
    }
    if (option.actionId === "toggle-thinking") {
      return <Brain size={15} />;
    }
    return option.actionId === "use-orchestration-mode" ? (
      <Workflow size={15} />
    ) : (
      <Users size={15} />
    );
  }
  if (option.kind === "command") {
    return <Terminal size={15} />;
  }
  if (option.kind === "skill") {
    return <Workflow size={15} />;
  }
  if (option.kind === "resource") {
    return <FileText size={15} />;
  }
  return <AtSign size={15} />;
}
