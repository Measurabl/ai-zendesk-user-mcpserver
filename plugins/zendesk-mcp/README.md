# zendesk-mcp: the Zendesk connector for Claude, as a plugin

A Claude plugin that lets any Measurabl colleague set up the Zendesk connector
for Claude Desktop from the Code tab on their Mac with one command,
`/zendesk-mcp:setup`, approving a few actions along the way. No terminal, no
Homebrew, no GitHub access, no files to edit. It replaces the manual Confluence
guide ("Zendesk Connector for Claude").

The plugin carries a prebuilt copy of this repository's MCP server
(`server/index.js`). Its one skill installs that copy into the person's home
directory, downloads Node.js if the Mac has none, registers the server with
Claude Desktop, and restarts Claude. Sign-in is unchanged: on first use the
server opens a browser for Measurabl SSO (Okta) and each person acts with their
own Zendesk permissions. The plugin ships no credentials of any kind.

## Quickstart for account executives

1. Open Claude Desktop on your Mac and switch to the **Code** tab.
2. If the plugin is not installed for you yet: **Customize → Plugins → Browse
   plugins**, find **Zendesk connector for Claude** under your organization's
   plugins, and install it.
3. Open any folder (your Documents folder is fine) to start a session.
4. Type `/zendesk-mcp:setup` and press Return. Read each message and click
   **Allow** when Claude asks; there are two or three such steps.
5. Claude quits and reopens by itself. When a browser window opens, sign in
   with Measurabl SSO (Okta) and click **Allow**.
6. Open a new chat and send: *Please check the Zendesk connector and tell me how
   many open tickets I can see.*

Later: `/zendesk-mcp:setup verify` checks the installation, `update` picks up a
newer plugin version, `uninstall` removes everything.

## How it works

- **Delivery.** The organization plugin sync copies the whole plugin directory
  to the Mac (Claude Desktop keeps it under its own support folder). Nothing is
  built or downloaded from GitHub on the AE's machine.
- **The skill** (`skills/setup/SKILL.md`) only runs the scripts in
  `skills/setup/scripts/`, in a fixed order, and explains each step in plain
  language before it runs. The read-only scripts (`preflight.sh`, `verify.sh`)
  and the copy into the connector's own folder in the home directory
  (`install-server.sh`) are pre-approved through `allowed-tools` as exact,
  argument-free commands; the Node download, the config edit, the restart, and
  uninstall each ask for approval.
- **Node.js.** `ensure-node.sh` reuses any Node 20+ already on the Mac
  (Homebrew, `/usr/local`, PATH, nvm), but only one that runs the way Claude
  Desktop will run it: with no PATH and no shell profile, so version-manager
  shims are never chosen. Otherwise it downloads the pinned Node.js LTS from
  nodejs.org into `~/.local/share/zendesk-mcp/node/`, after checking nodejs.org's
  `SHASUMS256.txt` against a checksum pinned in the script, and verifies the
  download against it.
- **Install location.** `~/.local/share/zendesk-mcp/` holds `server/`, `node/`
  (if downloaded), and `VERSION`, which `register.sh` writes only once the
  server is registered, so a failed registration is retried by `update`. The
  server never runs from inside the plugin directory, whose path changes on
  every plugin update.
- **Registration.** `merge-config.mjs` backs up
  `~/Library/Application Support/Claude/claude_desktop_config.json`, sets
  `mcpServers.zendesk` to the absolute Node path plus
  `[<server/index.js>, "measurablhelp", "--mode", "single"]`, keeps every other
  key, and writes atomically with owner-only permissions. An invalid file is
  never touched. Claude Desktop loads this entry into both the chat surface and
  Code tab sessions. An entry left by the old manual guide is replaced and
  reported.
- **Restart.** `restart-claude.sh` hands the relaunch to launchd (a one-off job
  that waits for Claude to exit, reopens it, then removes itself) and only then
  asks Claude to quit, because quitting Claude also ends the Code tab session
  running the script.
- **Verification.** `verify.mjs` checks the config entry, the files, and the
  Node binary, then starts the installed server the way Claude Desktop does
  (minimal environment) and completes a real MCP `initialize` + `tools/list`
  handshake over stdio. Neither request touches Zendesk, so no sign-in is
  triggered.
- **Tokens.** The server keeps the OAuth token at
  `~/.config/fruggr/zendesk-mcp-server/measurablhelp.json` (owner-only). The
  bundle keeps the upstream package name so this path is the same as for the
  old manual install; people who signed in before are not asked again. The
  scripts derive the path from the bundled package name, and a unit test holds
  it equal to what the server computes.
  `uninstall` reports the file and deletes it only on a second, explicit run
  (`--tokens`).

Failure modes and where things live: `skills/setup/references/troubleshooting.md`.

## Contents

