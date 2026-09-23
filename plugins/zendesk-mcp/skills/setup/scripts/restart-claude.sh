#!/bin/bash
# Restarts Claude Desktop so it loads the new connector. Quitting Claude also
# ends the Code tab session that is running this script, so the relaunch is
# handed to launchd first: a one-off job waits for the Claude process to exit,
# reopens the app, then removes itself. Only then is Claude asked to quit, and
# the script waits for that to happen (it normally dies with the app).
# --dry-run prints what would happen without doing it.
# Exit 3 with RESTART=manual when the restart could not be completed
# automatically: the person then quits (Cmd+Q) and reopens Claude by hand.
. "$(dirname "$0")/lib.sh"

LABEL="com.measurabl.zendesk-mcp.relaunch"
BUNDLE_ID="com.anthropic.claudefordesktop"

claude_app_installed || fail no-claude-desktop "Claude Desktop was not found in /Applications or ~/Applications."

# Runs under launchd (/bin/sh): poll until no Claude main process is left (at
# most 90 s), reopen the app by bundle id, then remove this job. Every path
# exits 0: launchd would restart a job that fails.
job="i=0; while /bin/ps -axo comm | /usr/bin/grep -qE '${ZMCP_CLAUDE_MAIN_RE}'; do /bin/sleep 1; i=\$((i+1)); if [ \"\$i\" -ge 90 ]; then /bin/launchctl remove $LABEL; exit 0; fi; done; /bin/sleep 2; /usr/bin/open -b $BUNDLE_ID; /bin/sleep 5; /bin/launchctl remove $LABEL"

if [ "${1:-}" = "--dry-run" ]; then
  say "DRY_RUN=1"
  say "WOULD_SUBMIT=launchctl submit -l $LABEL -- /bin/sh -c \"$job\""
  say "WOULD_QUIT=osascript -e 'tell application id \"$BUNDLE_ID\" to quit' (fallback: kill -TERM <pid of $ZMCP_CLAUDE_MAIN_RE>)"
  exit 0
fi

pid="$(claude_main_pid)"
if [ -z "$pid" ]; then
  # Nothing to quit (run from a terminal, say): just open the app.
  open -b "$BUNDLE_ID"
  say "RESTART=opened"
  exit 0
fi

launchctl remove "$LABEL" >/dev/null 2>&1 || true
if ! launchctl submit -l "$LABEL" -- /bin/sh -c "$job"; then
  say "RESTART=manual"
  printf 'FAIL: %s %s\n' relaunch-unavailable "Could not schedule the automatic relaunch. Quit Claude with Cmd+Q and open it again yourself; the installation itself is complete." >&2
  exit 3
fi
say "RESTART=scheduled"
say "Claude will quit in a moment and reopen by itself."
sleep 1
if ! osascript -e "tell application id \"$BUNDLE_ID\" to quit" >/dev/null 2>&1; then
  # Automation permission declined or scripting unavailable: ask the process
  # directly. Electron treats SIGTERM as a quit request.
  kill -TERM "$pid" 2>/dev/null || true
fi

# Wait for the quit to land. This shell normally dies with Claude; if Claude is
# still running after 25 s the quit was refused, so undo the relaunch job and
# hand over to the person.
i=0
while [ -n "$(claude_main_pid)" ]; do
  sleep 1
  i=$((i + 1))
  if [ "$i" -ge 25 ]; then
    launchctl remove "$LABEL" >/dev/null 2>&1 || true
    say "RESTART=manual"
    printf 'FAIL: %s %s\n' quit-refused "Claude did not quit (a macOS permission prompt may have been declined). Quit Claude with Cmd+Q and open it again yourself; the installation itself is complete." >&2
    exit 3
  fi
done
say "RESTART=quit-observed"
