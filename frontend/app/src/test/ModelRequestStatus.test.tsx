import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ModelRequestStatus } from "../features/timeline/ModelRequestStatus";

describe("ModelRequestStatus", () => {
  it("replaces slot waiting feedback after acquisition", () => {
    const { rerender } = render(
      <ModelRequestStatus
        openingLabel="Connecting to the model"
        phase="waiting_for_slot"
        waitingLabel="Waiting for an available model slot"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Waiting for an available model slot",
    );

    rerender(
      <ModelRequestStatus
        openingLabel="Connecting to the model"
        phase="opening_stream"
        waitingLabel="Waiting for an available model slot"
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Connecting to the model");
  });

  it("removes feedback after the model begins streaming", () => {
    const { container } = render(
      <ModelRequestStatus
        openingLabel="Connecting to the model"
        phase={null}
        waitingLabel="Waiting for an available model slot"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
