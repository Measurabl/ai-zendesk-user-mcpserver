#!/bin/bash
# Brings the installed server up to the plugin's version: when the plugin is
# newer than the installed copy, re-runs the install and register steps. Prints
# STATUS=not-installed|up-to-date|updated|installed-is-newer and RESTART_NEEDED.
. "$(dirname "$0")/lib.sh"

# YYYY.M.D[+N] as one sortable integer: 2026.9.23+1 -> 20260923001.
version_number() {
  local v="$1" base build y m d
  base="${v%%+*}"
  if [ "$base" = "$v" ]; then build=0; else build="${v#*+}"; fi
  IFS=. read -r y m d <<EOF
$base
EOF
  printf '%04d%02d%02d%03d\n' "${y:-0}" "${m:-0}" "${d:-0}" "${build:-0}" 2>/dev/null || printf '0\n'
}

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

have="$(version_number "$installed")"
want="$(version_number "$target")"
if [ "$want" -gt "$have" ]; then
  bash "$ZMCP_SCRIPT_DIR/install-server.sh"
  bash "$ZMCP_SCRIPT_DIR/register.sh"
  say "STATUS=updated"
  say "RESTART_NEEDED=yes"
elif [ "$want" -eq "$have" ]; then
  say "STATUS=up-to-date"
  say "RESTART_NEEDED=no"
else
  warn "The installed copy ($installed) is newer than this plugin ($target); leaving it alone."
  say "STATUS=installed-is-newer"
  say "RESTART_NEEDED=no"
fi
