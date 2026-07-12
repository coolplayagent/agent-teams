import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { Form } from "antd";

import {
  ChoiceControl,
  ChoiceControlGroup,
  FormChoiceControl,
} from "../components/ChoiceControl";

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

    const input = screen.getByRole("switch", { name: "Diagnostics" });
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

  it("supports radio semantics and Enter in addition to native Space activation", () => {
    function Fixture() {
      const [selected, setSelected] = useState("compact");
      return (
        <>
          <ChoiceControl
            checked={selected === "compact"}
            kind="radio"
            label="Compact"
            name="density"
            onChange={() => setSelected("compact")}
            value="compact"
          />
          <ChoiceControl
            checked={selected === "comfortable"}
            kind="radio"
            label="Comfortable"
            name="density"
            onChange={() => setSelected("comfortable")}
            value="comfortable"
          />
        </>
      );
    }

    render(<Fixture />);
    const compact = screen.getByRole("radio", { name: "Compact" });
    const comfortable = screen.getByRole("radio", { name: "Comfortable" });

    expect(compact).toBeChecked();
    comfortable.focus();
    fireEvent.keyDown(comfortable, { key: "Enter" });
    expect(comfortable).toBeChecked();
    expect(compact).not.toBeChecked();
  });

  it("does not activate a disabled control with Enter", () => {
    const onChange = vi.fn();
    render(
      <ChoiceControl
        checked={false}
        disabled
        label="Unavailable"
        onChange={onChange}
      />,
    );

    fireEvent.keyDown(screen.getByRole("checkbox", { name: "Unavailable" }), {
      key: "Enter",
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("binds the reusable form adapter without a hidden duplicate label", () => {
    function Fixture() {
      const [form] = Form.useForm<{ enabled: boolean }>();
      return (
        <Form form={form} initialValues={{ enabled: false }}>
          <Form.Item name="enabled" valuePropName="checked">
            <FormChoiceControl
              kind="switch"
              label="Enable notifications"
              variant="row"
            />
          </Form.Item>
        </Form>
      );
    }

    render(<Fixture />);
    const input = screen.getByRole("switch", { name: "Enable notifications" });
    fireEvent.click(screen.getByText("Enable notifications"));
    expect(input).toBeChecked();
  });

  it("updates a compact checkbox group from its visible option labels", () => {
    function Fixture() {
      const [value, setValue] = useState<string[]>(["started"]);
      return (
        <ChoiceControlGroup
          onChange={setValue}
          options={[
            { label: "Started", value: "started" },
            { label: "Completed", value: "completed" },
          ]}
          value={value}
        />
      );
    }

    render(<Fixture />);
    fireEvent.click(screen.getByText("Completed"));
    expect(screen.getByRole("checkbox", { name: "Completed" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Started" })).toBeChecked();
  });
});
