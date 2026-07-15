/// <reference types="node" />

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const boardSource = readFileSync(
  "src/features/boards/BoardTodosView.tsx",
  "utf8",
);
const boardCss = readFileSync(
  "src/features/boards/BoardModals.css",
  "utf8",
);
const connectorsSource = readFileSync(
  "src/features/connectors/ConnectorsView.tsx",
  "utf8",
);
const connectorsCss = readFileSync(
  "src/features/connectors/ConnectorsLayout.css",
  "utf8",
);

describe("board and connector modal scroll ownership", () => {
  it("uses each board modal body as its single vertical scroll owner", () => {
    expect(boardSource.match(/classNames=\{\{ body: "at-scroll-region" \}\}/g))
      .toHaveLength(3);
    expect(boardCss).toMatch(
      /\.at-board-modal \.ant-modal-body\s*{[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(boardCss).toMatch(
      /\.at-board-modal \.at-board-sources,[\s\S]*?overflow:\s*visible;/,
    );
  });

  it("removes legacy detail and gateway nested scrolling", () => {
    expect(
      connectorsSource.match(/classNames=\{\{ body: "at-scroll-region" \}\}/g),
    ).toHaveLength(2);
    expect(connectorsCss).toMatch(
      /\.at-connectors-modal \.ant-modal-body\s*{[\s\S]*?overflow-y:\s*auto;/,
    );
    expect(connectorsCss).toMatch(
      /\.at-connectors-modal \.at-gateway-connector-body,[\s\S]*?\.at-connectors-modal \.at-connectors-detail-section\s*{[\s\S]*?overflow:\s*visible;/,
    );
  });
});
