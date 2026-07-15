import { Spin } from "antd";
import type { ReactNode } from "react";

interface AsyncRegionProps {
  busy: boolean;
  children: ReactNode;
  className?: string;
}

export function AsyncRegion({ busy, children, className }: AsyncRegionProps) {
  return (
    <div
      aria-busy={busy}
      className={joinClassNames("at-async-region", className)}
      data-busy={busy ? "true" : "false"}
    >
      {children}
    </div>
  );
}

interface InlineLoadingProps {
  className?: string;
  label: string;
}

export function InlineLoading({ className, label }: InlineLoadingProps) {
  return (
    <div
      aria-live="polite"
      className={joinClassNames("at-inline-loading", className)}
      role="status"
    >
      <Spin aria-hidden="true" size="small" />
      <span>{label}</span>
    </div>
  );
}

interface RefreshingOverlayProps {
  active: boolean;
  label: string;
}

export function RefreshingOverlay({ active, label }: RefreshingOverlayProps) {
  if (!active) {
    return null;
  }
  return (
    <div aria-live="polite" className="at-refreshing-overlay" role="status">
      <Spin aria-hidden="true" size="small" />
      <span>{label}</span>
    </div>
  );
}

interface DisclosureMotionProps {
  children: ReactNode;
  className?: string;
  open: boolean;
}

export function DisclosureMotion({
  children,
  className,
  open,
}: DisclosureMotionProps) {
  return (
    <div
      aria-hidden={!open}
      className={joinClassNames("at-disclosure-motion", className)}
      data-open={open ? "true" : "false"}
      inert={open ? undefined : true}
    >
      <div className="at-disclosure-motion-inner">{children}</div>
    </div>
  );
}

function joinClassNames(base: string, extra: string | undefined): string {
  return extra === undefined || extra.trim() === "" ? base : `${base} ${extra}`;
}
