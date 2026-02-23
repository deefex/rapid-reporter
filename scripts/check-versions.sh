#!/usr/bin/env bash

set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "🔍 Rapid Reporter Version Check"
echo "--------------------------------"

# Extract version from package.json
PACKAGE_VERSION=$(grep '"version"' package.json | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')

# Extract version from Cargo.toml
CARGO_VERSION=$(grep '^version' src-tauri/Cargo.toml | head -1 | sed -E 's/version[[:space:]]*=[[:space:]]*"([^"]+)"/\1/')

# Extract version from tauri.conf.json (if it exists)
TAURI_CONF_PATH="src-tauri/tauri.conf.json"
if [ -f "$TAURI_CONF_PATH" ]; then
  TAURI_CONF_VERSION=$(grep '"version"' "$TAURI_CONF_PATH" | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
else
  TAURI_CONF_VERSION="(not found)"
fi

echo "package.json        : ${PACKAGE_VERSION:-'(not found)'}"
echo "Cargo.toml          : ${CARGO_VERSION:-'(not found)'}"
echo "tauri.conf.json     : ${TAURI_CONF_VERSION}"
echo "--------------------------------"

if [ -n "$PACKAGE_VERSION" ] && [ -n "$CARGO_VERSION" ] && [ "$PACKAGE_VERSION" = "$CARGO_VERSION" ]; then
  echo "✅ package.json and Cargo.toml match"
else
  echo "❌ package.json and Cargo.toml DO NOT match"
  exit 1
fi