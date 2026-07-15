import { describe, expect, it } from "vitest";

import { ExpectedRequestAbortLedger } from "../../browser-tests/support/expected-request-aborts";

class FakeRequest {
  constructor(private readonly requestUrl: string) {}

  url(): string {
    return this.requestUrl;
  }
}

describe("ExpectedRequestAbortLedger", () => {
  it("consumes an exact in-flight event stream abort only once", () => {
    const ledger = new ExpectedRequestAbortLedger<FakeRequest>();
    const request = new FakeRequest(
      "http://127.0.0.1:8000/api/ag-ui/runs/run-1/events?after_event_id=0",
    );

    ledger.requestStarted(request);
    ledger.captureLifecycleRequests();

    expect(ledger.consumeExpectedAbort(request, "net::ERR_ABORTED")).toBe(true);
    expect(ledger.consumeExpectedAbort(request, "net::ERR_ABORTED")).toBe(
      false,
    );
  });

  it("does not excuse streams that started after the lifecycle snapshot", () => {
    const ledger = new ExpectedRequestAbortLedger<FakeRequest>();
    const request = new FakeRequest(
      "http://127.0.0.1:8000/api/ag-ui/runs/run-2/events?after_event_id=0",
    );

    ledger.captureLifecycleRequests();
    ledger.requestStarted(request);

    expect(ledger.consumeExpectedAbort(request, "net::ERR_ABORTED")).toBe(
      false,
    );
  });

  it("allows an in-flight forced round refresh aborted by navigation", () => {
    const ledger = new ExpectedRequestAbortLedger<FakeRequest>();
    const request = new FakeRequest(
      "http://127.0.0.1:8000/api/sessions/session-1/rounds?limit=100&force_refresh=true",
    );

    ledger.requestStarted(request);
    ledger.captureLifecycleRequests();

    expect(ledger.consumeExpectedAbort(request, "net::ERR_ABORTED")).toBe(true);
  });

  it("does not hide unrelated or non-abort failures", () => {
    const ledger = new ExpectedRequestAbortLedger<FakeRequest>();
    const unrelated = new FakeRequest(
      "http://127.0.0.1:8000/api/sessions/session-1/messages",
    );
    const stream = new FakeRequest(
      "http://127.0.0.1:8000/api/ag-ui/runs/run-1/events?after_event_id=0",
    );
    const unrelatedEventStream = new FakeRequest(
      "http://127.0.0.1:8000/api/analytics/events",
    );

    ledger.requestStarted(unrelated);
    ledger.requestStarted(stream);
    ledger.requestStarted(unrelatedEventStream);
    ledger.captureLifecycleRequests();

    expect(ledger.consumeExpectedAbort(unrelated, "net::ERR_ABORTED")).toBe(
      false,
    );
    expect(
      ledger.consumeExpectedAbort(stream, "net::ERR_CONNECTION_RESET"),
    ).toBe(false);
    expect(
      ledger.consumeExpectedAbort(
        unrelatedEventStream,
        "net::ERR_ABORTED",
      ),
    ).toBe(false);
  });

  it("forgets a request that completed before the lifecycle action", () => {
    const ledger = new ExpectedRequestAbortLedger<FakeRequest>();
    const request = new FakeRequest(
      "http://127.0.0.1:8000/api/ag-ui/runs/run-1/events?after_event_id=0",
    );

    ledger.requestStarted(request);
    ledger.requestSettled(request);
    ledger.captureLifecycleRequests();

    expect(ledger.consumeExpectedAbort(request, "net::ERR_ABORTED")).toBe(
      false,
    );
  });
});
