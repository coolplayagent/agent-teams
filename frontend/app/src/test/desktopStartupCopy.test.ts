import { describe, expect, it } from "vitest";

import { desktopStartupCopy } from "../desktop/startupCopy";

describe("desktop startup copy", () => {
  it("uses English as the fallback desktop language", () => {
    const copy = desktopStartupCopy("fr-FR");

    expect(copy.documentLanguage).toBe("en");
    expect(copy.loadingMessage("http://127.0.0.1:8000"))
      .toBe("Starting local backend at http://127.0.0.1:8000.");
    expect(copy.failureHeading).toBe("Startup failed");
    expect(copy.copyDiagnostics).toBe("Copy diagnostics");
  });

  it("localizes startup, failure, diagnostics, and process status in Chinese", () => {
    const copy = desktopStartupCopy("zh-Hans");

    expect(copy.documentLanguage).toBe("zh-CN");
    expect(copy.loadingMessage("http://127.0.0.1:8000"))
      .toBe("正在启动位于 http://127.0.0.1:8000 的本地后端。");
    expect(copy.failureHeading).toBe("启动失败");
    expect(copy.copyDiagnostics).toBe("复制诊断信息");
    expect(copy.retryStartup).toBe("重试启动");
    expect(copy.backendNotReady("http://127.0.0.1:8000"))
      .toBe("后端未能在 http://127.0.0.1:8000 就绪。");
    expect(copy.backendProcessExited(copy.backendExitedCode(7)))
      .toBe("后端进程已退出：退出码 7。");
  });
});
