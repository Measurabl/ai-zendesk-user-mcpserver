#!/bin/bash
# Brings the installed connector in line with the plugin: when the recorded
# version differs from the plugin's, the server is copied and registered again
# (both steps are idempotent, and register.sh records the version only after it
# succeeded, so a failed registration is retried next time). The plugin is the
# source of truth: whatever the organization ships is what should be installed.
# Prints STATUS=not-installed|up-to-date|updated.
. "$(dirname "$0")/lib.sh"

installed="$(installed_version)"
target="$(plugin_version)"
[ -n "$target" ] || fail plugin-version-unreadable "Could not read the plugin version from .claude-plugin/plugin.json."
say "PREVIOUS_VERSION=${installed:-none}"
say "PLUGIN_VERSION=$target"
if [ -z "$installed" ]; then
  say "STATUS=not-installed"
  say "Nothing is installed yet. Run /zendesk-mcp:setup install instead."
  exit 0
fi
if [ "$installed" = "$target" ]; then
  say "STATUS=up-to-date"
  exit 0
fi
bash "$ZMCP_SCRIPT_DIR/install-server.sh"
bash "$ZMCP_SCRIPT_DIR/register.sh"
say "STATUS=updated"
