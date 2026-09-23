#!/bin/bash
# Removes the connector: its entry in Claude Desktop's config (after a backup)
# and the installed files under $ZMCP_HOME. The Zendesk sign-in token is left
# in place and reported; a second run with --tokens deletes it.
. "$(dirname "$0")/lib.sh"

if [ "${1:-}" = "--tokens" ]; then
  if [ -f "$ZMCP_TOKEN_FILE" ]; then
    rm -f "$ZMCP_TOKEN_FILE"
    rmdir "$(dirname "$ZMCP_TOKEN_FILE")" 2>/dev/null || true
    say "TOKENS=removed"
  else
    say "TOKENS=absent"
  fi
  say "TOKEN_FILE=$ZMCP_TOKEN_FILE"
  exit 0
fi

# The config edit comes first: it needs Node, and the private Node lives in the
# directory removed below.
if node_bin="$(find_node)"; then
  "$node_bin" "$ZMCP_SCRIPT_DIR/merge-config.mjs" --config "$ZMCP_CONFIG" --remove || exit 1
else
  say "CONFIG=manual"
  warn "No Node.js was found to edit the Claude Desktop config. Remove the \"zendesk\" block by hand: Claude > Settings > Developer > Edit Config."
fi

if [ -d "$ZMCP_HOME" ]; then
  rm -rf "$ZMCP_HOME"
  say "INSTALL_DIR=removed"
else
  say "INSTALL_DIR=absent"
fi
say "TOKEN_FILE=$ZMCP_TOKEN_FILE"
if [ -f "$ZMCP_TOKEN_FILE" ]; then
  say "TOKEN_FILE_STATUS=present"
else
  say "TOKEN_FILE_STATUS=absent"
fi
if [ -d "$ZMCP_OLD_GUIDE_CLONE" ]; then
  say "OLD_GUIDE_CLONE=present"
else
  say "OLD_GUIDE_CLONE=absent"
fi
say "RESTART_NEEDED=yes"
say "UNINSTALL=ok"
