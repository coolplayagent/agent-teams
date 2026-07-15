import { describe, expect, it } from "vitest";

import { desktopStartupCopy } from "../desktop/startupCopy";
import {
  desktopFailureDocumentUrl,
  desktopLoadingDocumentUrl,
} from "../desktop/startupDocument";

describe("desktop startup documents", () => {
  it("renders a localized Chinese loading document", () => {
    const html = decodeDataDocument(
      desktopLoadingDocumentUrl(
        "http://127.0.0.1:8000",
        desktopStartupCopy("zh-CN"),
      ),
    );

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain("正在启动位于 http://127.0.0.1:8000 的本地后端。");
    expect(html).not.toContain("Starting local backend");
  });

  it("renders readable localized failure actions and escapes diagnostics", () => {
    const html = decodeDataDocument(
      desktopFailureDocumentUrl(
        "http://127.0.0.1:8000",
        "无法启动 <backend>",
        desktopStartupCopy("zh-CN"),
      ),
    );

    expect(html).toContain("<h1>启动失败</h1>");
    expect(html).toContain("复制诊断信息</button>");
    expect(html).toContain("重试启动</button>");
    expect(html).toContain("状态: 无法启动 &lt;backend&gt;");
    expect(html).not.toContain("Copy diagnostics");
  });
});

function decodeDataDocument(url: string): string {
  const separatorIndex = url.indexOf(",");
  return decodeURIComponent(url.slice(separatorIndex + 1));
}
