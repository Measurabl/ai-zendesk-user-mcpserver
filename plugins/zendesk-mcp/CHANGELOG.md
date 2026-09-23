# Changelog

Releases of the `zendesk-mcp` Claude plugin. Versions are dates (`YYYY.M.D`,
with `+N` for a second release on the same day) and match
`.claude-plugin/plugin.json`. The bundled server is built from this repository
at the commit that cut the release; its own history is the repository's
`CHANGELOG.md`.

## 2026.9.23

First release.

- `/zendesk-mcp:setup` with the modes `install` (default), `verify`, `update`
  and `uninstall`, for the Claude Desktop Code tab on macOS.
- Bundled server: this repository's `src/` (upstream `@fruggr/zendesk-mcp-server`
  2.18.0 plus Measurabl's OAuth loopback and state fixes), one self-contained
  ESM file, Node 20 or newer.
- Node.js v24.21.0 (LTS) downloaded from nodejs.org only when the Mac has no
  Node 20+, verified against `SHASUMS256.txt` and a checksum pinned in the
  script.
- Replaces the manual Confluence guide; an entry left by that guide is detected
  and replaced, and an existing Zendesk sign-in is kept.
