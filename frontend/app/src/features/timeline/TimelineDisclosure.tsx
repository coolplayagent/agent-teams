import type {
  DetailsHTMLAttributes,
  SyntheticEvent,
} from "react";

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
  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (!forceOpen) {
      onExpandedChange(disclosureId, event.currentTarget.open);
    }
    onToggle?.(event);
  };

  return (
    <details
      {...props}
      open={forceOpen || expanded}
      onToggle={handleToggle}
    />
  );
}
