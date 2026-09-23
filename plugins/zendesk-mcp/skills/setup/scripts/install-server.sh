#!/bin/bash
# Copies the plugin's prebuilt server into $ZMCP_HOME/server. The server is
# never run from inside the plugin directory, because that path changes
# whenever the plugin updates. Idempotent: the copy is staged beside the current
# one and swapped in, so a failed copy leaves the previous install working.
# The VERSION marker is written by register.sh, once the server is registered.
. "$(dirname "$0")/lib.sh"

src="$ZMCP_PLUGIN_ROOT/server"
if [ ! -f "$src/index.js" ] || [ ! -f "$src/package.json" ]; then
  fail plugin-incomplete "This copy of the plugin is missing its server files (server/index.js and server/package.json), so there is nothing to install. Tell the plugin maintainers."
fi
version="$(plugin_version)"
[ -n "$version" ] || fail plugin-version-unreadable "Could not read the plugin version from .claude-plugin/plugin.json."

claim_install_root
rm -rf "$ZMCP_HOME/server.tmp"
mkdir -p "$ZMCP_HOME/server.tmp"
cp -R "$src"/. "$ZMCP_HOME/server.tmp"/ || fail install-copy-failed "Could not copy the server files into $ZMCP_HOME."
rm -rf "$ZMCP_HOME/server.old"
if [ -d "$ZMCP_HOME/server" ]; then
  mv "$ZMCP_HOME/server" "$ZMCP_HOME/server.old"
fi
mv "$ZMCP_HOME/server.tmp" "$ZMCP_HOME/server"
rm -rf "$ZMCP_HOME/server.old"

say "SERVER=$ZMCP_HOME/server/index.js"
say "SERVER_VERSION=$version"
say "INSTALL=ok"