| Path | Purpose |
| --- | --- |
| `.claude-plugin/plugin.json` | Plugin manifest. Its `version` is what triggers the organization sync; the development marketplace entry deliberately carries none. |
| `server/index.js`, `server/package.json` | Generated by `pnpm build:plugin`; committed. Do not edit by hand. |
| `skills/setup/SKILL.md` | The skill: modes, rules, and the messages the AE sees. |
| `skills/setup/scripts/` | `lib.sh` (shared), `preflight.sh`, `ensure-node.sh`, `install-server.sh`, `register.sh` + `merge-config.mjs`, `restart-claude.sh`, `verify.sh` + `verify.mjs`, `update.sh`, `uninstall.sh`. Bash 3.2 compatible, no tools beyond what macOS ships plus Node. |
| `skills/setup/references/troubleshooting.md` | Failure codes and symptoms. |
| `CHANGELOG.md` | Plugin release history. |

## Releasing a change

The plugin content is the source of truth **in this repository**; the
committed bundle must match the sources, and the version must change for the
sync to ship anything.

1. Make the change (server code under `src/`, or skill files here).
2. Run `pnpm build:plugin --bump`. It moves `version` in `plugin.json` to
   today's date (`YYYY.M.D`, or `YYYY.M.D+N` for a second release the same
   day; Claude compares version strings, not semver order), rebuilds `server/`,
   and prints the bundle's size and checksum.
3. Add an entry to `CHANGELOG.md`.
4. Open a PR. Two checks guard this directory and should be required on `main`
   (these are the job names a branch rule refers to): **Plugin version** fails
   when `plugins/zendesk-mcp/**` changed without a version bump; **Bundle fresh**
   rebuilds the bundle from the PR's sources and fails when it differs, except
   on a PR opened by a bot (Renovate, Dependabot), which only warns, because
   nobody rebuilds on a bot's behalf. Bundle fresh also runs on every push to
   `main` and weekly, where a stale bundle is an error: it means a release is
   due, and it is the one signal that the shipped dependencies lag the scanned
   lockfile. It also runs `claude plugin validate` when the plugin changed.
   The weekly upstream-sync PR needs `main` merged into it and a rebuild before
   it can pass either check.
5. After the merge, re-vendor the plugin into
   [`Measurabl/claude-org-management`](https://github.com/Measurabl/claude-org-management)
   (`plugins/zendesk-mcp/UPSTREAM.md` there has the recipe). That repository is
   the organization's registered marketplace; merging the version bump there
   triggers the sync to every Mac.

Local checks: `pnpm test` covers the manifests, `merge-config.mjs`, and the
token path; `claude plugin validate plugins/zendesk-mcp` checks the structure;
`claude --plugin-dir ./plugins/zendesk-mcp` loads the skill in a session for a
manual run. The scripts accept `ZENDESK_MCP_HOME`, `ZENDESK_MCP_CLAUDE_CONFIG`,
`ZENDESK_MCP_TOKEN_FILE`, and `ZENDESK_MCP_SUBDOMAIN` so they can be exercised
against scratch paths, and `ZENDESK_MCP_FORCE_DOWNLOAD=1` forces the Node
download. Never test against a real `claude_desktop_config.json`.

## Distribution

This repository is public, and Claude's organization marketplaces must be
private or internal, so the plugin is not distributed from here. It is
vendored, byte for byte, into `Measurabl/claude-org-management`, whose
`.claude-plugin/marketplace.json` the organization syncs from. The root
`.claude-plugin/marketplace.json` of this repository is a development
marketplace: engineers with the Claude Code CLI can install from it directly
(`/plugin marketplace add Measurabl/ai-zendesk-user-mcpserver`, then
`/plugin install zendesk-mcp@ai-zendesk-user-mcpserver`).

Steps only a human can do:

1. Merge the PR here; make the **Plugin version** and **Bundle fresh** jobs
   required checks on `main` (none are configured today; the ruleset is
   described in `docs/release-automation.md`).
2. Merge the vendoring PR in `claude-org-management` (a second CODEOWNER; the
   author does not merge their own PR there).
3. Organization admin: in **Organization settings → Plugins & skills**, confirm
   "Sync automatically" is on for the `Measurabl/claude-org-management`
   marketplace and set the install preference for **Zendesk connector for
   Claude**. "Available to install" lists it in the catalog for people to
   install themselves (step 2 of the quickstart); "Installed by default" gives
   it to everyone and removes that step.
4. Replace the Confluence guide's body with the quickstart above, and paste
   its troubleshooting table into
   `skills/setup/references/troubleshooting.md` (a normal release).
5. Run `docs/plugin-fresh-mac-test.md` on a fresh macOS user account.

The Zendesk OAuth client is unchanged: identifier `measurablhelp_zendesk`,
redirect `http://localhost:27439/callback`.

## Not yet verified on a fresh Mac

These are exercised by `docs/plugin-fresh-mac-test.md` and were not observable
from a developer machine: that the organization sync delivers `server/index.js`
intact; that `${CLAUDE_SKILL_DIR}` substitution and `allowed-tools`
pre-approval behave the same inside an organization-synced plugin as with
`--plugin-dir`; that the launchd relaunch survives Claude quitting and that
macOS does not ask an Automation permission for the quit; the exact number of
approval prompts an AE sees; that the Intel build of Node.js installs (only
Apple silicon was exercised here); and the Okta sign-in end to end.
