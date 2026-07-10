import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { SessionRound, SessionRoundTodoItem } from "../api/contracts";
import { RoundRail } from "../features/timeline/RoundRail";
import { translate, type Translate } from "../i18n";

const t: Translate = (key, replacements) => translate("en", key, replacements);
const originalInnerWidth = window.innerWidth;
const originalInnerHeight = window.innerHeight;

afterEach(() => {
  cleanup();
  setViewportSize(originalInnerWidth, originalInnerHeight);
});

describe("RoundRail", () => {
  it("renders rounds in order, marks the active round, and selects by run id", () => {
    const onSelectRun = vi.fn();
    render(
      <RoundRail
        activeRunId="run-2"
        onSelectRun={onSelectRun}
        rounds={[
          round("run-1", "Inspect issue"),
          round("run-2", "Implement feature"),
          round("run-3", "Verify behavior"),
        ]}
        t={t}
      />,
    );

    const buttons = screen.getAllByRole("button");

    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("Inspect issue"),
      expect.stringContaining("Implement feature"),
      expect.stringContaining("Verify behavior"),
    ]);
    expect(buttons[1]).toHaveAttribute("aria-current", "step");

    fireEvent.click(screen.getByRole("button", {
      name: "Go to round 3: Verify behavior",
    }));

    expect(onSelectRun).toHaveBeenCalledWith("run-3");
  });

  it("preserves list scroll position across stable rerenders", () => {
    const rounds = [
      round("run-1", "Inspect issue"),
      round("run-2", "Implement feature"),
      round("run-3", "Verify behavior"),
    ];
    const { container, rerender } = render(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={rounds}
        t={t}
      />,
    );
    const list = container.querySelector<HTMLElement>(".at-round-rail-list");
    if (list === null) {
      throw new Error("Round rail list was not rendered.");
    }
    list.scrollTop = 96;

    rerender(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={rounds}
        t={t}
      />,
    );

    expect(screen.getByRole("button", { name: "Go to round 1: Inspect issue" }))
      .toHaveAttribute("aria-current", "step");
    expect(container.querySelector<HTMLElement>(".at-round-rail-list")?.scrollTop)
      .toBe(96);
  });

  it("updates a todo snapshot without replacing the rail list or active node", () => {
    const rounds = [
      round("run-1", "Inspect issue", [
        { content: "Initial task", status: "pending" },
        { content: "Verify branch", status: "pending" },
      ]),
      round("run-2", "Implement feature"),
    ];
    const { container, rerender } = render(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={rounds}
        t={t}
      />,
    );
    const list = requireElement(container, ".at-round-rail-list");
    const runNode = requireElement(container, ".at-round-rail-node");
    list.scrollTop = 112;
    setElementRect(runNode, { left: 600, top: 80, width: 120, height: 40 });

    fireEvent.mouseEnter(runNode);

    expect(screen.getByText("Initial task")).toBeVisible();
    expect(screen.getAllByText("Pending")).toHaveLength(2);

    rerender(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={[
          round("run-1", "Inspect issue", [
            { content: "Updated task", status: "completed" },
            { content: "Verify branch", status: "pending" },
          ]),
          round("run-2", "Implement feature"),
        ]}
        t={t}
      />,
    );

    expect(requireElement(container, ".at-round-rail-list")).toBe(list);
    expect(requireElement(container, ".at-round-rail-node")).toBe(runNode);
    expect(list.scrollTop).toBe(112);
    const updatedTask = screen.getByText("Updated task");
    expect(updatedTask).toBeVisible();
    expect(within(updatedTask.closest("li") as HTMLElement).getByText("Completed"))
      .toBeVisible();
    expect(screen.getByText("Verify branch")).toBeVisible();
  });

  it("opens a clamped detail popover with status metadata and todo labels", () => {
    setViewportSize(220, 180);
    const { container } = render(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={[
          {
            ...round("run-1", "Inspect issue", [
              { content: "Read the failing transcript", status: "in_progress" },
              { content: "Record exact replay deltas", status: "blocked" },
            ]),
            pending_tool_approval_count: 2,
            run_status: "running",
          },
        ]}
        t={t}
      />,
    );
    const runNode = requireElement(container, ".at-round-rail-node");
    setElementRect(runNode, { left: 120, top: 170, width: 128, height: 44 });

    fireEvent.mouseEnter(runNode);

    const detail = screen.getByLabelText("Round detail");
    expect(detail).toHaveClass("is-open");
    expect(detail).toHaveStyle({ left: "12px", top: "12px" });
    expect(within(detail).getByText("Running")).toBeVisible();
    expect(within(detail).getByText("2 pending approvals")).toBeVisible();
    expect(within(detail).getByText("Todo")).toBeVisible();
    expect(within(detail).getByText("2 items")).toBeVisible();
    expect(within(detail).getByText("Read the failing transcript")).toBeVisible();
    expect(within(detail).getByText("In progress")).toBeVisible();
    expect(within(detail).getByText("Record exact replay deltas")).toBeVisible();
    expect(within(detail).getByText("blocked")).toBeVisible();
  });

  it("keeps the detail open while focus moves inside it and closes on outside blur", () => {
    const { container } = render(
      <RoundRail
        activeRunId="run-1"
        onSelectRun={vi.fn()}
        rounds={[round("run-1", "Inspect issue")]}
        t={t}
      />,
    );
    const runNode = requireElement(container, ".at-round-rail-node");
    const button = screen.getByRole("button", {
      name: "Go to round 1: Inspect issue",
    });
    setElementRect(runNode, { left: 640, top: 40, width: 128, height: 44 });

    fireEvent.focus(runNode);
    expect(screen.getByLabelText("Round detail")).toHaveClass("is-open");

    fireEvent.blur(runNode, { relatedTarget: button });
    expect(screen.getByLabelText("Round detail")).toHaveClass("is-open");

    fireEvent.blur(runNode);
    expect(screen.getByLabelText("Round detail")).not.toHaveClass("is-open");
  });
});

function round(
  runId: string,
  title: string,
  todoItems: SessionRoundTodoItem[] = [],
): SessionRound {
  return {
    created_at: "2026-06-25T08:00:00Z",
    intent: title,
    intent_parts: [{ kind: "text", text: title }],
    run_id: runId,
    run_phase: "completed",
    run_status: "completed",
    run_user_message: title,
    todo: Array.isArray(todoItems)
      ? {
          items: todoItems,
          run_id: runId,
          session_id: "session-1",
        }
      : undefined,
    verification_status: "verified",
  };
}

function requireElement(container: HTMLElement, selector: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(selector);
  if (element === null) {
    throw new Error(`Missing element: ${selector}`);
  }
  return element;
}

function setElementRect(
  element: HTMLElement,
  rect: Pick<DOMRect, "height" | "left" | "top" | "width">,
): void {
  element.getBoundingClientRect = () => ({
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    toJSON: () => ({}),
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
  });
}

function setViewportSize(width: number, height: number): void {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
}
