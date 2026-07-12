import { afterEach, describe, expect, it, vi } from "vitest";

import { createRun } from "../api/client";
import type { RunCreateRequest } from "../api/contracts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("run submission semantic fidelity", () => {
  it("sends the same user-selected policy for short and long prompts", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ run_id: "run-1", session_id: "session-1" }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const selectedPolicy = {
      session_id: "session-1",
      yolo: true,
      shell_safety_policy_enabled: false,
      thinking: { enabled: true, effort: "high" as const },
      target_role_id: "writer",
      skills: ["pdf"],
    };
    const requestFor = (text: string): RunCreateRequest => ({
      ...selectedPolicy,
      input: [{ kind: "text", text }],
      display_input: [{ kind: "text", text }],
    });

    await createRun(requestFor("你好"));
    await createRun(
      requestFor("Please inspect this workflow carefully. ".repeat(80)),
    );

    const shortBody = parsedRequestBody(fetchMock, 0);
    const longBody = parsedRequestBody(fetchMock, 1);
    const { input: shortInput, display_input: shortDisplay, ...shortPolicy } =
      shortBody;
    const { input: longInput, display_input: longDisplay, ...longPolicy } = longBody;
    expect(shortInput).not.toEqual(longInput);
    expect(shortDisplay).not.toEqual(longDisplay);
    expect(shortPolicy).toEqual(longPolicy);
    expect(shortPolicy.thinking).toEqual({ enabled: true, effort: "high" });
  });
});

function parsedRequestBody(
  fetchMock: ReturnType<typeof vi.fn>,
  callIndex: number,
): RunCreateRequest {
  const init = fetchMock.mock.calls[callIndex]?.[1] as RequestInit | undefined;
  if (typeof init?.body !== "string") {
    throw new Error(`Expected JSON request body for fetch call ${callIndex + 1}`);
  }
  return JSON.parse(init.body) as RunCreateRequest;
}
