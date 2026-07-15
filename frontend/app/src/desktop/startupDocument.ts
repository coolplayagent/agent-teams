import type { DesktopStartupCopy } from "./startupCopy.js";

export function desktopLoadingDocumentUrl(
  baseUrl: string,
  copy: DesktopStartupCopy,
): string {
  return dataDocumentUrl(
    copy.documentLanguage,
    copy.startupTitle,
    `<main class="desktop-status" aria-live="polite"><div class="status-label">${escapeHtml(
      copy.loadingLabel,
    )}</div><h1>${escapeHtml(copy.startupTitle)}</h1><p>${escapeHtml(
      copy.loadingMessage(baseUrl),
    )}</p></main>`,
  );
}

export function desktopFailureDocumentUrl(
  baseUrl: string,
  message: string,
  copy: DesktopStartupCopy,
): string {
  const diagnostic = `${copy.diagnosticBackend}: ${baseUrl}\n${copy.diagnosticStatus}: ${message}`;
  return dataDocumentUrl(
    copy.documentLanguage,
    copy.failureTitle,
    `<main class="desktop-status is-failed" role="alert"><div class="status-label">Agent Teams</div><h1>${escapeHtml(
      copy.failureHeading,
    )}</h1><p>${escapeHtml(
      message,
    )}</p><code id="desktop-diagnostic">${escapeHtml(
      diagnostic,
    )}</code><div class="status-actions"><button type="button" onclick="window.agentTeamsDesktop.copyText(document.getElementById('desktop-diagnostic')?.innerText ?? '')">${escapeHtml(
      copy.copyDiagnostics,
    )}</button><button type="button" onclick="window.agentTeamsDesktop.retryStartup()">${escapeHtml(
      copy.retryStartup,
    )}</button></div></main>`,
  );
}

function dataDocumentUrl(
  language: string,
  title: string,
  body: string,
): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html lang="${escapeHtml(language)}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f7f7f3; color: #1f2328; font: 14px system-ui, sans-serif; }
      .desktop-status { display: grid; gap: 12px; width: min(480px, calc(100vw - 48px)); padding: 24px; border: 1px solid #d8d6cf; border-radius: 8px; background: #ffffff; }
      .status-label { color: #5b625f; font-size: 12px; }
      h1 { margin: 0; font-size: 22px; font-weight: 650; }
      p { margin: 0; color: #656d76; line-height: 1.45; }
      code { display: block; overflow-wrap: anywhere; white-space: pre-wrap; border: 1px solid #e5e2da; border-radius: 6px; padding: 10px; background: #faf9f5; color: #24292f; }
      .status-actions { display: flex; flex-wrap: wrap; gap: 8px; }
      button { height: 32px; border: 1px solid #d0d7de; border-radius: 6px; background: #ffffff; color: #24292f; font: inherit; padding: 0 12px; }
      button:hover { background: #f6f8fa; }
    </style>
  </head>
  <body>${body}</body>
</html>`)}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}
