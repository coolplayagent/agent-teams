# Frontend

Agent Teams uses a React and TypeScript single-page application maintained in `frontend/app/` as V2. A maintained V1 source tree lives in `frontend/legacy/src/`. The production build emits V2 at the root of `frontend/dist/` and copies V1 to `frontend/dist/v1/`; the backend therefore serves the interfaces at `/` and `/v1/` respectively.

The browser and Electron renderer use the same application. Their public backend boundary is `/api/*` over HTTP and SSE; frontend code does not access backend repositories directly.

## Source Map

- `frontend/app/src/app/`: application providers and bootstrap state.
- `frontend/app/src/features/`: shell, sessions, timeline, composer, settings, and product surfaces.
- `frontend/app/src/runtime/`: AG-UI event contracts, reducers, and stream clients.
- `frontend/app/src/desktop/`: Electron main, preload, backend lifecycle, and packaging helpers.
- `frontend/app/src/test/`: Vitest component and contract coverage.
- `frontend/app/browser-tests/`: Playwright browser and desktop flows.
- `frontend/legacy/src/`: maintained V1 source, with assets scoped to `/v1/`.
- `frontend/legacy/build.mjs`: V1 build step that copies the independent source bundle after Vite completes.
- `frontend/dist/`: generated production assets; do not hand-edit.

## Commands

Run from `frontend/app/`:

- `npm run dev`: local Vite development server.
- `npm run lint`: browser and desktop TypeScript checks.
- `npm run test`: Vitest suite.
- `npm run test:browser`: Playwright suite.
- `npm run build`: typecheck, desktop compile, V2 production build, and V1 production build.
- `npm run desktop:release`: packaged Electron directory and installer.

The root route is V2 and `/v1/` is V1. Each interface has a persistent version switch in its header. Both versions use the same origin-relative `/api/*` contract; `/app/` is not a frontend mount.
