export type DesktopDocumentLanguage = "en" | "zh-CN";

export interface DesktopStartupCopy {
  backendExitedCode: (code: number) => string;
  backendExitedSignal: (signal: string) => string;
  backendExitedUnknown: string;
  backendHasNotStarted: string;
  backendNotReady: (baseUrl: string) => string;
  backendProcessExited: (detail: string) => string;
  backendReady: string;
  backendStartupFailed: string;
  backendStarting: string;
  backendStopped: string;
  copyDiagnostics: string;
  diagnosticBackend: string;
  diagnosticStatus: string;
  documentLanguage: DesktopDocumentLanguage;
  failureHeading: string;
  failureTitle: string;
  loadingLabel: string;
  loadingMessage: (baseUrl: string) => string;
  retryStartup: string;
  startupTitle: string;
}

const englishCopy: DesktopStartupCopy = {
  backendExitedCode: (code) => `code ${code}`,
  backendExitedSignal: (signal) => `signal ${signal}`,
  backendExitedUnknown: "unknown exit status",
  backendHasNotStarted: "Backend has not started.",
  backendNotReady: (baseUrl) => `Backend was not ready at ${baseUrl}.`,
  backendProcessExited: (detail) => `Backend process exited with ${detail}.`,
  backendReady: "Backend ready.",
  backendStartupFailed: "Backend startup failed.",
  backendStarting: "Starting backend.",
  backendStopped: "Backend stopped.",
  copyDiagnostics: "Copy diagnostics",
  diagnosticBackend: "Backend",
  diagnosticStatus: "Status",
  documentLanguage: "en",
  failureHeading: "Startup failed",
  failureTitle: "Agent Teams startup failed",
  loadingLabel: "Starting",
  loadingMessage: (baseUrl) => `Starting local backend at ${baseUrl}.`,
  retryStartup: "Retry startup",
  startupTitle: "Agent Teams",
};

const chineseCopy: DesktopStartupCopy = {
  backendExitedCode: (code) => `退出码 ${code}`,
  backendExitedSignal: (signal) => `信号 ${signal}`,
  backendExitedUnknown: "未知退出状态",
  backendHasNotStarted: "后端尚未启动。",
  backendNotReady: (baseUrl) => `后端未能在 ${baseUrl} 就绪。`,
  backendProcessExited: (detail) => `后端进程已退出：${detail}。`,
  backendReady: "后端已就绪。",
  backendStartupFailed: "后端启动失败。",
  backendStarting: "正在启动后端。",
  backendStopped: "后端已停止。",
  copyDiagnostics: "复制诊断信息",
  diagnosticBackend: "后端",
  diagnosticStatus: "状态",
  documentLanguage: "zh-CN",
  failureHeading: "启动失败",
  failureTitle: "Agent Teams 启动失败",
  loadingLabel: "正在启动",
  loadingMessage: (baseUrl) => `正在启动位于 ${baseUrl} 的本地后端。`,
  retryStartup: "重试启动",
  startupTitle: "Agent Teams",
};

export function desktopStartupCopy(locale: string): DesktopStartupCopy {
  return locale.trim().toLowerCase().startsWith("zh")
    ? chineseCopy
    : englishCopy;
}
