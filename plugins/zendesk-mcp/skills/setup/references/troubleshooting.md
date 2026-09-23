# Troubleshooting the Zendesk connector setup

Read by the setup skill when a script fails or when a colleague reports a
problem. Plain language first; the technical detail is for whoever maintains
the connector.

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
| `plugin-incomplete` | The plugin copy on this Mac has no `server/index.js` or `server/package.json`. The organization plugin sync dropped or has not finished delivering them. | Quit and reopen Claude, wait a minute, try again. If it persists, the maintainers need to check the plugin sync. |
| `plugin-version-unreadable` | `.claude-plugin/plugin.json` in the plugin copy could not be read. | Same as `plugin-incomplete`. |
| `node-download-failed` | nodejs.org could not be reached or the download stopped. | Check the internet connection; a VPN or proxy may block nodejs.org. Try again. |
| `node-checksum-missing` | nodejs.org's checksum list has no entry for the pinned file. | Try again later; if it persists, the maintainers must re-pin the Node.js version. |
| `node-checksum-mismatch` | The downloaded file (or the checksum nodejs.org publishes) does not match the checksum pinned in the plugin. Nothing was installed. | Try again once. A repeat means something between the Mac and nodejs.org is altering the download, or the pin is stale; stop and tell the maintainers. |
| `node-extract-failed` | The Node.js archive could not be unpacked. | Check free disk space (about 250 MB needed), try again. |
| `node-broken` | The unpacked Node.js does not run on this Mac. | Tell the maintainers, with the macOS version. |
| `node-missing` | A later step needed Node.js but none was found. | Run `/zendesk-mcp:setup install` again from the start. |
| `install-copy-failed` | The server files could not be copied into the home folder. | Check disk space and that the home folder is writable, then retry. |
| `server-missing` | Registration ran before the connector was installed. | Run `/zendesk-mcp:setup install` again from the start. |
| `missing-arguments` | Internal: the register step was called without the Node or server path. | Retry the install; if it repeats, tell the maintainers. |
| `config-invalid-json` | Claude Desktop's settings file is not valid JSON (usually a hand edit from the old manual guide). Nothing was written. | In Claude Desktop: Settings > Developer > Edit Config. Fix the file or remove the broken part (a text editor that highlights JSON helps), save, then run the setup again. |
| `config-write-failed` | The settings file could not be written. | Check that `~/Library/Application Support/Claude` is writable, then retry. |
| `config-remove-failed` | Uninstall could not remove the entry from the settings file. | Remove the `"zendesk"` block by hand: Settings > Developer > Edit Config. |
| `relaunch-unavailable` (exit 3) | The automatic relaunch could not be scheduled with launchd. | Quit Claude with Cmd+Q and open it again. The install itself is complete. |

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

The connector prints the sign-in link into Claude Desktop's MCP log:
`~/Library/Logs/Claude/mcp-server-zendesk.log`. Open the `https://measurablhelp.zendesk.com/oauth/...`
line from that file in a browser, sign in, click Allow, then ask the ticket
question again. `/zendesk-mcp:setup verify` confirms the connector itself
starts.

### Claude says it is not authenticated on the first try

Known quirk. Reply "I've already done that" once the Okta window has been
completed; the next attempt works.

### "Port 27439 is already in use"

Another copy of the connector (for example the old manual install in a second
Claude window, or Claude Code) holds the sign-in port. Quit every Claude window
and reopen once. If the old manual install is still registered with the Claude
Code CLI, run `claude mcp remove zendesk` in a terminal, or ignore it: Claude
Desktop's entry takes precedence.

### `/zendesk-mcp:setup verify` fails on `mcp-handshake`

The connector did not start. The detail on the FAIL line quotes what the
server said. Typical causes: the Node.js in the settings entry was removed
(re-run install), or the installed files are damaged (re-run install, which
replaces them).

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
