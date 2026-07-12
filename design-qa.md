# Design QA

## Connector density redesign

Status: Passed after real-browser follow-up.

Reference:

- `C:\Users\yex\AppData\Local\Temp\codex-clipboard-eb10251f-f40a-43e1-9ab7-146c5b90a3f3.png`

Captured implementation evidence:

- `C:\Users\yex\Documents\workspace\agent-teams\tmp\qa\connector-dense-wide-fixed-live.png`
- `C:\Users\yex\Documents\workspace\agent-teams\tmp\qa\connector-detail-modal.png`

Verified in the live application through CDP:

- Wide viewport: three columns, six cards in two rows, and the grid fills the workbench.
- Medium viewport: two columns with card heights at or below 130 px.
- Narrow viewport: one column with no document-level horizontal overflow.
- Search, status filtering, connector details, connection testing, and the CLI tab are interactive.
- Details open in a centered modal and preserve the page context.

The first implementation failed because later global theme rules restored the old 360 px split pane. The follow-up removed that obsolete cascade path and the live computed styles now match the intended dense grid.
