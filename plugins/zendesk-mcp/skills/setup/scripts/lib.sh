# shellcheck shell=bash
# Shared helpers for the zendesk-mcp setup scripts. Sourced by each script,
# never run on its own. Everything here has to work on a fresh Mac: /bin/bash
# 3.2, no Homebrew, no Node on PATH, no jq, no python3, no git (python3 and git
# would pop the Xcode Command Line Tools installer).
set -euo pipefail

# Where this skill and the plugin live: scripts/ -> setup/ -> skills/ -> plugin root.
ZMCP_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
ZMCP_SKILL_DIR="$(cd "$ZMCP_SCRIPT_DIR/.." && pwd -P)"
ZMCP_PLUGIN_ROOT="$(cd "$ZMCP_SKILL_DIR/../.." && pwd -P)"

# Where the installed copy lives. Never inside the plugin directory: that path
# changes when the plugin updates. The ZENDESK_MCP_* overrides exist for tests.
ZMCP_HOME="${ZENDESK_MCP_HOME:-$HOME/.local/share/zendesk-mcp}"
ZMCP_CONFIG="${ZENDESK_MCP_CLAUDE_CONFIG:-$HOME/Library/Application Support/Claude/claude_desktop_config.json}"
ZMCP_SUBDOMAIN="${ZENDESK_MCP_SUBDOMAIN:-measurablhelp}"
# Where the server keeps its OAuth token (see token-persistence.ts in the server).
ZMCP_TOKEN_FILE="${XDG_CONFIG_HOME:-$HOME/.config}/fruggr/zendesk-mcp-server/${ZMCP_SUBDOMAIN}.json"
# Where the old Confluence guide had people clone and build the server.
ZMCP_OLD_GUIDE_CLONE="$HOME/dev/ai-zendesk-user-mcpserver"
ZMCP_MIN_NODE_MAJOR=20

# Output conventions: `key=value` lines and short human sentences on stdout;
# warnings and the single FAIL line on stderr. Every FAIL code has an entry in
# ../references/troubleshooting.md.
say() { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }
fail() {
  local code="$1"
  shift
  printf 'FAIL: %s %s\n' "$code" "$*" >&2
  exit 1
}

# The plugin's own version, read without jq or node (either may be missing).
plugin_version() {
  sed -n 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' \
    "$ZMCP_PLUGIN_ROOT/.claude-plugin/plugin.json" | head -n 1
}

installed_version() { cat "$ZMCP_HOME/VERSION" 2>/dev/null || true; }

# Major version of a Node binary, or nothing when it does not run.
node_major() { "$1" -p 'process.versions.node.split(".")[0]' 2>/dev/null || true; }

node_usable() {
  local major
  major="$(node_major "$1")"
  [ -n "$major" ] && [ "$major" -ge "$ZMCP_MIN_NODE_MAJOR" ] 2>/dev/null
}

# A `node` on PATH may be a version-manager shim (volta, fnm, asdf) that only
# works inside that manager's shell environment. Claude Desktop starts MCP
# servers with a minimal environment, so such a path would break there.
is_shim() {
  case "$1" in
    */.volta/* | */.asdf/shims/* | */fnm_multishells/* | */.local/share/fnm/*) return 0 ;;
  esac
  return 1
}

# The Node binary to run the server with, in order of preference: the private
# copy this plugin installed, then stable system-wide locations, then PATH, then
# the newest nvm install. Prints an absolute path; exits 1 when nothing usable
# exists. register.sh and ensure-node.sh call this with the same order, so the
# path written into the Claude config is the one that was checked.
find_node() {
  local candidate best="" best_major=0 major
  for candidate in "$ZMCP_HOME/node/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ] && node_usable "$candidate"; then
      say "$candidate"
      return 0
    fi
  done
  if candidate="$(command -v node 2>/dev/null)" && [ -n "$candidate" ] && ! is_shim "$candidate" && node_usable "$candidate"; then
    say "$candidate"
    return 0
  fi
  for candidate in "$HOME"/.nvm/versions/node/*/bin/node; do
    [ -x "$candidate" ] || continue
    major="$(node_major "$candidate")"
    if [ -n "$major" ] && [ "$major" -ge "$ZMCP_MIN_NODE_MAJOR" ] && [ "$major" -gt "$best_major" ]; then
      best="$candidate"
      best_major="$major"
    fi
  done
  if [ -n "$best" ]; then
    say "$best"
    return 0
  fi
  return 1
}

# Claude Desktop's main executable, wherever the app was installed.
claude_main_binary() {
  local dir
  for dir in /Applications "$HOME/Applications"; do
    if [ -d "$dir/Claude.app" ]; then
      say "$dir/Claude.app/Contents/MacOS/Claude"
      return 0
    fi
  done
  return 1
}
