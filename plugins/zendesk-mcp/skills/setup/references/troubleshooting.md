# Troubleshooting the Zendesk connector setup

Read by the setup skill when a script fails or when a colleague reports a
problem. Plain language first; the technical detail is for whoever maintains
the connector. The server's own troubleshooting guide (sign-in flow, callback
port, token file, logs) is
[docs/troubleshooting.md in the source repository](https://github.com/Measurabl/ai-zendesk-user-mcpserver/blob/main/docs/troubleshooting.md).

<!-- PLACEHOLDER: paste the troubleshooting table from the Confluence page
     "Zendesk Connector for Claude" (space 1MSR) below this line, then delete
     this comment. Keep it as a Markdown table. -->

## Failure codes printed by the setup scripts

Every script ends a failure with one line: `FAIL: <code> <message>`.

| Code | What happened | What to do |
| --- | --- | --- |
| `not-macos` (exit 2) | The command ran somewhere other than a Mac, for example in a cloud or Cowork session. | Open Claude Desktop on the Mac, switch to the Code tab, open any folder, run `/zendesk-mcp:setup` there. |
| `no-claude-desktop` (exit 2) | Claude Desktop is not in /Applications or ~/Applications. | Install Claude Desktop from claude.ai/download, open it once, run the setup again. |
| `unsupported-arch` | The Mac is neither Apple silicon (arm64) nor Intel (x86_64). | Not supported; contact the maintainers. |
| `install-root-invalid` | The install folder resolved to something unsafe (empty, `/`, or the home folder itself). Only possible with a broken `ZENDESK_MCP_HOME` override. | Unset the override. |
| `plugin-incomplete` | The plugin copy on this Mac has no `server/index.js` or `server/package.json`. The organization plugin sync dropped or has not finished delivering them. | Quit and reopen Claude, wait a minute, try again. If it persists, the maintainers need to check the plugin sync. |
| `plugin-version-unreadable` | `.claude-plugin/plugin.json` in the plugin copy is missing or has no version. | Same as `plugin-incomplete`. |
| `node-download-failed` | nodejs.org could not be reached, or a download stopped. | Check the internet connection; a VPN or proxy may block nodejs.org. Try again. |
| `node-checksum-missing` | nodejs.org's checksum list has no entry for the pinned file (often a captive portal or proxy answering instead of nodejs.org). | Make sure the Mac is online without a captive portal, then try again. If it persists, the maintainers must re-pin the Node.js version. |
| `node-checksum-mismatch` | The checksum nodejs.org publishes, or the downloaded file, does not match the checksum pinned in the plugin. Nothing was installed. | Try again once. A repeat means something between the Mac and nodejs.org is altering the download, or the pin is stale; stop and tell the maintainers. |
| `node-extract-failed` | The Node.js archive could not be unpacked. | Check free disk space (about 250 MB needed), try again. |
| `node-broken` | The unpacked Node.js does not run on this Mac. | Tell the maintainers, with the macOS version. |
| `node-missing` | A later step needed Node.js but none was found. | Run `/zendesk-mcp:setup install` again from the start. |
| `install-copy-failed` | The server files could not be copied into the home folder. | Check disk space and that the home folder is writable, then retry. |
| `server-missing` | Registration ran before the connector was installed. | Run `/zendesk-mcp:setup install` again from the start. |
| `missing-arguments`, `bad-arguments` | Internal: a script was called with the wrong options. | Retry the step through the skill, with no extra options; if it repeats, tell the maintainers. |
| `config-unreadable` | Claude Desktop's settings file exists but could not be read (permissions, or a folder where the file should be). Nothing was written. | Check `~/Library/Application Support/Claude/claude_desktop_config.json` in Finder: it should be a file owned by this user. |
| `config-invalid-json` | Claude Desktop's settings file is not valid JSON (usually a hand edit from the old manual guide). Nothing was written. | In Claude Desktop: Settings > Developer > Edit Config. Fix the file or remove the broken part (a text editor that highlights JSON helps), save, then run the step again. When uninstalling, remove the `"zendesk"` block by hand instead. |
| `config-write-failed` | The settings file could not be written. | Check that `~/Library/Application Support/Claude` is writable, then retry. When uninstalling, remove the `"zendesk"` block by hand instead. |
| `relaunch-unavailable` (exit 3) | The automatic relaunch could not be scheduled with launchd. | Quit Claude with Cmd+Q and open it again. The install itself is complete. |
| `quit-refused` (exit 3) | Claude was asked to quit but was still running 25 seconds later (a macOS permission prompt may have been declined). | Quit Claude with Cmd+Q and open it again. The install itself is complete. |
| `verify-failed` | One or more `verify` checks failed; the `FAIL <check>:` lines above it say which. | See the check's row below. |

### `verify` checks

`verify` prints `PASS <check>: <detail>` or `FAIL <check>: <detail>` per check.

| Check | A `FAIL` means | What to do |
| --- | --- | --- |
| `config-file` | Claude Desktop's settings file is missing or not valid JSON. | Run `/zendesk-mcp:setup install`; for invalid JSON see `config-invalid-json` above. |
| `config-entry` | There is no `zendesk` entry, or it does not start the installed connector the expected way (something else edited it). | Run `/zendesk-mcp:setup install` again; it replaces the entry after a backup. |
| `installed-files` | The connector's files are gone from the home folder. | Run `/zendesk-mcp:setup install` again. |
| `node-binary` | The Node.js the entry points at is missing, too old, or only works inside a shell (a version-manager shim). | Run `/zendesk-mcp:setup install` again; it picks a Node.js that runs outside a shell or installs a private one. |
| `mcp-handshake` | The connector did not start or did not answer; the detail quotes what it said. | Usually fixed by `/zendesk-mcp:setup install` again (it replaces the files). If the detail mentions `EADDRINUSE`, see the port section below. |

## Symptoms

### The command `/zendesk-mcp:setup` is not offered in the Code tab

The plugin is not installed for this account yet, or Claude has not reloaded
it. Install it from the plugin catalog (Customize > Plugins > Browse plugins,
under the organization's plugins), then start a new Code tab session. In a
session that is already open, `/reload-plugins` picks up new plugins.

### Claude quit but did not reopen

Open Claude from Applications. The installation is complete; only the relaunch
failed. To find out why, the maintainers can run `restart-claude.sh --dry-run`
and check `launchctl list | grep zendesk-mcp`.

### The browser window for Okta never opened

The connector returns the sign-in link in the error message Claude shows for
that first request, and also writes it to Claude Desktop's MCP log,
`~/Library/Logs/Claude/mcp-server-zendesk.log`. Open the
`https://measurablhelp.zendesk.com/oauth/...` link in a browser, sign in,
click Allow, then ask the ticket question again. `/zendesk-mcp:setup verify`
confirms the connector itself starts.

### Claude says it is not authenticated on the first try

Known quirk. Reply "I've already done that" once the Okta window has been
completed; the next attempt works.

### "Port 27439 is already in use"

Another copy of the connector (for example the old manual install in a second
Claude window, or the Claude Code CLI) holds the sign-in port. Quit every
Claude window and reopen once. If the old manual install is still registered
with the Claude Code CLI, run `claude mcp remove zendesk` in a terminal, or
ignore it: Claude Desktop's entry takes precedence. The server can also be
told to use another port (`ZENDESK_OAUTH_CALLBACK_PORT`), but that port must
then be registered in the Zendesk OAuth client, so that is a maintainer change.

### Everything passes but Zendesk shows nothing

The connector acts with the person's own Zendesk permissions. They need a
Zendesk license with at least light-agent access (AEs and CSMs have this). Ask
them to sign in at measurablhelp.zendesk.com and compare.

## Where things live

| What | Where |
| --- | --- |
| Installed server and private Node.js | `~/.local/share/zendesk-mcp/` (`server/`, `node/`, `VERSION`) |
| Claude Desktop settings | `~/Library/Application Support/Claude/claude_desktop_config.json`, entry `mcpServers.zendesk`; backups beside it as `claude_desktop_config.json.zendesk-mcp-backup-<timestamp>` |
| Zendesk sign-in token (owner-only file) | `~/.config/fruggr/zendesk-mcp-server/measurablhelp.json` |
| Connector logs | `~/Library/Logs/Claude/mcp-server-zendesk.log` |
| Old manual-guide install, if any | `~/dev/ai-zendesk-user-mcpserver` and, for the Claude Code CLI, an entry in `~/.claude.json` |
