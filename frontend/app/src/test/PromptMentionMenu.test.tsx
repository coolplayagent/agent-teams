import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ensurePromptMentionOptionVisible,
  PromptMentionMenu,
} from "../features/composer/PromptMentionMenu";
import type { PromptMentionOption } from "../features/composer/PromptMentions";
import { useUiStore } from "../runtime/uiStore";

const options: PromptMentionOption[] = [
  {
    actionId: "attach-image",
    aliases: ["image"],
    description: "Attach an image.",
    displayName: "Add image",
    insertTerm: "",
    kind: "action",
  },
  {
    aliases: ["review"],
    commandName: "review",
    description: "Review the current changes without expanding the full prompt.",
    displayName: "review",
    insertTerm: "review",
    kind: "command",
  },
  {
    aliases: ["Composer.tsx"],
    description: "frontend/app/src/features/composer/Composer.tsx",
    displayName: "Composer.tsx",
    insertTerm: "frontend/app/src/features/composer/Composer.tsx",
    kind: "resource",
    path: "frontend/app/src/features/composer/Composer.tsx",
    resourceKind: "file",
  },
  {
    aliases: ["Writer"],
    description: "Writes concise release notes.",
    displayName: "Writer",
    insertTerm: "Writer",
    kind: "role",
    roleId: "Writer",
  },
];

