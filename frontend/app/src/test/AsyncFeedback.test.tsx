import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import {
  AsyncRegion,
  DisclosureMotion,
  InlineLoading,
  RefreshingOverlay,
} from "../components/AsyncFeedback";

describe("async feedback", () => {
  it("marks a region busy without replacing its existing content", () => {
    const { rerender } = render(
      <AsyncRegion busy>
        <span>Existing data</span>
      </AsyncRegion>,
    );

    expect(screen.getByText("Existing data").parentElement).toHaveAttribute(
      "aria-busy",
      "true",
    );

    rerender(
      <AsyncRegion busy={false}>
        <span>Existing data</span>
      </AsyncRegion>,
    );
    expect(screen.getByText("Existing data").parentElement).toHaveAttribute(
      "aria-busy",
      "false",
    );
  });

  it("announces inline and background progress politely", () => {
    const { rerender } = render(
      <>
        <InlineLoading label="Loading records" />
        <RefreshingOverlay active label="Refreshing records" />
      </>,
    );

    expect(screen.getByText("Loading records").parentElement).toHaveAttribute(
      "role",
      "status",
    );
    expect(screen.getAllByRole("status")).toHaveLength(2);
    expect(screen.getByText("Refreshing records").parentElement).toHaveAttribute(
      "aria-live",
      "polite",
    );

    rerender(
      <>
        <InlineLoading label="Loading records" />
        <RefreshingOverlay active={false} label="Refreshing records" />
      </>,
    );
    expect(screen.queryByText("Refreshing records")).not.toBeInTheDocument();
  });

  it("keeps disclosure content mounted while removing it from interaction", () => {
    function DisclosureHarness() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen((current) => !current)} type="button">
            Toggle
          </button>
          <DisclosureMotion open={open}>
            <button type="button">Nested action</button>
          </DisclosureMotion>
        </>
      );
    }

    render(<DisclosureHarness />);
    const disclosure = screen.getByText("Nested action").parentElement?.parentElement;
    expect(disclosure).toHaveAttribute("aria-hidden", "true");
    expect(disclosure).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "Toggle" }));
    expect(disclosure).toHaveAttribute("aria-hidden", "false");
    expect(disclosure).not.toHaveAttribute("inert");
  });
});
