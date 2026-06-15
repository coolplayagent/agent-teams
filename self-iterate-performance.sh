#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
HARNESS_DIR="$ROOT_DIR/tools/performance_self_iteration"
HARNESS_TARGET_DIR="$HARNESS_DIR/target"
BUILD_ARGS=""
TARGET_DIR="debug"
if [ "${RELAY_TEAMS_PERFORMANCE_ITERATION_RELEASE:-0}" = "1" ]; then
  BUILD_ARGS="--release"
  TARGET_DIR="release"
fi
HARNESS_BIN="$HARNESS_DIR/target/$TARGET_DIR/relay-teams-performance-iterate"

if [ "${1:-}" = "once" ] || [ "${1:-}" = "loop" ] || [ "${1:-}" = "evaluate" ] || [ "${1:-}" = "chart" ]; then
  MODE="$1"
  shift
else
  MODE="loop"
fi

if [ ! -x "$HARNESS_BIN" ] || [ -n "$(find "$HARNESS_DIR/src" "$HARNESS_DIR/Cargo.toml" "$HARNESS_DIR/Cargo.lock" -newer "$HARNESS_BIN" -print -quit 2>/dev/null)" ]; then
  cargo build --locked $BUILD_ARGS --target-dir "$HARNESS_TARGET_DIR" --manifest-path "$HARNESS_DIR/Cargo.toml" --bin relay-teams-performance-iterate
fi

exec "$HARNESS_BIN" "$MODE" --workspace "$ROOT_DIR" "$@"
