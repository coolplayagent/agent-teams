# frontend

This directory hosts the decoupled web frontend.

- `dist/`: static build artifacts served by the FastAPI server at runtime.
- `v2/`: source tree for the frontend rewrite candidate. Its local build output
  is ignored under `v2/dist/`.
- `v2/src/`: source files for the candidate frontend. Do not mirror `dist/`
  here; migrate screens into cohesive source modules.
- The backend serves `frontend/dist` when available.
- Build with `npm --prefix frontend/v2 run build`.
- Set `RELAY_TEAMS_FRONTEND_DIST_DIR=frontend/v2/dist` to serve the candidate
  frontend without changing the default runtime path.

Current API base path used by the UI is `/api`.
