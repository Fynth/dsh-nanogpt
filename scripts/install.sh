#!/usr/bin/env bash
# One-command installer for dsh-nanogpt.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Fynth/dsh-nanogpt/main/scripts/install.sh | bash -s -- web
#   ./scripts/install.sh web
#   DSH_PROFILE=web ./scripts/install.sh
#
# Requires DSH on PATH and network access to GitHub.
set -euo pipefail

PROFILE="${1:-${DSH_PROFILE:-web}}"
REPO="${DSH_NANOGPT_REPO:-Fynth/dsh-nanogpt}"
VERSION="${DSH_NANOGPT_VERSION:-0.1.1}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "dsh-nanogpt ${VERSION} -> profile ${PROFILE}"
if ! curl -fL --retry 3 --connect-timeout 15 -o "$WORK/plugin.tgz" \
  "https://github.com/${REPO}/releases/download/v${VERSION}/dsh-nanogpt-${VERSION}.tgz"; then
  echo "release asset unavailable; using the repository dist artifact"
  curl -fL --retry 3 --connect-timeout 15 -o "$WORK/plugin.tgz" \
    "https://raw.githubusercontent.com/${REPO}/main/dist/dsh-nanogpt-${VERSION}.tgz"
fi

dsh plugin --profile "$PROFILE" add "$WORK/plugin.tgz"

cat <<'EOF'

Installed. DSH loads plugin JavaScript at process start, so restart DSH once:
  - terminal: Ctrl+C, then `dsh web` (or your normal profile command)
  - desktop: fully quit and reopen the app

Then open Settings -> NanoGPT, save the API key through Connection, and run
Test connection. The key is stored write-only in the DSH credential store.
EOF
