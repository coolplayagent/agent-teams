import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsQueryState } from "../features/settings/SettingsShared";

afterEach(cleanup);

describe("SettingsQueryState", () => {
  it("offers an explicit retry action after a settings load failure", () => {
    const onRetry = vi.fn();

    render(
      <SettingsQueryState
        error={new Error("Settings endpoint unavailable")}
        loading={false}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByText("Settings endpoint unavailable")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("keeps retry controls out of the loading skeleton", () => {
    const { container } = render(
      <SettingsQueryState
        error={null}
        loading
        onRetry={() => undefined}
      />,
    );

    expect(container.querySelector(".ant-skeleton")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
