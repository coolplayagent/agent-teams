# Release And Cleanup

The rewrite must be released through a controlled coexistence period, then
promoted only after full parity is proven.

## Migration Phase

During migration:

- V1 remains the default stable interface;
- the new frontend is available through an isolated route or entry point;
- both interfaces provide clear switching controls;
- switching must not rely on shared fragile frontend state;
- V1 APIs remain compatible;
- new AG-UI APIs may be added alongside V1 APIs;
- migration-only names are documented and scheduled for removal.

The coexistence period exists for validation, not for long-term product
branding.

## Switching Controls

V1 must provide a visible entry to the new frontend.

The new frontend must provide a visible return path to V1 while V1 exists.

Rules:

- labels should be clear to users during migration;
- labels must not imply the new frontend is incomplete if it is being tested as
  a release candidate;
- switching should preserve backend state but not depend on shared in-memory
  frontend state;
- switching should not lose active runs, because stream recovery must be based
  on backend state and replay.

## Promotion Criteria

The new frontend may become the default only after:

- every parity checklist item is complete;
- all subsystem reviewer passes are recorded;
- backend AG-UI tests pass;
- frontend tests pass;
- Playwright flows pass;
- Electron smoke test passes;
- final pre-commit self-check passes;
- no user-facing temporary `V2/v2` naming remains;
- docs are updated.

## Promotion Steps

Recommended promotion sequence:

1. Complete all parity checklist rows.
2. Run all quality gates.
3. Switch default frontend route to the new app.
4. Keep V1 accessible through a temporary fallback route for one validation
   window if needed.
5. Run browser and desktop smoke tests against the promoted route.
6. Remove or archive V1 after explicit completion of the validation window.
7. Remove temporary route names and switching UI.
8. Rename temporary directories/packages to neutral final names.
9. Update docs.
10. Run final test and naming scans.

## V1 Removal Rules

Do not delete V1 until:

- new frontend has proven full parity;
- all V1-only workflows have equivalent new frontend workflows;
- no tests depend on V1-only behavior unless they are intentionally removed or
  rewritten;
- rollback strategy has been decided.

When V1 is removed:

- delete obsolete hand-maintained frontend assets;
- remove V1/new-interface switching controls;
- remove temporary static mounts;
- remove migration-only docs;
- update project layout docs.

## Documentation Updates

At promotion or before final completion, update:

- `docs/core/project-layout.md`;
- `docs/core/api-design.md`;
- `docs/modules/frontend/README.md`;
- `docs/modules/frontend/architecture.md`;
- `docs/modules/frontend/api-and-events.md`;
- `docs/modules/frontend/pages-and-layout.md`;
- `docs/modules/frontend/runtime-flows.md`;
- desktop setup or packaging docs if a new document is created.

Docs must describe the final architecture, not the temporary V2 migration
state.

## Cleanup Searches

Run naming and placeholder scans before final completion:

```text
rg -n "V2|v2|新版|旧版" frontend docs src tests
rg -n "TODO|placeholder|mock|fake|stub|not implemented|coming soon" frontend docs src tests
rg -n "暂不可用|占位|稍后|后续实现|未实现" frontend docs src tests
```

Every match must be resolved, justified, or moved to an explicit future-goal
document approved by the user.

## Rollback

During migration, rollback is simple:

- keep V1 default or switch default back to V1;
- keep backend V1 APIs stable;
- avoid schema changes that make V1 unusable before promotion.

After promotion, rollback must be decided before V1 deletion.

Minimum rollback evidence:

- V1 route still available during validation window, or
- tagged release/commit with V1 assets available for restoration.

## Final Completion Statement

The rewrite may be declared complete only with a final report containing:

- completed parity checklist summary;
- subsystem builder/reviewer summary;
- tests and commands run;
- unresolved risks, if any;
- confirmation that no user-facing temporary `V2/v2` naming remains;
- confirmation that V1 deletion or retention status is intentional.
