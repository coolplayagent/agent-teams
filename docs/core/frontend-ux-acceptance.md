# Frontend UX Acceptance

Frontend work is accepted from the user's task flow, not from the existence of a
component or a passing render test. The default interaction model is a
high-density contextual interface: actions stay near their objects, details are
progressively disclosed, feedback is local, and navigation preserves context.

## Product judgment

Before accepting a screen, verify all of the following:

- Every visible block adds information or enables an action. In an editor, do
  not repeat editable fields in a separate read-only summary unless the summary
  adds a computed result or live state that the form does not contain.
- The primary task owns the available space. Empty columns, unused panels, and
  oversized summaries are defects when they compress the working surface.
- Related controls share a grid, edge, height, and spacing rhythm. Single-column
  fields fill the content width; paired fields divide it predictably; action
  bars align to the same content edge.
- Object actions are contextual and local. Rename, delete, retry, pending,
  success, and error states appear beside the affected object instead of in a
  detached global dialog or toast when local feedback is possible.
- Secondary detail is disclosed on demand. A collapsed state must remain useful
  and must not duplicate controls or summaries that are already visible.
- Empty, disabled, loading, and error states explain what happened without
  replacing unrelated content or making the page appear frozen.
- Navigation, feature switching, reconnect, hydration, and session switching
  preserve the user's draft, focus, scroll anchor, expanded state, event order,
  and active stream ownership.

## Required browser acceptance

Tests must exercise behavior, not only inspect markup:

1. Click every safe visible action in the changed flow. Use disposable or mocked
   data for destructive actions and confirm both cancel and confirm paths.
2. Use keyboard navigation for menus, search results, disclosures, forms, and
   dialogs. Check focus visibility and focus restoration.
3. Capture the meaningful before, pending, success, error, expanded, and empty
   states. A screenshot is evidence only after the action that creates the state
   has been exercised.
4. Check at 1440x900, 1280x720, 1024x768, and a narrow layout. At each size,
   inspect horizontal overflow, clipped popups, overlapping controls, unused
   space, nested scroll owners, and sticky composer/header behavior.
5. Check light, dark, and system theme behavior. Text, code, inputs, disabled
   controls, selections, overlays, and feedback must use semantic theme tokens.
6. For agent sessions, verify live streaming, tool and thinking disclosures,
   root and subagent questions, inserted messages, reconnect, final replay, and
   switching away and back while output continues.

## Acceptance evidence

Every substantial frontend change should leave:

- focused component or CSS regression tests;
- browser interaction coverage for the user-visible behavior;
- screenshots for distinct visual states and relevant viewport/theme variants;
- a separate commit for each independently reviewable behavior;
- a clean production build before the final browser pass.

Passing tests do not override an obvious product defect. Misalignment, redundant
information, unusable empty space, hidden feedback, or a broken task hierarchy
must be fixed even when the underlying action technically works.
