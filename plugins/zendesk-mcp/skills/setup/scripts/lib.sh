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
# Where the old Confluence guide had people clone and build the server.
ZMCP_OLD_GUIDE_CLONE="$HOME/dev/ai-zendesk-user-mcpserver"
ZMCP_MIN_NODE_MAJOR=20
# Claude Desktop's main executable, as `ps -o comm` prints it, wherever the app lives.
ZMCP_CLAUDE_MAIN_RE='/Claude\.app/Contents/MacOS/Claude$'

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

# uninstall.sh and install-server.sh remove directories under ZMCP_HOME; refuse
# an install root that would make that catastrophic.
case "$ZMCP_HOME" in
  "" | / | "$HOME" | "$HOME/") fail install-root-invalid "Refusing to use '$ZMCP_HOME' as the connector's folder." ;;
esac

# The scripts only ever write into, or remove, a folder they created themselves,
# recognised by this marker. A pre-existing, non-empty folder without it (a
# mis-set ZENDESK_MCP_HOME, say) is refused rather than reused or deleted.
ZMCP_MARKER="$ZMCP_HOME/.zendesk-mcp"
claim_install_root() {
  if [ -d "$ZMCP_HOME" ] && [ ! -f "$ZMCP_MARKER" ] && [ -n "$(ls -A "$ZMCP_HOME" 2>/dev/null)" ]; then
    fail install-root-unrecognized "The folder '$ZMCP_HOME' already exists and is not a connector install. Refusing to write into it."
  fi
  mkdir -p "$ZMCP_HOME"
  : >"$ZMCP_MARKER"
}
install_root_is_ours() { [ -f "$ZMCP_MARKER" ]; }

# Reads a top-level "key": "value" string out of a small JSON file without jq
# or node (either may be missing). Prints nothing when the file or key is
# absent, so callers can fail with their own code instead of a raw sed error.
json_string() {
  sed -n "s/^[[:space:]]*\"$2\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" "$1" 2>/dev/null | head -n 1 || true
}

plugin_version() { json_string "$ZMCP_PLUGIN_ROOT/.claude-plugin/plugin.json" version; }

# Written by register.sh once the server is installed AND registered, so a
# failed registration is retried by `update` instead of being reported as done.
installed_version() { cat "$ZMCP_HOME/VERSION" 2>/dev/null || true; }

# The server's OAuth token file. The server derives the directory from its own
# package name (`@fruggr/zendesk-mcp-server` -> `fruggr/zendesk-mcp-server`, see
# src/auth/token-persistence.ts) under ~/.config: Claude Desktop starts it with
# a minimal environment, so an XDG_CONFIG_HOME exported in a shell profile never
# reaches it. The name is read from the bundled package.json so this cannot
# drift from what ships. ZENDESK_MCP_TOKEN_FILE overrides for tests.
token_file() {
  local name scope pkg
  name="$(json_string "$ZMCP_PLUGIN_ROOT/server/package.json" name)"
  [ -n "$name" ] || name="@fruggr/zendesk-mcp-server"
  case "$name" in
    @*/*)
      scope="${name%%/*}"
      scope="${scope#@}"
      pkg="${name#*/}"
      printf '%s/.config/%s/%s/%s.json\n' "$HOME" "$scope" "$pkg" "$ZMCP_SUBDOMAIN"
      ;;
    *) printf '%s/.config/%s/%s.json\n' "$HOME" "$name" "$ZMCP_SUBDOMAIN" ;;
  esac
}
ZMCP_TOKEN_FILE="${ZENDESK_MCP_TOKEN_FILE:-$(token_file)}"

# `KEY=present|absent` for a path.
presence() {
  if [ -e "$2" ]; then say "$1=present"; else say "$1=absent"; fi
}

# Runs a Node binary the way Claude Desktop runs MCP servers: no PATH, no shell
# profile, working directory /. A real Node answers with its version; a
# version-manager shim (volta, fnm, asdf, mise, proto, nodenv...) that needs its
# manager's environment does not, and is therefore never written into the config.
node_version_bare() {
  (cd / && env -i HOME="$HOME" "$1" -p 'process.version') 2>/dev/null || true
}

node_major_bare() {
  local version
  version="$(node_version_bare "$1")"
  case "$version" in
    v[0-9]*)
      version="${version#v}"
      printf '%s\n' "${version%%.*}"
      ;;
  esac
}

node_usable() {
  local major
  major="$(node_major_bare "$1")"
  [ -n "$major" ] && [ "$major" -ge "$ZMCP_MIN_NODE_MAJOR" ] 2>/dev/null
}

# The Node binary to run the server with, in order of preference: the private
# copy this plugin installed, then stable system-wide locations, then PATH, then
# the newest nvm install (judged by directory name; only candidates in that
# order are executed). Prints an absolute path; exits 1 when nothing usable
# exists. register.sh and ensure-node.sh both call this, so the path written
# into the Claude config is the one that was checked.
find_node() {
  local candidate version
  for candidate in "$ZMCP_HOME/node/bin/node" /opt/homebrew/bin/node /usr/local/bin/node; do
    if [ -x "$candidate" ] && node_usable "$candidate"; then
      say "$candidate"
      return 0
    fi
  done
  if candidate="$(command -v node 2>/dev/null)" && [ -n "$candidate" ] && node_usable "$candidate"; then
    say "$candidate"
    return 0
  fi
  for version in $(ls -d "$HOME"/.nvm/versions/node/v* 2>/dev/null | sed 's|.*/v||' | sort -t. -k1,1nr -k2,2nr -k3,3nr || true); do
    candidate="$HOME/.nvm/versions/node/v$version/bin/node"
    if [ -x "$candidate" ] && node_usable "$candidate"; then
      say "$candidate"
      return 0
    fi
  done
  return 1
}

# PID of the running Claude Desktop main process (whichever copy is running).
claude_main_pid() {
  ps -axo pid=,comm= | sed -n "s|^ *\([0-9][0-9]*\) .*${ZMCP_CLAUDE_MAIN_RE}|\1|p" | head -n 1
}

# Whether Claude Desktop is installed at all (/Applications or ~/Applications).
claude_app_installed() {
  [ -d /Applications/Claude.app ] || [ -d "$HOME/Applications/Claude.app" ]
}
