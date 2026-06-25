import type { PromptMentionOption } from "./PromptMentions";

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
            <span className="at-prompt-mention-name">
              {option.kind === "command" ? "/" : "@"}
              {option.displayName}
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
  return option.kind === "command"
    ? `command:${option.commandName}`
    : `role:${option.roleId}`;
}
