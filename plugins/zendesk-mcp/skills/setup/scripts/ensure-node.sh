#!/bin/bash
# Finds a Node.js 20 or newer for the connector, or installs a private, pinned
# copy under $ZMCP_HOME/node (nothing system-wide, no Homebrew, no sudo). The
# download is checked against nodejs.org's SHASUMS256.txt AND the checksum
# pinned below, so a corrupt or substituted file is never unpacked.
# Prints NODE=<absolute path>, NODE_VERSION=..., NODE_SOURCE=existing|private|downloaded.
# Test overrides: ZENDESK_MCP_FORCE_DOWNLOAD=1 skips the search; ZENDESK_MCP_HOME
# relocates the install. Idempotent: a matching private copy is reused.
. "$(dirname "$0")/lib.sh"

NODE_VERSION_PINNED="v24.21.0"
SHA256_ARM64="bed7eea5325e1108f32ce5228ddd6a5f0f08a499ee42aa7442aea583702f6057"
SHA256_X64="1462cb3b3046b815cf8ea436d3da450ec1a9f11dac7e5a46b0ada5305d7e8097"
NODE_DIST="https://nodejs.org/dist"

report() {
  say "NODE=$1"
  say "NODE_VERSION=$("$1" -p process.version)"
  say "NODE_SOURCE=$2"
}

if [ "${ZENDESK_MCP_FORCE_DOWNLOAD:-0}" != "1" ]; then
  if found="$(find_node)"; then
    case "$found" in
      "$ZMCP_HOME"/*) report "$found" private ;;
      *) report "$found" existing ;;
    esac
    exit 0
  fi
fi

arch="$(uname -m)"
case "$arch" in
  arm64) expected="$SHA256_ARM64" ;;
  x86_64) expected="$SHA256_X64" ;;
  *) fail unsupported-arch "This Mac reports architecture '$arch'; only arm64 and x86_64 are supported." ;;
esac
file="node-${NODE_VERSION_PINNED}-darwin-${arch}.tar.gz"
work="$ZMCP_HOME/tmp"
rm -rf "$work"
mkdir -p "$work"

say "Downloading Node.js $NODE_VERSION_PINNED for $arch from nodejs.org (about 53 MB)..."
curl -fsSL --retry 3 --connect-timeout 20 -o "$work/$file" "$NODE_DIST/$NODE_VERSION_PINNED/$file" ||
  fail node-download-failed "Could not download $file from nodejs.org. Check the internet connection (a VPN or proxy may block nodejs.org) and try again."
curl -fsSL --retry 3 --connect-timeout 20 -o "$work/SHASUMS256.txt" "$NODE_DIST/$NODE_VERSION_PINNED/SHASUMS256.txt" ||
  fail node-download-failed "Could not download the checksum list for Node.js $NODE_VERSION_PINNED from nodejs.org."

published="$(grep " $file\$" "$work/SHASUMS256.txt" | awk '{print $1}')"
[ -n "$published" ] || fail node-checksum-missing "nodejs.org's checksum list has no entry for $file."
[ "$published" = "$expected" ] ||
  fail node-checksum-mismatch "The checksum nodejs.org publishes for $file differs from the one pinned in this plugin. Nothing was installed. Tell the plugin maintainers."
if command -v shasum >/dev/null 2>&1; then
  actual="$(shasum -a 256 "$work/$file" | awk '{print $1}')"
else
  actual="$(openssl dgst -sha256 "$work/$file" | awk '{print $NF}')"
fi
[ "$actual" = "$expected" ] ||
  fail node-checksum-mismatch "The downloaded $file did not match its checksum (corrupt or tampered download). Nothing was installed; try again."

rm -rf "$ZMCP_HOME/node.tmp"
mkdir -p "$ZMCP_HOME/node.tmp"
tar -xzf "$work/$file" -C "$ZMCP_HOME/node.tmp" --strip-components=1 ||
  fail node-extract-failed "Could not unpack $file."
candidate="$ZMCP_HOME/node.tmp/bin/node"
[ "$("$candidate" -p process.version 2>/dev/null || true)" = "$NODE_VERSION_PINNED" ] ||
  fail node-broken "The downloaded Node.js does not run on this Mac."
rm -rf "$ZMCP_HOME/node"
mv "$ZMCP_HOME/node.tmp" "$ZMCP_HOME/node"
rm -rf "$work"
report "$ZMCP_HOME/node/bin/node" downloaded
