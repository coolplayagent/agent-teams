import type { PromptMentionOption } from "./PromptMentions";
import { useTranslations, type Translate } from "../../i18n";

interface PromptMentionMenuProps {
  activeIndex: number;
  onSelect: (option: PromptMentionOption) => void;
  options: PromptMentionOption[];
}

export function PromptMentionMenu({
  activeIndex,
  onSelect,
  options,
}: PromptMentionMenuProps) {
  const t = useTranslations();
  if (options.length === 0) {
    return null;
  }
  return (
    <div aria-label="Prompt suggestions" className="at-prompt-mention-menu">
      <div className="at-prompt-mention-menu-list" role="listbox">
        {options.map((option, index) => (
          <button
            aria-selected={index === activeIndex}
            className={
              index === activeIndex
                ? "at-prompt-mention-item is-active"
                : "at-prompt-mention-item"
            }
            key={promptMentionOptionKey(option)}
            onMouseDown={(event) => {
              event.preventDefault();
              onSelect(option);
            }}
            role="option"
            type="button"
          >
            <span className="at-prompt-mention-name-row">
              <span className="at-prompt-mention-name">
                {promptMentionPrefix(option)}
                {option.displayName}
              </span>
              {promptMentionKindLabel(option, t) ? (
                <span className="at-prompt-mention-kind">
                  {promptMentionKindLabel(option, t)}
                </span>
              ) : null}
            </span>
            {option.description ? (
              <span className="at-prompt-mention-description">
                {option.description}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
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
  return "";
}
