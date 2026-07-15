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

## New session and shared composer redesign

Status: Passed after implementation, focused regression tests, and real Chrome interaction review.

Reference:

- `C:\Users\yex\AppData\Local\Temp\codex-clipboard-68abdc8a-c1f3-4ceb-a374-101d6d1cf1f1.png`

Captured implementation evidence:

- `C:\Users\yex\Documents\workspace\agent-teams\.tmp-new-session-design-qa\implementation-wide-light-1556x967.png`
- `C:\Users\yex\Documents\workspace\agent-teams\.tmp-new-session-design-qa\implementation-narrow-light-900x800.png`

Verified in the live application through the user's Chrome session:

- Wide light viewport: `innerWidth=1556`, `innerHeight=967`; four project-context shortcuts, the shared composer surface, and every direct run control remain visible.
- Narrow light viewport: `innerWidth=900`, `innerHeight=800`; the shortcuts become a 2x2 grid and the shared controls split into explicit topology and execution rows.
- The narrow document has no horizontal overflow: `scrollWidth=clientWidth=900`.
- The narrow composer has no hidden horizontal scroll area: `scrollWidth=clientWidth=534`; the run-control container is `468/468` and both child control groups are `468/468`.
- Shortcut cards fill and focus the composer without submitting. The `+` menu opens and closes with Escape. Workspace and optional-title controls disclose locally.
- Escape closes the optional-title editor after its exit animation without leaving the New Session page.
- Switching to orchestration mode exposes a correctly labelled orchestration preset and target role; switching does not reuse the normal-mode root-role control identity.
- Thinking, Shell safety, and YOLO toggle directly beside the composer and restore correctly.
- Application errors attributable to this flow: 0. Chrome recorded one pre-existing Ant Design v5/React 19 compatibility warning emitted at error level.

Automated evidence:

- TypeScript application and desktop type checks passed.
- Focused Vitest run: 7 files and 167 tests passed.
- Isolated production build passed; the existing chunk-size advisory is unchanged.

The implementation reuses `ComposerSurface` and `ComposerRunControls` across New Session and active sessions, removes the obsolete separate New Session settings component, preserves workspace context, and keeps optional metadata progressively disclosed.

final result: passed
