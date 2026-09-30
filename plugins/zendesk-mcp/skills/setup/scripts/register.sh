#!/bin/bash
# Writes the connector's entry into Claude Desktop's config (or removes it with
# --remove), through merge-config.mjs: backup first, atomic write, nothing else
# in the file touched. Pass --dry-run to see what would change. After a real,
# successful registration the installed version is recorded in $ZMCP_HOME/VERSION,
# which is what marks the install complete for preflight.sh and update.sh.
. "$(dirname "$0")/lib.sh"

node_bin="$(find_node)" || fail node-missing "No usable Node.js was found. Run the Node step (ensure-node.sh) first."
if [ "${1:-}" = "--remove" ]; then
  shift
  "$node_bin" "$ZMCP_SCRIPT_DIR/merge-config.mjs" --config "$ZMCP_CONFIG" --remove "$@"
  exit 0
fi

server="$ZMCP_HOME/server/index.js"
[ -f "$server" ] || fail server-missing "The server is not installed at $server. Run the install step (install-server.sh) first."
version="$(plugin_version)"
[ -n "$version" ] || fail plugin-version-unreadable "Could not read the plugin version from .claude-plugin/plugin.json."

"$node_bin" "$ZMCP_SCRIPT_DIR/merge-config.mjs" \
  --config "$ZMCP_CONFIG" --node "$node_bin" --server "$server" --subdomain "$ZMCP_SUBDOMAIN" "$@"

case " $* " in
  *" --dry-run "*) ;;
  *)
    claim_install_root
    printf '%s\n' "$version" >"$ZMCP_HOME/VERSION"
    say "INSTALLED_VERSION=$version"
    ;;
esac
