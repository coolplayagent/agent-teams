#!/usr/bin/env sh
set -eu

INSTALL_EVALS=1

usage() {
  echo "Usage: sh setup.sh [--no-evals]"
  echo ""
  echo "Options:"
  echo "  --no-evals    Skip the evals dependency group."
  echo "  -h, --help    Show this help message."
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-evals)
      INSTALL_EVALS=0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "[Error] Unknown option: $1"
      usage
      exit 1
      ;;
  esac
  shift
done

echo "Checking Python environment..."
PYTHON_BIN=""
if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

if [ -z "$PYTHON_BIN" ]; then
  echo "[Error] Python not found."
  exit 1
fi

echo "Checking uv..."
UV_MODE=""
if "$PYTHON_BIN" -m uv --version >/dev/null 2>&1; then
  UV_MODE="python-module"
elif command -v uv >/dev/null 2>&1; then
  UV_MODE="executable"
else
  echo "uv not found, installing uv......"
  if ! "$PYTHON_BIN" -m pip install uv >/dev/null 2>&1; then
    echo "[Error] uv install failed."
    exit 1
  fi
fi

if [ -z "$UV_MODE" ]; then
  UV_MODE="python-module"
fi

run_uv() {
  if [ "$UV_MODE" = "python-module" ]; then
    "$PYTHON_BIN" -m uv "$@"
    return
  fi
  uv "$@"
}

if [ -f "uv.lock" ]; then
  rm -f uv.lock
fi

export UV_NATIVE_TLS=1
if [ "$INSTALL_EVALS" = "1" ]; then
  echo "Installing dependencies (including dev tools and evals)..."
  if ! run_uv sync --all-extras --index-strategy unsafe-best-match; then
    echo "[Error] Dependency installation failed."
    exit 1
  fi
else
  echo "Installing dependencies (including dev tools, excluding evals)..."
  if ! run_uv sync --all-extras --no-group evals --index-strategy unsafe-best-match; then
    echo "[Error] Dependency installation failed."
    exit 1
  fi
fi

echo "Installing project entry points..."
if ! run_uv pip install -e .; then
  echo "[Error] Editable project install failed."
  exit 1
fi

echo "install git hooks...."
if run_uv run pre-commit install; then
  echo "Git Hooks install successful"
else
  echo ""
  echo "[WARNING] Git Hooks install failed"
fi

echo "Environment setup completed."
