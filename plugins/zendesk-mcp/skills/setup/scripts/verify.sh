#!/bin/bash
# Read-only check of the installed connector: config entry, files, Node, and a
# real MCP handshake against the installed server (see verify.mjs). Exit 0 when
# every check passed.
. "$(dirname "$0")/lib.sh"

node_bin="$(find_node)" || fail node-missing "No usable Node.js was found, so the connector cannot run. Run /zendesk-mcp:setup install."
exec "$node_bin" "$ZMCP_SCRIPT_DIR/verify.mjs" --config "$ZMCP_CONFIG" --home "$ZMCP_HOME" "$@"
