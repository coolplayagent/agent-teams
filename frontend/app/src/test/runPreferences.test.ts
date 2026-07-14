import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  persistThinkingState,
  subscribeThinkingState,
} from "../features/composer/runPreferences";

describe("runPreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("synchronizes thinking changes across concurrently mounted composers", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeThinkingState(listener);

    persistThinkingState({ enabled: true, effort: "high" });
    await new Promise<void>((resolve) => globalThis.queueMicrotask(resolve));

    expect(listener).toHaveBeenCalledWith({ enabled: true, effort: "high" });
    unsubscribe();
  });
});
