# Legacy frontend

This directory contains the maintained source for the V1 web interface. It was
restored from the last pre-promotion frontend revision (`26c73c64b^`) so V1 can
remain available without treating generated files under `frontend/dist/` as its
source of truth.

`npm run build` from `frontend/app/` builds the current interface at `/` and
then copies this source tree to `frontend/dist/v1/`. Both interfaces call the
same origin-relative `/api/*` contract.

Keep asset URLs in this tree scoped to `/v1/`. The only intentional root link is
the V2 switch in `src/index.html`.
