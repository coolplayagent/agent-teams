import { createPortal } from "react-dom";
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
  onSelect,
  open,
  options,
}: PromptMentionMenuProps) {
  const t = useTranslations();
  const menuId = useId();
  const activeOptionRef = useRef<HTMLButtonElement | null>(null);
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
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updatePosition);
    resizeObserver?.observe(anchor);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [anchorRef, open]);

  useEffect(() => {
    const activeOption = activeOptionRef.current;
    if (activeOption !== null && typeof activeOption.scrollIntoView === "function") {
      activeOption.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, options, position]);

  if (!open || position === null) {
    return null;
  }
  const activeOptionId =
    options.length > 0
      ? `${menuId}-${Math.min(activeIndex, options.length - 1)}`
      : undefined;
  const menuStyle: CSSProperties = position;
  return createPortal(
    <div
      aria-label="Prompt suggestions"
      className="at-prompt-mention-menu"
      style={menuStyle}
    >
      {options.length > 0 ? (
        <div
          aria-activedescendant={activeOptionId}
          aria-busy={loading}
          className="at-prompt-mention-menu-list"
          role="listbox"
        >
          {options.map((option, index) => {
            const isActive = index === activeIndex;
            return (
              <button
                aria-selected={isActive}
                className={
                  isActive
                    ? "at-prompt-mention-item is-active"
                    : "at-prompt-mention-item"
                }
                id={`${menuId}-${index}`}
                key={promptMentionOptionKey(option)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  onSelect(option);
                }}
                ref={isActive ? activeOptionRef : undefined}
                role="option"
                type="button"
              >
                <span className="at-prompt-mention-name-row">
                  <span className="at-prompt-mention-name">
                    {promptMentionPrefix(option)}
                    {option.displayName}
                  </span>
                  <span className="at-prompt-mention-kind">
                    {promptMentionKindLabel(option, t)}
                  </span>
                </span>
                {option.description ? (
                  <span className="at-prompt-mention-description">
                    {option.description}
                  </span>
                ) : null}
              </button>
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

function promptMentionPrefix(option: PromptMentionOption): "/" | "@" {
  return option.kind === "command" || option.kind === "skill" ? "/" : "@";
}

function promptMentionKindLabel(
  option: PromptMentionOption,
  t: Translate,
): string {
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
