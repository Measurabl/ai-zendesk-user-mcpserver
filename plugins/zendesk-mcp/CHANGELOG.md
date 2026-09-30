# Changelog

Releases of the `zendesk-mcp` Claude plugin. Versions are dates (`YYYY.M.D`,
with `+N` for a second release on the same day) and match
`.claude-plugin/plugin.json`. The bundled server is built from this repository
at the commit that cut the release; its own history is the repository's
`CHANGELOG.md`.

## 2026.9.30+1

The fixes that landed after the first release was vendored into the
organization marketplace, which shipped the plugin without them.

- Bundle rebuilt on patched runtime dependencies: undici 7.30.0 (a TLS
  certificate validation bypass in 7.29.0), fast-uri 3.1.8, and hono 4.13.9.
- The Claude relaunch job is one-shot: launchd re-runs a submitted job after
  every exit, so a failed self-removal could have reopened Claude each time it
  was quit.
- Claude Desktop config backups are owner-only and only the three most recent
  are kept; a backup that cannot be written stops the change with
  `FAIL: config-backup-failed` instead of a stack trace.

## 2026.9.30

First release.

- `/zendesk-mcp:setup` with the modes `install` (default), `verify`, `update`,
  and `uninstall`, for the Claude Desktop Code tab on macOS.
- Bundled server: this repository's `src/` (upstream `@fruggr/zendesk-mcp-server`
  2.18.0 plus Measurabl's OAuth loopback and state fixes), one self-contained
  ESM file. The connector is installed on Node 24 or newer.
- Node.js v24.21.0 (LTS) downloaded from nodejs.org only when the Mac has no
  Node 24 or newer (an older Node is ignored and left alone), verified against `SHASUMS256.txt` and a checksum pinned in the
  script.
- Replaces the manual Confluence guide; an entry left by that guide is detected
  and replaced, and an existing Zendesk sign-in is kept.
