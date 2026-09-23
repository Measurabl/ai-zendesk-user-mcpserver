#!/bin/bash
# Writes the connector's entry into Claude Desktop's config (or removes it with
# --remove), through merge-config.mjs: backup first, atomic write, nothing else
# in the file touched. Pass --dry-run to see what would change.
. "$(dirname "$0")/lib.sh"

node_bin="$(find_node)" || fail node-missing "No usable Node.js was found. Run the Node step (ensure-node.sh) first."
if [ "${1:-}" = "--remove" ]; then
  shift
  exec "$node_bin" "$ZMCP_SCRIPT_DIR/merge-config.mjs" --config "$ZMCP_CONFIG" --remove "$@"
fi
server="$ZMCP_HOME/server/index.js"
[ -f "$server" ] || fail server-missing "The server is not installed at $server. Run the install step (install-server.sh) first."
exec "$node_bin" "$ZMCP_SCRIPT_DIR/merge-config.mjs" \
  --config "$ZMCP_CONFIG" --node "$node_bin" --server "$server" --subdomain "$ZMCP_SUBDOMAIN" "$@"
