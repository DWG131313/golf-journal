---
description: Exit demo mode and stop logging prompts to "Project prompts to share/".
---

# Exit demo mode

Danny is done recording. Do two things:

1. Run this Bash command to disable the prompt-logging hook:

```bash
rm -f "/Users/dannygross/CodingProjects/Golf Coach/.claude/demo-mode-active"
```

2. Output a **single short line** confirming demo mode is off and noting where the session file was saved. Something like:

> Demo mode off. Prompts captured in `Project prompts to share/demo-session-<timestamp>.md`. Back to normal collaboration.

To find the most recent session file, you can run:

```bash
ls -t "/Users/dannygross/CodingProjects/Golf Coach/Project prompts to share/" | head -3
```

Then stop. Drop the "walking the build from scratch" framing for all subsequent turns — respond normally as Claude Code.
