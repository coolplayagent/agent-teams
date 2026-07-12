import type {
  DetailsHTMLAttributes,
  MouseEvent,
  SyntheticEvent,
} from "react";
import { useEffect, useState } from "react";

interface TimelineDisclosureProps
  extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "onToggle" | "open"> {
  disclosureId: string;
  expanded: boolean;
  forceOpen?: boolean;
  onExpandedChange: (disclosureId: string, expanded: boolean) => void;
  onToggle?: (event: SyntheticEvent<HTMLDetailsElement>) => void;
}

export function TimelineDisclosure({
  disclosureId,
  expanded,
  forceOpen = false,
  onExpandedChange,
  onToggle,
  ...props
}: TimelineDisclosureProps) {
  const [forcedOpenOverride, setForcedOpenOverride] = useState<boolean | null>(
    null,
  );
  const open = forceOpen ? forcedOpenOverride ?? true : expanded;

  useEffect(() => {
    if (!forceOpen && forcedOpenOverride !== null) {
      setForcedOpenOverride(null);
    }
  }, [forceOpen, forcedOpenOverride]);

  const handleClick = (event: MouseEvent<HTMLDetailsElement>) => {
    if (!forceOpen || event.defaultPrevented) {
      return;
    }
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const summary = target.closest("summary");
    if (summary?.parentElement !== event.currentTarget) {
      return;
    }
    event.preventDefault();
    const nextExpanded = !open;
    setForcedOpenOverride(nextExpanded);
    onExpandedChange(disclosureId, nextExpanded);
  };

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextExpanded = event.currentTarget.open;
    if (!forceOpen) {
      onExpandedChange(disclosureId, nextExpanded);
    }
    onToggle?.(event);
  };

  return (
    <details
      {...props}
      onClick={handleClick}
      open={open}
      onToggle={handleToggle}
    />
  );
}
