import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

describe("app bootstrap entry", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    document.body.innerHTML = "";
    delete document.body.dataset.bootstrapState;
  });

  it("marks the bootstrap shell ready after scheduling the app render", async () => {
    const render = vi.fn();
    const createRoot = vi.fn(() => ({ render }));

    vi.doMock("react-dom/client", () => ({
      default: { createRoot },
    }));
    vi.doMock("../app/AppProviders", () => ({
      AppProviders: ({ children }: { children: ReactNode }) => children,
    }));
    vi.doMock("../app/AgentTeamsApp", () => ({
      AgentTeamsApp: () => null,
    }));

    const root = document.createElement("div");
    root.id = "root";
    document.body.appendChild(root);
    document.body.dataset.bootstrapState = "loading";

    await import("../main");

    expect(createRoot).toHaveBeenCalledWith(root);
    expect(render).toHaveBeenCalledOnce();
    expect(document.body.dataset.bootstrapState).toBe("ready");
  });
});
