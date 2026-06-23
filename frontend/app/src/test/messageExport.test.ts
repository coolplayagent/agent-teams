import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildMessagesHtml,
  exportSessionMessages,
} from "../features/shell/messageExport";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("messageExport", () => {
  it("builds escaped standalone HTML from message content and parts", () => {
    const html = buildMessagesHtml("session/<one>", [
      {
        role_id: "Writer",
        parts: [
          { kind: "text", text: "First part" },
          { part_kind: "text", content: "<script>alert(1)</script>" },
        ],
      },
    ]);

    expect(html).toContain("session/&lt;one&gt;");
    expect(html).toContain("Writer");
    expect(html).toContain("First part");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("downloads the HTML transcript", async () => {
    const createObjectUrl = mockDownloadUrl();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    await exportSessionMessages({
      format: "html",
      messages: [{ role: "assistant", content: "Done" }],
      sessionId: "session one",
    });

    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectUrl).toHaveBeenCalledTimes(1);
    const blob = firstCreatedBlob(createObjectUrl);
    expect(blob.type).toBe("text/html;charset=utf-8");
  });

  it("renders and downloads a PNG transcript through canvas", async () => {
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

    await exportSessionMessages({
      format: "png",
      messages: [{ role_id: "MainAgent", content: "Rendered content" }],
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
});

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
