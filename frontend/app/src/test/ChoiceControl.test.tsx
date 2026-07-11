import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { ChoiceControl } from "../components/ChoiceControl";

describe("ChoiceControl", () => {
  it("toggles when its visible label is clicked", () => {
    function Fixture() {
      const [checked, setChecked] = useState(false);
      return (
        <ChoiceControl
          checked={checked}
          label="Allow shell"
          onChange={setChecked}
        />
      );
    }

    render(<Fixture />);
    const input = screen.getByRole("checkbox", { name: "Allow shell" });

    fireEvent.click(screen.getByText("Allow shell"));

    expect(input).toBeChecked();
  });

  it("exposes descriptions, invalid state, and switch semantics to the input", () => {
    render(
      <ChoiceControl
        checked
        description="Applies immediately"
        invalid
        kind="switch"
        label="Diagnostics"
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByRole("checkbox", { name: "Diagnostics" });
    expect(input).toBeChecked();
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Applies immediately");
    expect(input.closest("label")).toHaveClass("is-switch", "is-checked");
  });

  it("sets the native indeterminate property and blocks loading interactions", () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ChoiceControl
        checked={false}
        indeterminate
        label="Select results"
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("checkbox", { name: "Select results" });
    expect(input).toBePartiallyChecked();

    rerender(
      <ChoiceControl
        checked={false}
        label="Select results"
        loading
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByText("Select results"));
    expect(input).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
