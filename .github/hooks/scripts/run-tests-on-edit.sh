#!/usr/bin/env bash
# Runs Jest after the agent edits a .js file inside cli-playlistdownloader/.
# Exit 0  = pass (or not applicable — no tests run).
# Exit 1  = tests failed — non-blocking warning; agent can continue.
# Exit 2  = blocking error (not used here).

INPUT=$(cat)

# Only act on file-editing tools
if ! printf '%s' "$INPUT" | grep -qE '"tool_name"\s*:\s*"(edit_file|replace_string_in_file|multi_replace_string_in_file|create_file)"'; then
  exit 0
fi

# Only act when a .js file inside cli-playlistdownloader was touched
if ! printf '%s' "$INPUT" | grep -qE 'cli-playlistdownloader[^"]*\.js'; then
  exit 0
fi

# Run the test suite from the project directory
cd cli-playlistdownloader
npm test 2>&1
STATUS=$?

if [[ $STATUS -ne 0 ]]; then
  printf '\n[lint-on-save] Tests failed after file edit — review output above before continuing.\n' >&2
  exit 1
fi
