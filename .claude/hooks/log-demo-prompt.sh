#!/usr/bin/env bash
# UserPromptSubmit hook: while demo mode is active, append each prompt to a
# per-session markdown file in "Project prompts to share/".
#
# Activated by /demo-mode (creates the flag), deactivated by /demo-off.
# Silent no-op when the flag is absent — safe to leave registered always.

set -euo pipefail

PROJECT_ROOT="/Users/dannygross/CodingProjects/Golf Coach"
FLAG="$PROJECT_ROOT/.claude/demo-mode-active"
LOG_DIR="$PROJECT_ROOT/Project prompts to share"

# Silent exit if demo mode isn't on
[ -f "$FLAG" ] || exit 0

PAYLOAD=$(cat)

# Extract prompt text from the hook's JSON payload
PROMPT=$(python3 -c "
import json, sys
try:
    d = json.loads(sys.argv[1])
    print(d.get('prompt', ''))
except Exception:
    pass
" "$PAYLOAD")

# Skip empty prompts (e.g. the /demo-mode invocation itself comes through here
# but as a slash command — we still log it for completeness)
[ -n "$PROMPT" ] || exit 0

# Use the flag's mtime as the session timestamp so all prompts from the same
# demo run land in the same file
SESSION_STAMP=$(stat -f "%Sm" -t "%Y%m%d-%H%M%S" "$FLAG")
LOG_FILE="$LOG_DIR/demo-session-${SESSION_STAMP}.md"

mkdir -p "$LOG_DIR"

# Initialize the file with a header on first prompt of the session
if [ ! -f "$LOG_FILE" ]; then
    {
        echo "# Demo session — $(date '+%Y-%m-%d %H:%M:%S')"
        echo
        echo "Captured automatically while demo mode was active in Claude Code."
        echo
    } > "$LOG_FILE"
fi

# Append this prompt with a timestamp
{
    echo "## $(date '+%H:%M:%S')"
    echo
    echo '```'
    printf '%s\n' "$PROMPT"
    echo '```'
    echo
} >> "$LOG_FILE"

# Hooks must exit 0 to avoid blocking the prompt
exit 0
