#!/usr/bin/env bash
# One-command installer for dsh-nanogpt.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/Fynth/dsh-nanogpt/main/scripts/install.sh | bash -s -- web
#   ./scripts/install.sh web
#   DSH_PROFILE=web ./scripts/install.sh
#
# Requires DSH and git on PATH. The tagged GitHub source is installed through
# the profile's package manager; DSH then selects the bundle automatically.
set -euo pipefail

PROFILE="${1:-${DSH_PROFILE:-web}}"
REPO="${DSH_NANOGPT_REPO:-Fynth/dsh-nanogpt}"
VERSION="${DSH_NANOGPT_VERSION:-v0.1.1}"
SPEC="${DSH_NANOGPT_SPEC:-github:${REPO}#${VERSION}}"

echo "dsh-nanogpt ${VERSION} -> profile ${PROFILE}"
dsh plugin --profile "$PROFILE" add "$SPEC"

cat <<'MSG'

Installed. DSH loads plugin JavaScript at process start, so restart DSH once:
  - terminal: Ctrl+C, then `dsh web` (or your normal profile command)
  - desktop: fully quit and reopen the app

Then open Settings -> NanoGPT, save the API key through Connection, and run
Test connection. The key is stored write-only in the DSH credential store.
MSG
