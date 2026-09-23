#!/bin/bash
# Restarts Claude Desktop so it loads the new connector. Quitting Claude also
# ends the Code tab session that is running this script, so the relaunch is
# handed to launchd first: a one-off job waits for Claude to exit, reopens it,
# then unloads itself. Only then is Claude asked to quit.
# --dry-run prints what would happen without doing it. Exit 3 when the relaunch
# cannot be scheduled: the person then quits (Cmd+Q) and reopens Claude by hand.
. "$(dirname "$0")/lib.sh"

LABEL="com.measurabl.zendesk-mcp.relaunch"
BUNDLE_ID="com.anthropic.claudefordesktop"

main_bin="$(claude_main_binary)" || fail no-claude-desktop "Claude Desktop was not found in /Applications or ~/Applications."
# Runs under launchd (/bin/sh): poll until the main Claude process is gone (at
# most 90 s), reopen the app by bundle id, then remove this job.
job="i=0; while /bin/ps -axo comm | /usr/bin/grep -qx '$main_bin'; do /bin/sleep 1; i=\$((i+1)); if [ \"\$i\" -ge 90 ]; then break; fi; done; /bin/sleep 2; /usr/bin/open -b $BUNDLE_ID; /bin/sleep 5; /bin/launchctl remove $LABEL"

if [ "${1:-}" = "--dry-run" ]; then
  say "DRY_RUN=1"
  say "WOULD_SUBMIT=launchctl submit -l $LABEL -- /bin/sh -c \"$job\""
  say "WOULD_QUIT=osascript -e 'tell application id \"$BUNDLE_ID\" to quit'"
  exit 0
fi

launchctl remove "$LABEL" >/dev/null 2>&1 || true
if ! launchctl submit -l "$LABEL" -- /bin/sh -c "$job"; then
  say "RESTART=manual"
  printf 'FAIL: %s %s\n' relaunch-unavailable "Could not schedule the automatic relaunch. Quit Claude with Cmd+Q and open it again yourself." >&2
  exit 3
fi
say "RESTART=scheduled"
say "Claude will quit in a moment and reopen by itself."
sleep 1
if ! osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1; then
  # Automation permission denied or scripting unavailable: ask the process to
  # quit directly. Electron treats SIGTERM as a quit request.
  pid="$(ps -axo pid=,comm= | awk -v bin="$main_bin" '$2 == bin { print $1 }')"
  if [ -n "$pid" ]; then
    # shellcheck disable=SC2086
    kill -TERM $pid
  fi
fi
