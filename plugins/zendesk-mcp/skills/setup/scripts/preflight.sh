#!/bin/bash
# Preflight for the Zendesk connector setup: is this a Mac with Claude Desktop,
# and what is already on it? Read-only. Prints `key=value` lines for the skill.
# Exit 0 = go ahead, 2 = stop (not a Mac, or no Claude Desktop), 1 = error.
. "$(dirname "$0")/lib.sh"

os="$(uname -s)"
if [ "$os" != "Darwin" ]; then
  say "OS=$os"
  say "STOP=not-macos"
  say "This setup only works in the Claude Desktop Code tab on a Mac. Open Claude Desktop on your Mac, switch to the Code tab, open any folder, and run /zendesk-mcp:setup there."
  exit 2
fi
arch="$(uname -m)"
case "$arch" in
  arm64 | x86_64) ;;
  *)
    say "ARCH=$arch"
    say "STOP=unsupported-arch"
    say "This Mac reports an architecture ($arch) the connector does not support."
    exit 2
    ;;
esac
say "OS=Darwin"
say "ARCH=$arch"
say "MACOS_VERSION=$(sw_vers -productVersion 2>/dev/null || echo unknown)"

if claude_app_installed; then
  say "CLAUDE_APP=present"
else
  say "CLAUDE_APP=missing"
  say "STOP=no-claude-desktop"
  say "Claude Desktop was not found in /Applications or ~/Applications. Install it from claude.ai/download, open it once, then run the setup again."
  exit 2
fi

say "CONFIG_PATH=$ZMCP_CONFIG"
if [ -f "$ZMCP_CONFIG" ]; then
  say "CONFIG_FILE=present"
  if grep -q '"zendesk"' "$ZMCP_CONFIG" 2>/dev/null; then
    say "CONFIG_MENTIONS_ZENDESK=yes"
  else
    say "CONFIG_MENTIONS_ZENDESK=no"
  fi
else
  say "CONFIG_FILE=missing"
  say "CONFIG_MENTIONS_ZENDESK=no"
fi

say "INSTALL_DIR=$ZMCP_HOME"
say "PLUGIN_VERSION=$(plugin_version)"
installed="$(installed_version)"
say "INSTALLED_VERSION=${installed:-none}"
if [ -f "$ZMCP_PLUGIN_ROOT/server/index.js" ] && [ -f "$ZMCP_PLUGIN_ROOT/server/package.json" ]; then
  say "PLUGIN_SERVER_FILES=present"
else
  say "PLUGIN_SERVER_FILES=missing"
fi
presence OLD_GUIDE_CLONE "$ZMCP_OLD_GUIDE_CLONE"
presence TOKEN_FILE "$ZMCP_TOKEN_FILE"
if node_path="$(find_node)"; then
  say "NODE_FOUND=$node_path"
  say "NODE_VERSION=$(node_version_bare "$node_path")"
else
  say "NODE_FOUND=none"
fi
say "PREFLIGHT=ok"