beforeEach(() => {
  useUiStore.setState({ language: "en" });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    bottom: 656,
    height: 56,
    left: 100,
    right: 1000,
    top: 600,
    width: 900,
    x: 100,
    y: 600,
    toJSON: () => ({}),
  });
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1100,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 800,
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PromptMentionMenu", () => {
  it("portals an upward-anchored bounded menu and scrolls the active option", async () => {
    const onSelect = vi.fn();
    const view = render(
      <MenuHarness activeIndex={0} onSelect={onSelect} options={options} />,
    );

    const menu = await screen.findByLabelText("Prompt suggestions");
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveStyle({
      bottom: "208px",
      left: "100px",
      maxHeight: "320px",
      width: "640px",
    });
    expect(screen.getAllByText("Command")).not.toHaveLength(0);
    expect(screen.getAllByText("Actions")).not.toHaveLength(0);
    expect(screen.getByText("File")).toBeVisible();
    expect(screen.getAllByText("Role")).not.toHaveLength(0);
    const commandOption = screen.getByRole("option", { name: /review/ });
    expect(commandOption.children).toHaveLength(4);
    expect(commandOption.querySelector(".at-prompt-mention-name"))
      .toHaveTextContent("/review");
    expect(commandOption.querySelector(".at-prompt-mention-description"))
      .toHaveAttribute(
        "title",
        "Review the current changes without expanding the full prompt.",
      );
    expect(commandOption.querySelector(".at-prompt-mention-kind"))
      .toHaveTextContent("Command");

    view.rerender(
      <MenuHarness activeIndex={3} onSelect={onSelect} options={options} />,
    );
    await waitFor(() =>
      expect(screen.getByRole("option", { name: /@Writer/ }))
        .toHaveAttribute("aria-selected", "true"),
    );

    fireEvent.mouseDown(screen.getByRole("option", { name: /@Writer/ }));
    expect(onSelect).toHaveBeenCalledWith(options[3]);
  });

  it("announces loading and empty states without rendering an empty listbox", async () => {
    const view = render(
      <MenuHarness
        activeIndex={0}
        emptyLabel="No matching commands."
        loading
        loadingLabel="Loading"
        options={[]}
      />,
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    view.rerender(
      <MenuHarness
        activeIndex={0}
        emptyLabel="No matching commands."
        loading={false}
        loadingLabel="Loading"
        options={[]}
      />,
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "No matching commands.",
    );
  });

  it("keeps long suggestion lists as the wheel scroll owner", async () => {
    const longOptions: PromptMentionOption[] = Array.from(
      { length: 40 },
      (_, index) => ({
        aliases: [`role-${index}`],
        description: `Role ${index} description`,
        displayName: `Role ${index}`,
        insertTerm: `role-${index}`,
        kind: "role" as const,
        roleId: `role-${index}`,
      }),
    );
    const outerWheel = vi.fn();
    render(
      <div onWheel={outerWheel}>
        <MenuHarness activeIndex={0} options={longOptions} />
      </div>,
    );

    const listbox = await screen.findByRole("listbox");
    Object.defineProperties(listbox, {
      clientHeight: { configurable: true, value: 240 },
      scrollHeight: { configurable: true, value: 1600 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });

    fireEvent.wheel(listbox, { deltaMode: 0, deltaY: 125 });
    expect(listbox.scrollTop).toBe(125);
    expect(outerWheel).not.toHaveBeenCalled();

    fireEvent.wheel(listbox, { deltaMode: 1, deltaY: 2 });
    expect(listbox.scrollTop).toBe(165);
    expect(outerWheel).not.toHaveBeenCalled();

    fireEvent.wheel(listbox, { deltaMode: 2, deltaY: 1 });
    expect(listbox.scrollTop).toBe(405);
    expect(outerWheel).not.toHaveBeenCalled();
  });

  it("does not reposition the active option when its own list scrolls", async () => {
    render(
      <MenuHarness activeIndex={0} options={options} />,
    );

    const listbox = await screen.findByRole("listbox");
    Object.defineProperty(listbox, "scrollTop", {
      configurable: true,
      value: 40,
      writable: true,
    });

    fireEvent.scroll(listbox);

    expect(listbox.scrollTop).toBe(40);
  });

  it("keeps wrapped selections below sticky group headings and inside the bottom edge", () => {
    const list = document.createElement("div");
    const group = document.createElement("div");
    const heading = document.createElement("div");
    const option = document.createElement("button");
    heading.className = "at-prompt-mention-group-label";
    group.append(heading, option);
    list.append(group);
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, value: 500, writable: true },
    });
    setRect(list, rect(100, 300));
    setRect(heading, rect(100, 120));
    const optionRect = vi.fn<() => DOMRect>();
    Object.defineProperty(option, "getBoundingClientRect", {
      configurable: true,
      value: optionRect,
    });

    optionRect.mockReturnValue(rect(92, 122));
    ensurePromptMentionOptionVisible(list, option);
    expect(list.scrollTop).toBe(472);

    optionRect.mockReturnValue(rect(288, 318));
    ensurePromptMentionOptionVisible(list, option);
    expect(list.scrollTop).toBe(490);
  });

  it("clamps wrapped selections at the first and last scroll boundary", () => {
    const list = document.createElement("div");
    const heading = document.createElement("div");
    const option = document.createElement("button");
    heading.className = "at-prompt-mention-group-label";
    list.append(heading, option);
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 200 },
      scrollHeight: { configurable: true, value: 900 },
      scrollTop: { configurable: true, value: 4, writable: true },
    });
    setRect(list, rect(100, 300));
    setRect(heading, rect(100, 120));
    const optionRect = vi.fn<() => DOMRect>();
    Object.defineProperty(option, "getBoundingClientRect", {
      configurable: true,
      value: optionRect,
    });

    optionRect.mockReturnValue(rect(20, 50));
    ensurePromptMentionOptionVisible(list, option);
    expect(list.scrollTop).toBe(0);

    list.scrollTop = 696;
    optionRect.mockReturnValue(rect(390, 420));
    ensurePromptMentionOptionVisible(list, option);
    expect(list.scrollTop).toBe(700);
  });
});

function rect(top: number, bottom: number): DOMRect {
  return {
    bottom,
    height: bottom - top,
    left: 0,
    right: 640,
    top,
    width: 640,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

function setRect(element: HTMLElement, value: DOMRect): void {
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => value,
  });
}

interface MenuHarnessProps {
  activeIndex: number;
  emptyLabel?: string;
  loading?: boolean;
  loadingLabel?: string;
  onSelect?: (option: PromptMentionOption) => void;
  options: PromptMentionOption[];
}

function MenuHarness({
  activeIndex,
  emptyLabel = "No suggestions.",
  loading = false,
  loadingLabel = "Loading",
  onSelect = () => undefined,
  options: menuOptions,
}: MenuHarnessProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  return (
    <div ref={anchorRef}>
      <PromptMentionMenu
        activeIndex={activeIndex}
        anchorRef={anchorRef}
        emptyLabel={emptyLabel}
        loading={loading}
        loadingLabel={loadingLabel}
        onSelect={onSelect}
        open
        options={menuOptions}
      />
    </div>
  );
}
