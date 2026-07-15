import type {
  DetailsHTMLAttributes,
  MouseEvent,
  Ref,
  SyntheticEvent,
} from "react";
import { useLayoutEffect, useRef, useState } from "react";

interface TimelineDisclosureProps
  extends Omit<DetailsHTMLAttributes<HTMLDetailsElement>, "onToggle" | "open"> {
  disclosureId: string;
  elementRef?: Ref<HTMLDetailsElement>;
  expanded: boolean;
  forceOpen?: boolean;
  onExpandedChange: (disclosureId: string, expanded: boolean) => void;
  onToggle?: (event: SyntheticEvent<HTMLDetailsElement>) => void;
}

export function TimelineDisclosure({
  disclosureId,
  elementRef,
  expanded,
  forceOpen = false,
  onExpandedChange,
  onToggle,
  ...props
}: TimelineDisclosureProps) {
  const [forcedOpenOverride, setForcedOpenOverride] = useState<boolean | null>(
    null,
  );
  const wasForceOpenRef = useRef(forceOpen);
  const handingOffForcedState = wasForceOpenRef.current && !forceOpen;
  const forcedOpenState = forcedOpenOverride ?? true;
  const open = forceOpen || handingOffForcedState
    ? forcedOpenState
    : expanded;

  useLayoutEffect(() => {
    const wasForceOpen = wasForceOpenRef.current;
    wasForceOpenRef.current = forceOpen;
    if (wasForceOpen && !forceOpen) {
      onExpandedChange(disclosureId, forcedOpenState);
      if (forcedOpenOverride !== null) {
        setForcedOpenOverride(null);
      }
    }
  }, [
    disclosureId,
    forceOpen,
    forcedOpenOverride,
    forcedOpenState,
    onExpandedChange,
  ]);

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
      ref={elementRef}
    />
  );
}
