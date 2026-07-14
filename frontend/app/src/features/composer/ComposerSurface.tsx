import { Button, Popover, Tooltip, Typography } from "antd";
import { ChevronDown, Settings2 } from "lucide-react";
import type { FormEventHandler, KeyboardEventHandler, ReactNode } from "react";

interface ComposerSurfaceProps {
  actions: ReactNode;
  children: ReactNode;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLFormElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  toolbarStart: ReactNode;
}

interface ComposerRunSettingsPopoverProps {
  children: ReactNode;
  compactSummary: string;
  heading: string;
  summary: string;
}

export function ComposerSurface({
  actions,
  children,
  className,
  onKeyDown,
  onSubmit,
  toolbarStart,
}: ComposerSurfaceProps) {
  return (
    <form
      className={["at-composer", className].filter(Boolean).join(" ")}
      onKeyDown={onKeyDown}
      onSubmit={onSubmit}
    >
      <div className="at-composer-inner">
        {children}
        <div className="at-composer-controls">
          <div className="at-composer-toolbar-start">{toolbarStart}</div>
          <div className="at-composer-actions">{actions}</div>
        </div>
      </div>
    </form>
  );
}

export function ComposerRunSettingsPopover({
  children,
  compactSummary,
  heading,
  summary,
}: ComposerRunSettingsPopoverProps) {
  return (
    <Tooltip title={summary}>
      <Popover
        arrow={false}
        content={
          <div className="at-composer-advanced-panel at-composer-run-settings-panel">
            <div className="at-composer-advanced-heading">
              <Settings2 aria-hidden size={16} />
              <Typography.Text strong>{heading}</Typography.Text>
            </div>
            {children}
          </div>
        }
        overlayClassName="at-composer-advanced-popover"
        placement="topLeft"
        trigger="click"
      >
        <Button
          aria-label={`${heading}: ${summary}`}
          className="at-composer-summary-button at-composer-run-settings-summary"
          icon={<Settings2 size={15} />}
          size="small"
          type="text"
        >
          <span
            aria-hidden
            className="at-composer-summary-copy at-composer-summary-full"
          >
            {summary}
          </span>
          <span
            aria-hidden
            className="at-composer-summary-copy at-composer-summary-compact"
          >
            {compactSummary}
          </span>
          <ChevronDown aria-hidden size={13} />
        </Button>
      </Popover>
    </Tooltip>
  );
}
