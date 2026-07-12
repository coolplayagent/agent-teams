export interface AbortTrackedRequest {
  url: () => string;
}

export class ExpectedRequestAbortLedger<
  RequestType extends AbortTrackedRequest,
> {
  private readonly activeRequests = new Set<RequestType>();
  private readonly expectedAborts = new Map<RequestType, string>();

  requestStarted(request: RequestType): void {
    this.activeRequests.add(request);
  }

  requestSettled(request: RequestType): void {
    this.activeRequests.delete(request);
    this.expectedAborts.delete(request);
  }

  captureLifecycleRequests(): void {
    for (const request of this.activeRequests) {
      const url = request.url();
      if (isLifecycleAbortCandidate(url)) {
        this.expectedAborts.set(request, url);
      }
    }
  }

  consumeExpectedAbort(request: RequestType, errorText: string): boolean {
    const expectedUrl = this.expectedAborts.get(request);
    this.activeRequests.delete(request);
    this.expectedAborts.delete(request);
    return (
      expectedUrl !== undefined &&
      request.url() === expectedUrl &&
      errorText.includes("ERR_ABORTED")
    );
  }
}

function isLifecycleAbortCandidate(url: string): boolean {
  const parsed = parseUrl(url);
  if (parsed === null) {
    return false;
  }
  if (
    /^\/api\/ag-ui\/runs(?:\/[^/]+)?\/events$/.test(parsed.pathname) ||
    /^\/api\/sessions\/[^/]+\/subagents\/events$/.test(parsed.pathname)
  ) {
    return true;
  }
  return (
    /^\/api\/sessions\/[^/]+\/rounds$/.test(parsed.pathname) &&
    parsed.searchParams.get("force_refresh") === "true"
  );
}

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
