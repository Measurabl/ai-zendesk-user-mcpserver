#!/bin/bash
# Finds a Node.js 20 or newer for the connector, or installs a private, pinned
# copy under $ZMCP_HOME/node (nothing system-wide, no Homebrew, no sudo).
# nodejs.org's checksum list is fetched first and compared with the checksum
# pinned below, so a stale pin fails before the 53 MB download; the downloaded
# file is then verified against that checksum before it is unpacked.
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
  say "NODE_VERSION=$(node_version_bare "$1")"
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

# nodejs.org names the builds darwin-arm64 and darwin-x64 (not x86_64).
case "$(uname -m)" in
  arm64)
    node_arch="arm64"
    expected="$SHA256_ARM64"
    ;;
  x86_64)
    node_arch="x64"
    expected="$SHA256_X64"
    ;;
  *) fail unsupported-arch "This Mac reports architecture '$(uname -m)'; only Apple silicon (arm64) and Intel (x86_64) are supported." ;;
esac
file="node-${NODE_VERSION_PINNED}-darwin-${node_arch}.tar.gz"
work="$ZMCP_HOME/tmp"
rm -rf "$work"
mkdir -p "$work"
trap 'rm -rf "$work"' EXIT

curl -fsSL --retry 3 --connect-timeout 20 -o "$work/SHASUMS256.txt" "$NODE_DIST/$NODE_VERSION_PINNED/SHASUMS256.txt" ||
  fail node-download-failed "Could not reach nodejs.org to download Node.js $NODE_VERSION_PINNED. Check the internet connection (a VPN or proxy may block nodejs.org) and try again."
published="$(grep " $file\$" "$work/SHASUMS256.txt" | awk '{print $1}' || true)"
[ -n "$published" ] || fail node-checksum-missing "nodejs.org's checksum list has no entry for $file."
[ "$published" = "$expected" ] ||
  fail node-checksum-mismatch "The checksum nodejs.org publishes for $file differs from the one pinned in this plugin. Nothing was downloaded or installed. Tell the plugin maintainers."

say "Downloading Node.js $NODE_VERSION_PINNED for $node_arch from nodejs.org (about 53 MB)..."
curl -fsSL --retry 3 --connect-timeout 20 -o "$work/$file" "$NODE_DIST/$NODE_VERSION_PINNED/$file" ||
  fail node-download-failed "Could not download $file from nodejs.org. Check the internet connection (a VPN or proxy may block nodejs.org) and try again."
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
[ "$(node_version_bare "$candidate")" = "$NODE_VERSION_PINNED" ] ||
  fail node-broken "The downloaded Node.js does not run on this Mac."
rm -rf "$ZMCP_HOME/node"
mv "$ZMCP_HOME/node.tmp" "$ZMCP_HOME/node"
report "$ZMCP_HOME/node/bin/node" downloaded
