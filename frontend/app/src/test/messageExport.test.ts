import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMessagesHtml,
  buildMessagesJson,
  exportSessionMessages,
} from "../features/shell/messageExport";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messageExport", () => {
  it("downloads a versioned, machine-readable JSON transcript", async () => {
    const createObjectUrl = mockDownloadUrl();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    await exportSessionMessages({
      format: "json",
      rounds: [{ intent: "Review export", run_id: "run-1" }],
      sessionId: "session-1",
    });

    const blob = firstCreatedBlob(createObjectUrl);
    expect(blob.type).toBe("application/json;charset=utf-8");
    const transcript = JSON.parse(buildMessagesJson(
      "session-1",
      [{ intent: "Review export", run_id: "run-1" }],
      "2026-07-12T00:00:00Z",
    ));
    expect(transcript).toMatchObject({
      schema: "relay-teams.session-transcript",
      sessionId: "session-1",
      version: 1,
    });
    expect(transcript.entries).toEqual([
      expect.objectContaining({ kind: "user", text: "Review export" }),
    ]);
  });

  it("builds escaped standalone HTML from complete round projections", () => {
    const html = buildMessagesHtml("session/<one>", [
      {
        coordinator_messages: [
          {
            message: {
              parts: [
                { part_kind: "text", content: "First part" },
                {
                  args: { cmd: "npm test" },
                  part_kind: "tool-call",
                  tool_call_id: "tool-1",
                  tool_name: "execute_command",
                },
                {
                  content: "<script>alert(1)</script>",
                  part_kind: "tool-return",
                  tool_call_id: "tool-1",
                  tool_name: "execute_command",
                },
              ],
            },
            role_id: "Writer",
          },
        ],
        created_at: "2026-06-23T01:00:00Z",
        has_final_output: true,
        injection_messages: [
          {
            content: "Injected note",
            created_at: "2026-06-23T01:00:01Z",
            source: "user",
          },
        ],
        intent_parts: [{ kind: "text", text: "User prompt" }],
        run_id: "run-1",
        run_phase: "completed",
        run_status: "completed",
      },
    ]);

    expect(html).toContain("session/&lt;one&gt;");
    expect(html).toContain("data-kind=\"user\"");
    expect(html).toContain("User prompt");
    expect(html).toContain("Writer");
    expect(html).toContain("First part");
    expect(html).toContain("data-kind=\"tool\"");
    expect(html).toContain("execute_command");
    expect(html).toContain("&quot;cmd&quot;: &quot;npm test&quot;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("Inserted message");
    expect(html).toContain("Injected note");
    expect(html).toContain("<!doctype html>");
    expect(html).not.toContain("relay-teams.session-transcript");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("renders readable Markdown and escaped code without executable markup", () => {
    const html = buildMessagesHtml("session-1", [{
      coordinator_messages: [{
        message: { parts: [{
          content: "**Result**\n\n- one\n- two\n\n```html\n<img src=x onerror=alert(1)>\n```",
          part_kind: "text",
        }] },
        role: "assistant",
      }],
      run_id: "run-1",
    }]);

    const document = new DOMParser().parseFromString(html, "text/html");
    expect(document.querySelector(".entry[data-kind='assistant'] strong")?.textContent).toBe("Result");
    expect(document.querySelectorAll(".entry li")).toHaveLength(2);
    expect(document.querySelector("pre code")?.textContent).toContain("<img src=x");
    expect(document.querySelector("img")).toBeNull();
  });

  it("exports coordinator messages that store content on the nested message object", () => {
    const html = buildMessagesHtml("session-1", [
      {
        coordinator_messages: [
          {
            message: {
              content: "Nested final output",
            },
            role_id: "MainAgent",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("MainAgent");
    expect(html).toContain("Nested final output");
  });

  it("exports media-only prompt parts as readable references", () => {
    const html = buildMessagesHtml("session-1", [
      {
        intent_parts: [
          {
            asset_id: "asset-1",
            kind: "media_ref",
            mime_type: "image/png",
            modality: "image",
            name: "screenshot.png",
            url: "https://example.test/assets/asset-1",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("data-kind=\"user\"");
    expect(html).toContain("[image: screenshot.png]");
    expect(html).toContain("Type: image/png");
    expect(html).toContain("URL: https://example.test/assets/asset-1");
  });

  it("exports inline, url, and binary prompt media parts", () => {
    const html = buildMessagesHtml("session-1", [
      {
        intent: "Describe these files",
        intent_parts: [
          { kind: "text", text: "Describe these files" },
          {
            base64_data: "QUJD",
            kind: "inline_media",
            mime_type: "image/png",
            modality: "image",
            name: "inline.png",
          },
          {
            kind: "image-url",
            media_type: "image/jpeg",
            name: "remote.jpg",
            url: "https://example.test/remote.jpg",
          },
          {
            data: "UklGRg==",
            kind: "binary",
            media_type: "audio/wav",
            name: "voice.wav",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("Describe these files");
    expect(html).toContain("[image: inline.png]");
    expect(html).toContain("URL: data:image/png;base64,QUJD");
    expect(html).toContain("[image: remote.jpg]");
    expect(html).toContain("URL: https://example.test/remote.jpg");
    expect(html).toContain("[audio: voice.wav]");
    expect(html).toContain("URL: data:audio/wav;base64,UklGRg==");
  });

  it("exports mixed text and media injection parts", () => {
    const html = buildMessagesHtml("session-1", [
      {
        injection_messages: [
          {
            content_parts: [
              { kind: "text", text: "Inspect this output" },
              {
                asset_id: "asset-2",
                kind: "media_ref",
                modality: "image",
                name: "render.png",
              },
            ],
            source: "subagent",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("Subagent injection");
    expect(html).toContain("Inspect this output");
    expect(html).toContain("[image: render.png]");
  });

  it("exports round pending question and retry details", () => {
    const html = buildMessagesHtml("session-1", [
      {
        pending_tool_approval_count: 1,
        pending_user_question_count: 2,
        retry_events: [
          {
            attempt_number: 3,
            error_code: "rate_limit",
            error_message: "Try again later",
            is_active: true,
            kind: "retry",
            phase: "scheduled",
            retry_in_ms: 2500,
            total_attempts: 5,
          },
          {
            kind: "fallback",
            phase: "activated",
            to_profile_id: "secondary",
          },
        ],
        run_id: "run-1",
      },
    ]);

    expect(html).toContain("Pending approvals: 1");
    expect(html).toContain("Pending questions: 2");
    expect(html).toContain("Retry 1");
    expect(html).toContain("&quot;kind&quot;: &quot;retry&quot;");
    expect(html).toContain("&quot;phase&quot;: &quot;scheduled&quot;");
    expect(html).toContain("&quot;attempt_number&quot;: 3");
    expect(html).toContain("&quot;retry_in_ms&quot;: 2500");
    expect(html).toContain("&quot;error_code&quot;: &quot;rate_limit&quot;");
    expect(html).toContain("&quot;error_message&quot;: &quot;Try again later&quot;");
    expect(html).toContain("&quot;is_active&quot;: true");
    expect(html).toContain("Retry 2");
    expect(html).toContain("&quot;kind&quot;: &quot;fallback&quot;");
    expect(html).toContain("&quot;to_profile_id&quot;: &quot;secondary&quot;");
  });

  it("downloads the HTML transcript", async () => {
    const createObjectUrl = mockDownloadUrl();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await exportSessionMessages({
      format: "html",
      rounds: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: "Done" }] },
              role: "assistant",
            },
          ],
          run_id: "run-1",
        },
      ],
      sessionId: "session one",
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = firstCreatedBlob(createObjectUrl);
    expect(blob.type).toBe("text/html;charset=utf-8");
  });

  it("renders and downloads a PNG transcript through canvas", async () => {
    const { createObjectUrl, fillText, toBlob } = mockCanvasDownloads();

    await exportSessionMessages({
      format: "png",
      rounds: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: "Rendered content" }] },
              role_id: "MainAgent",
            },
          ],
          run_id: "run-1",
        },
      ],
      sessionId: "session-1",
    });

    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    expect(firstCreatedBlob(createObjectUrl).type).toBe("image/png");
    expect(fillText).toHaveBeenCalledWith("session-1", expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith("MainAgent", expect.any(Number), expect.any(Number));
    expect(fillText).toHaveBeenCalledWith(
      "Rendered content",
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("splits oversized PNG transcripts into multiple downloads", async () => {
    const { createObjectUrl, toBlob } = mockCanvasDownloads();
    const longContent = Array.from({ length: 700 }, (_, index) => `line ${index}`)
      .join("\n");

    const fileCount = await exportSessionMessages({
      format: "png",
      rounds: [
        {
          coordinator_messages: [
            {
              message: { parts: [{ part_kind: "text", content: longContent }] },
              role_id: "MainAgent",
            },
          ],
          run_id: "run-1",
        },
      ],
      sessionId: "session-1",
    });

    expect(fileCount).toBeGreaterThan(1);
    expect(toBlob).toHaveBeenCalledTimes(fileCount);
    expect(createObjectUrl).toHaveBeenCalledTimes(fileCount);
  });
});

function mockCanvasDownloads() {
  const createObjectUrl = mockDownloadUrl();
  const fillText = vi.fn();
  const context = fakeCanvasContext(fillText);
  const getCanvasContext = ((
    contextId: string,
  ): RenderingContext | null => {
    return contextId === "2d" ? context : null;
  }) as HTMLCanvasElement["getContext"];
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    getCanvasContext,
  );
  const toBlob = vi.fn((callback: BlobCallback, type?: string) => {
    callback(new Blob(["png"], { type: type ?? "image/png" }));
  });
  Object.defineProperty(HTMLCanvasElement.prototype, "toBlob", {
    configurable: true,
    value: toBlob,
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
    () => undefined,
  );
  return { createObjectUrl, fillText, toBlob };
}

function mockDownloadUrl() {
  const createObjectUrl = vi.fn((_: Blob | MediaSource) => "blob:export");
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: createObjectUrl,
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
  return createObjectUrl;
}

function firstCreatedBlob(createObjectUrl: ReturnType<typeof mockDownloadUrl>): Blob {
  const blob = createObjectUrl.mock.calls[0]?.[0];
  if (!(blob instanceof Blob)) {
    throw new Error("Expected export to create a Blob.");
  }
  return blob;
}

function fakeCanvasContext(
  fillText: (text: string, x: number, y: number) => void,
): CanvasRenderingContext2D {
  return {
    beginPath: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
    fillText,
    font: "",
    lineTo: vi.fn(),
    measureText: (value: string) => ({ width: value.length * 7 }) as TextMetrics,
    moveTo: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: "",
  } as unknown as CanvasRenderingContext2D;
}
