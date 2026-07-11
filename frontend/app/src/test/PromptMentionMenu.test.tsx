import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PromptMentionMenu } from "../features/composer/PromptMentionMenu";
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
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
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

    view.rerender(
      <MenuHarness activeIndex={3} onSelect={onSelect} options={options} />,
    );
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest" }));

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
});

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
