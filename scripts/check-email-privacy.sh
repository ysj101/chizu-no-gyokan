#!/bin/sh
# Adapted from the coordinator-provided email privacy reference; fail closed.
set -eu
exec python3 "$(dirname "$0")/email-privacy.py" "$@"
