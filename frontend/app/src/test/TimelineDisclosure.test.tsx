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

  it("hands the live open state to terminal controlled state without collapsing", () => {
    const onExpandedChange = vi.fn();
    const view = render(
      <TimelineDisclosure
        disclosureId="thinking:terminal-handoff"
        expanded={false}
        forceOpen
        onExpandedChange={onExpandedChange}
      >
        <summary>Streaming thought</summary>
        <div>Stable body</div>
      </TimelineDisclosure>,
    );
    const disclosure = screen.getByText("Streaming thought").closest("details");
    expect(disclosure).toHaveAttribute("open");

    view.rerender(
      <TimelineDisclosure
        disclosureId="thinking:terminal-handoff"
        expanded={false}
        forceOpen={false}
        onExpandedChange={onExpandedChange}
      >
        <summary>Streaming thought</summary>
        <div>Stable body</div>
      </TimelineDisclosure>,
    );

    expect(onExpandedChange).toHaveBeenCalledWith(
      "thinking:terminal-handoff",
      true,
    );
    expect(disclosure).toHaveAttribute("open");
  });

  it("preserves an explicit live collapse at terminal handoff", () => {
    const onExpandedChange = vi.fn();
    const view = render(
      <TimelineDisclosure
        disclosureId="thinking:collapsed-handoff"
        expanded={false}
        forceOpen
        onExpandedChange={onExpandedChange}
      >
        <summary>Collapsible thought</summary>
        <div>Stable body</div>
      </TimelineDisclosure>,
    );
    const summary = screen.getByText("Collapsible thought");
    const disclosure = summary.closest("details");
    fireEvent.click(summary);
    expect(disclosure).not.toHaveAttribute("open");
    onExpandedChange.mockClear();

    view.rerender(
      <TimelineDisclosure
        disclosureId="thinking:collapsed-handoff"
        expanded={false}
        forceOpen={false}
        onExpandedChange={onExpandedChange}
      >
        <summary>Collapsible thought</summary>
        <div>Stable body</div>
      </TimelineDisclosure>,
    );

    expect(onExpandedChange).toHaveBeenCalledWith(
      "thinking:collapsed-handoff",
      false,
    );
    expect(disclosure).not.toHaveAttribute("open");
  });
});
