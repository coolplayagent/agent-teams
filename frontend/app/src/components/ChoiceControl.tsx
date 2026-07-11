import { LoaderCircle } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";

import "./ChoiceControl.css";

export type ChoiceControlKind = "checkbox" | "switch";
export type ChoiceControlVariant = "plain" | "chip";

interface ChoiceControlProps {
  ariaLabel?: string;
  checked: boolean;
  className?: string;
  description?: ReactNode;
  disabled?: boolean;
  indeterminate?: boolean;
  invalid?: boolean;
  kind?: ChoiceControlKind;
  label: ReactNode;
  loading?: boolean;
  name?: string;
  onChange: (checked: boolean, event: ChangeEvent<HTMLInputElement>) => void;
  value?: string;
  variant?: ChoiceControlVariant;
}

export function ChoiceControl({
  ariaLabel,
  checked,
  className,
  description,
  disabled = false,
  indeterminate = false,
  invalid = false,
  kind = "checkbox",
  label,
  loading = false,
  name,
  onChange,
  value,
  variant = "plain",
}: ChoiceControlProps) {
  const labelId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const isDisabled = disabled || loading;

  useEffect(() => {
    if (inputRef.current !== null) {
      inputRef.current.indeterminate = kind === "checkbox" && indeterminate;
    }
  }, [indeterminate, kind]);

  return (
    <label
      className={[
        "at-choice-control",
        `is-${kind}`,
        `is-${variant}`,
        checked ? "is-checked" : "is-unchecked",
        indeterminate ? "is-indeterminate" : "",
        invalid ? "is-invalid" : "",
        loading ? "is-loading" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-state={indeterminate ? "indeterminate" : checked ? "checked" : "unchecked"}
    >
      <input
        aria-describedby={description === undefined ? undefined : descriptionId}
        aria-invalid={invalid || undefined}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel === undefined ? labelId : undefined}
        checked={checked}
        className="at-choice-control-input"
        disabled={isDisabled}
        name={name}
        onChange={(event) => onChange(event.target.checked, event)}
        ref={inputRef}
        role={kind === "switch" ? "switch" : undefined}
        type="checkbox"
        value={value}
      />
      <span className="at-choice-control-indicator" aria-hidden="true">
        {loading ? <LoaderCircle className="at-choice-control-spinner" size={13} /> : null}
      </span>
      <span className="at-choice-control-copy">
        <span className="at-choice-control-label" id={labelId}>
          {label}
        </span>
        {description === undefined ? null : (
          <span className="at-choice-control-description" id={descriptionId}>
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
