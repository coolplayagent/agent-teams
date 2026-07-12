import { LoaderCircle } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";

import "./ChoiceControl.css";

export type ChoiceControlKind = "checkbox" | "radio" | "switch";
export type ChoiceControlVariant = "plain" | "chip" | "row";

export interface ChoiceControlProps {
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

export type FormChoiceControlProps = Omit<
  ChoiceControlProps,
  "checked" | "onChange"
> & {
  checked?: boolean;
  onChange?: ChoiceControlProps["onChange"];
};

export interface ChoiceControlGroupOption {
  description?: ReactNode;
  disabled?: boolean;
  label: ReactNode;
  value: string;
}

export interface ChoiceControlGroupProps {
  disabled?: boolean;
  onChange?: (values: string[]) => void;
  options: ChoiceControlGroupOption[];
  value?: string[];
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
        onKeyDown={(event) => {
          if (event.key !== "Enter" || isDisabled) {
            return;
          }
          event.preventDefault();
          inputRef.current?.click();
        }}
        ref={inputRef}
        role={kind === "switch" ? "switch" : undefined}
        type={kind === "radio" ? "radio" : "checkbox"}
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

export function FormChoiceControl({
  checked = false,
  onChange = () => undefined,
  ...props
}: FormChoiceControlProps) {
  return <ChoiceControl checked={checked} onChange={onChange} {...props} />;
}

export function ChoiceControlGroup({
  disabled = false,
  onChange = () => undefined,
  options,
  value = [],
}: ChoiceControlGroupProps) {
  return (
    <div className="at-choice-control-group" role="group">
      {options.map((option) => {
        const checked = value.includes(option.value);
        return (
          <ChoiceControl
            checked={checked}
            description={option.description}
            disabled={disabled || option.disabled}
            key={option.value}
            label={option.label}
            onChange={(nextChecked) => {
              onChange(
                nextChecked
                  ? Array.from(new Set([...value, option.value]))
                  : value.filter((entry) => entry !== option.value),
              );
            }}
            value={option.value}
            variant="chip"
          />
        );
      })}
    </div>
  );
}
