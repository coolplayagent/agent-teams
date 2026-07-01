import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getRecoverySnapshot,
  getSessionTokenUsage,
  listSessionRounds,
  listSessionSubagents,
  listSidebarSessions,
} from "../api/client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("api facade parity", () => {
  it("keeps force-refresh helpers on backend query parameters", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) =>
      Promise.resolve(
        new Response(JSON.stringify(responseForUrl(url)), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(listSidebarSessions(true)).resolves.toEqual([]);
    await expect(listSessionSubagents("session 1", true)).resolves.toEqual([]);
    await expect(
      listSessionRounds("session 1", { forceRefresh: true, limit: 8 }),
    ).resolves.toMatchObject({ items: [] });
    await expect(getRecoverySnapshot("session 1", true)).resolves.toEqual({
      recoverable_runs: [],
    });
    await expect(getSessionTokenUsage("session 1", true)).resolves.toEqual({
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
    });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "/api/sessions/sidebar?force_refresh=true",
      "/api/sessions/session%201/subagents?force_refresh=true",
      "/api/sessions/session%201/rounds?limit=8&force_refresh=true",
      "/api/sessions/session%201/recovery?force_refresh=true",
      "/api/sessions/session%201/token-usage?force_refresh=true",
    ]);
  });
});

function responseForUrl(url: string): unknown {
  if (url.includes("/rounds?")) {
    return {
      has_more: false,
      items: [],
      next_cursor: null,
    };
  }
  if (url.includes("/recovery?")) {
    return { recoverable_runs: [] };
  }
  if (url.includes("/token-usage?")) {
    return {
      total_input_tokens: 0,
      total_output_tokens: 0,
      total_tokens: 0,
    };
  }
  return [];
}
