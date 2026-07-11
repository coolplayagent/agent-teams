# Frontend

Agent Teams uses a React and TypeScript single-page application maintained in `frontend/app/`. Vite builds the deployable assets into `frontend/dist/`, and the backend serves that directory at the root route.

The browser and Electron renderer use the same application. Their public backend boundary is `/api/*` over HTTP and SSE; frontend code does not access backend repositories directly.

## Source Map

- `frontend/app/src/app/`: application providers and bootstrap state.
- `frontend/app/src/features/`: shell, sessions, timeline, composer, settings, and product surfaces.
- `frontend/app/src/runtime/`: AG-UI event contracts, reducers, and stream clients.
- `frontend/app/src/desktop/`: Electron main, preload, backend lifecycle, and packaging helpers.
- `frontend/app/src/test/`: Vitest component and contract coverage.
- `frontend/app/browser-tests/`: Playwright browser and desktop flows.
- `frontend/dist/`: generated production assets; do not hand-edit.

## Commands

Run from `frontend/app/`:

- `npm run dev`: local Vite development server.
- `npm run lint`: browser and desktop TypeScript checks.
- `npm run test`: Vitest suite.
- `npm run test:browser`: Playwright suite.
- `npm run build`: typecheck, desktop compile, and production web build.
- `npm run desktop:release`: packaged Electron directory and installer.

The root route is the production application. There is no user-facing V1/V2 switch or separate `/app/` frontend mount.
