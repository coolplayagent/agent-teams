import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkdownMessage } from "../features/timeline/MarkdownMessage";

describe("MarkdownMessage", () => {
  it("keeps a completed markdown tree mounted when its text is unchanged", () => {
    const { container, rerender } = render(
      <MarkdownMessage text="Live **answer**" />,
    );
    const markdownContainer = container.querySelector(".at-message-markdown");
    const paragraph = markdownContainer?.querySelector("p");
    expect(markdownContainer).not.toBeNull();
    expect(paragraph).not.toBeNull();

    rerender(<MarkdownMessage text="Live **answer**" />);

    expect(container.querySelector(".at-message-markdown")).toBe(markdownContainer);
    expect(markdownContainer?.querySelector("p")).toBe(paragraph);
    expect(markdownContainer?.querySelector("strong")).toHaveTextContent("answer");
  });

  it("keeps terminal markdown soft breaks in the same text node", () => {
    const { container } = render(
      <MarkdownMessage text={"LINE_001\nLINE_002"} />,
    );

    expect(container.querySelector(".at-message-markdown > p")?.textContent)
      .toBe("LINE_001\nLINE_002");
    expect(container.querySelectorAll(".at-message-markdown > p")).toHaveLength(1);
  });

  it("updates one plain text node for every live delta without parsing markdown or GFM", () => {
    const { container, rerender } = render(
      <MarkdownMessage streaming text="chunk 1 **literal**" />,
    );
    const markdownContainer = container.querySelector(".at-message-markdown");
    const liveText = container.querySelector(".at-message-streaming-plain");
    const liveTextNode = liveText?.firstChild;

    rerender(
      <MarkdownMessage
        streaming
        text={"chunk 1 **literal**\n\n| A | B |\n| - | - |\n| 1 | 2 |"}
      />,
    );

    expect(container.querySelector(".at-message-markdown")).toBe(markdownContainer);
    expect(container.querySelector(".at-message-streaming-plain")).toBe(liveText);
    expect(liveText?.firstChild).toBe(liveTextNode);
    expect(liveText).toHaveTextContent("**literal**");
    expect(container.querySelector("strong")).toBeNull();
    expect(container.querySelector("table")).toBeNull();
  });

  it("upgrades the stable render surface to terminal markdown without moving its scroll owner", () => {
    const text = "complete **answer**";
    const { container, rerender } = render(
      <div data-testid="scroll-owner">
        <MarkdownMessage streaming text={text} />
      </div>,
    );
    const scrollOwner = container.querySelector<HTMLElement>("[data-testid='scroll-owner']");
    const markdownContainer = container.querySelector(".at-message-markdown");
    if (scrollOwner === null) {
      throw new Error("Expected the test scroll owner.");
    }
    scrollOwner.scrollTop = 137;

    rerender(
      <div data-testid="scroll-owner">
        <MarkdownMessage text={text} />
      </div>,
    );

    expect(container.querySelector(".at-message-markdown")).toBe(markdownContainer);
    expect(container.querySelector(".at-message-streaming-plain")).toBeNull();
    expect(container.querySelector("strong")).toHaveTextContent("answer");
    expect(scrollOwner.scrollTop).toBe(137);
  });

  it("creates and highlights code markup only after the stream settles", () => {
    const code = "```typescript\nconst answer = 42;\n```";
    const { container, rerender } = render(
      <MarkdownMessage streaming text={code} />,
    );

    expect(container.querySelector("pre")).toBeNull();
    expect(container.querySelector("code")).toBeNull();

    rerender(<MarkdownMessage text={code} />);

    expect(container.querySelector("pre")).not.toBeNull();
    expect(container.querySelector("code")).toHaveClass("hljs");
  });

  it("renders a large live delta synchronously without timer-backed staging", () => {
    const firstText = `# Result\n\n${"A".repeat(80_000)}`;
    const secondText = `${firstText} visible-now`;
    const { container, rerender } = render(
      <MarkdownMessage streaming text={firstText} />,
    );

    rerender(<MarkdownMessage streaming text={secondText} />);

    expect(container).toHaveTextContent("visible-now");
    expect(container.querySelector(".at-message-streaming-tail")).toBeNull();
    expect(container.querySelector("h1")).toBeNull();
  });

  it("reports row size through ResizeObserver without synchronous layout reads", () => {
    const resizeTimelineRow = vi.fn();
    const offsetHeight = vi.spyOn(HTMLElement.prototype, "offsetHeight", "get")
      .mockImplementation(() => {
        throw new Error("offsetHeight must not be read while streaming");
      });
    const getBoundingClientRect = vi.spyOn(
      HTMLElement.prototype,
      "getBoundingClientRect",
    ).mockImplementation(() => {
      throw new Error("getBoundingClientRect must not be read while streaming");
    });
    class TestResizeObserver {
      constructor(private readonly callback: ResizeObserverCallback) {}

      disconnect(): void {}

      observe(target: Element): void {
        this.callback([{
          borderBoxSize: [{ blockSize: 144, inlineSize: 640 }],
          contentBoxSize: [{ blockSize: 140, inlineSize: 636 }],
          contentRect: { height: 140 },
          devicePixelContentBoxSize: [],
          target,
        } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
      }

      unobserve(): void {}
    }
    vi.stubGlobal("ResizeObserver", TestResizeObserver);

    try {
      render(
        <article className="at-timeline-row" data-index="7">
          <MarkdownMessage
            resizeTimelineRow={resizeTimelineRow}
            streaming
            text="live **literal markdown**"
          />
        </article>,
      );

      expect(resizeTimelineRow).toHaveBeenCalledWith(7, 144);
      expect(offsetHeight).not.toHaveBeenCalled();
      expect(getBoundingClientRect).not.toHaveBeenCalled();
    } finally {
      offsetHeight.mockRestore();
      getBoundingClientRect.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
