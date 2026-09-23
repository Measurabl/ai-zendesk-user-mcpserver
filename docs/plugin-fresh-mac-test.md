# Manual test: the Zendesk connector plugin on a fresh Mac account

An end-to-end test of `/zendesk-mcp:setup` on a macOS user account that has
never had Node.js, Homebrew, or the connector. It exercises what cannot be
verified from a developer machine. Budget about 30 minutes.

## Before you start

- A **new macOS user account** on a Mac (System Settings → Users & Groups →
  Add User), logged in. Do not install Homebrew, Xcode tools, Node, or git.
- **Claude Desktop** installed in `/Applications` and signed in to a Measurabl
  account that belongs to the organization. The Code tab must be enabled.
- The plugin **available to that account**: either the organization admin set
  "Installed by default"/"Required" for **Zendesk connector for Claude**, or you
  install it yourself from **Customize → Plugins → Browse plugins** (under the
  organization's plugins). Record which.
- A Zendesk login for this person (Okta) with at least light-agent access.

Record as you go: every approval prompt (what it asked, what you clicked), any
macOS dialog, and anything Claude said that a non-engineer would not understand.

## Part 1: install

1. Open Claude Desktop → **Code** tab → open any folder (Documents).
2. Type `/` and confirm **zendesk-mcp:setup** is offered. If not: the plugin is
   not installed for this account, or `/reload-plugins` is needed. Record it.
3. Run `/zendesk-mcp:setup`.
   - Expected: a short plan in plain language, then a first script runs
     **without** a prompt (preflight). Note whether it ran silently.
   - Expected: an explanation that Node.js will be downloaded (about 53 MB),
     then a prompt for `ensure-node.sh`. Approve. Should finish in under a
     minute.
   - Expected: the server copy (`install-server.sh`) runs **without** a prompt.
   - Expected: an explanation of the settings change, then a prompt for
     `register.sh`. Approve.
   - Expected: before anything else, the three-point handoff (Claude will quit
     and reopen; browser sign-in with Okta and Allow; the test question to ask).
   - Expected: a prompt for `restart-claude.sh`. Approve.
4. Watch the Mac: Claude should quit and reopen by itself within ~10 seconds.
   Record: did it reopen? Did macOS show any dialog (for example an Automation
   permission request)? If Claude did not reopen, open it from Applications and
   record that the fallback was needed.
5. Count: how many approval prompts did steps 3 and 4 show in total? Expected 3.

## Part 2: first use and sign-in

6. In Claude Desktop, open a **new chat** and send exactly:
   *Please check the Zendesk connector and tell me how many open tickets I can see.*
7. Expected: a browser window opens on `measurablhelp.zendesk.com` (Okta). Sign
   in, click **Allow**. Note whether the tab closed itself.
8. Back in the chat: if Claude says it is not authenticated, reply
   *I've already done that*. Expected: a count of open tickets scoped to this
   person. Compare with measurablhelp.zendesk.com.
9. Also open a **Code** tab session and ask the same question there. Expected:
   the same connector answers (the Desktop entry is loaded into Code tab
   sessions).

## Part 3: verify, update, uninstall

10. Code tab: `/zendesk-mcp:setup verify`. Expected: four or five PASS lines in
    plain words, no prompt (verify is pre-approved), and a note that sign-in is
    tested by asking a question, not by this check.
11. `/zendesk-mcp:setup update`. Expected: "up to date", nothing changed.
12. `/zendesk-mcp:setup uninstall`. Expected: an explanation, one prompt,
    then confirmation that the settings entry and the folder are gone and that
    the sign-in file is still there, with an offer to remove it. Accept the
    offer (`--tokens`): one more prompt.
13. Quit and reopen Claude; in a new chat ask the ticket question. Expected:
    Claude no longer has the connector.
14. Finder → Go to Folder: confirm `~/.local/share/zendesk-mcp` and
    `~/.config/fruggr` are gone, and that
    `~/Library/Application Support/Claude/` contains a
    `claude_desktop_config.json.zendesk-mcp-backup-…` file per config change.

## Part 4: the failure paths (optional, 5 minutes)

15. Reinstall (`/zendesk-mcp:setup`), then break the config: Claude →
    Settings → Developer → Edit Config, add a stray character, save. Run
    `/zendesk-mcp:setup update` after editing `~/.local/share/zendesk-mcp/VERSION`
    to `2026.1.1` (TextEdit). Expected: a plain explanation that the settings
    file is not valid JSON and was left untouched, with the fix. Undo the edit.
16. Run `/zendesk-mcp:setup` in a Cowork or web session. Expected: it stops
    with the "only works in the Claude Desktop Code tab on a Mac" message
    (or the plugin does not offer the command there; record which).

## Report

Please send back, in this order:

| Item | Result |
| --- | --- |
| Install preference used ("Installed by default" or self-installed from the catalog) | |
| `server/index.js` was present in the synced plugin (preflight did not stop with `plugin-incomplete`) | |
| Number of approval prompts during install | |
| Preflight and the server copy ran without a prompt (pre-approval works in a synced plugin) | |
| Claude reopened by itself after the restart; any macOS dialog | |
| Okta sign-in worked; ticket count matched Zendesk | |
| Code tab session also had the connector | |
| verify / update / uninstall behaved as expected | |
| Anything Claude said that was confusing for a non-engineer | |
