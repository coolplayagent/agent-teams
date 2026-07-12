import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TimelineDisclosure } from "../features/timeline/TimelineDisclosure";

describe("TimelineDisclosure", () => {
  it("lets each forced-open streaming block be collapsed independently", () => {
    const onExpandedChange = vi.fn();
    render(
      <>
        <TimelineDisclosure
          disclosureId="thinking:first"
          expanded={false}
          forceOpen
          onExpandedChange={onExpandedChange}
        >
          <summary>First thinking block</summary>
          <div>First body</div>
        </TimelineDisclosure>
        <TimelineDisclosure
          disclosureId="thinking:second"
          expanded={false}
          forceOpen
          onExpandedChange={onExpandedChange}
        >
          <summary>Second thinking block</summary>
          <div>Second body</div>
        </TimelineDisclosure>
      </>,
    );

    const first = screen.getByText("First thinking block").closest("details");
    const second = screen.getByText("Second thinking block").closest("details");
    expect(first).toHaveAttribute("open");
    expect(second).toHaveAttribute("open");

    fireEvent.click(screen.getByText("First thinking block"));

    expect(onExpandedChange).toHaveBeenCalledWith("thinking:first", false);
    expect(first).not.toHaveAttribute("open");
    expect(second).toHaveAttribute("open");
  });
});
