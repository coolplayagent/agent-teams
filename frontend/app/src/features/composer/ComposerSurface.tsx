import type { FormEventHandler, KeyboardEventHandler, ReactNode } from "react";

interface ComposerSurfaceProps {
  actions: ReactNode;
  children: ReactNode;
  className?: string;
  onKeyDown?: KeyboardEventHandler<HTMLFormElement>;
  onSubmit: FormEventHandler<HTMLFormElement>;
  toolbarStart: ReactNode;
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
