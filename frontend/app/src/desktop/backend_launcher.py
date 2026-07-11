# -*- coding: utf-8 -*-
from __future__ import annotations

import argparse
import os

os.environ.setdefault("PYDANTIC_DISABLE_PLUGINS", "__all__")

import uvicorn

from relay_teams.interfaces.server.app import app


def main() -> None:
    parser = argparse.ArgumentParser(prog="relay-teams-backend")
    parser.add_argument("group", choices=("server",))
    parser.add_argument("command", choices=("start",))
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", default=8000, type=int)
    args = parser.parse_args()
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        timeout_graceful_shutdown=10,
        ws="websockets-sansio",
    )


if __name__ == "__main__":
    main()
