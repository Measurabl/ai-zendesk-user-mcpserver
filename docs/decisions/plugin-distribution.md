# Claude Desktop plugin: a committed bundle, vendored into the org marketplace

> **Build documentation, not user documentation.** This records why the
> Measurabl Claude Desktop plugin under `plugins/zendesk-mcp/` is shaped the way
> it is: a committed server bundle, a date-based version, and distribution
> through a second repository. How to install, release, or troubleshoot it is
> in [`plugins/zendesk-mcp/README.md`](../../plugins/zendesk-mcp/README.md).

| | |
| --- | --- |
| **Status** | Decided and applied |
| **Date** | 2026-09-23 |
| **Question** | How does a non-technical Measurabl colleague get this server running in Claude Desktop with one command, when they have no terminal habit, cannot reach this repository on GitHub, and their Mac has no Node.js? |
| **Answer** | A Claude plugin whose single skill runs a fixed set of scripts. The plugin **carries a committed, self-contained build of the server**; the scripts install it under `~/.local/share/zendesk-mcp/`, download a pinned Node.js when none exists, add one entry to `claude_desktop_config.json`, and restart Claude. The plugin is developed here and **vendored into `Measurabl/claude-org-management`** for distribution, because this repository is public. |

## 1. The constraints

- **The person.** No terminal, no GitHub account, no downloads they perform,
  nothing that asks for the Mac password. That rules out Homebrew and `sudo`,
  and also `git` and `python3`: on a fresh Mac both are stubs that pop the Xcode
  Command Line Tools installer. Scripts may use `bash` 3.2, `curl`, `tar`,
  `shasum`, `osascript`, `open`, `launchctl`, and Node once it exists.
- **The delivery channel.** The Claude organization plugin sync ships the
  repository files as they are: no build step, no `node_modules`, a 50 MB cap,
  and it drops executable bits (so scripts are invoked as `bash <path>`). It
  materializes the whole plugin tree, including directories Claude itself
  ignores, such as `server/`.
- **The repository.** `Measurabl/ai-zendesk-user-mcpserver` is a public fork
  of `fruggr/zendesk-mcp-server`. Anthropic's help center requires organization
  marketplaces to be private or internal, and GitHub does not let a fork change
  visibility. `Measurabl/claude-org-management` is internal, is the
  organization's registered marketplace, and already vendors plugins from other
  repositories.
- **Claude Desktop.** It starts MCP servers with a minimal environment, so the
  config must hold absolute paths and a Node that works without a shell (no
  version-manager shims). Servers in `claude_desktop_config.json` are loaded
  into both the chat surface and Code tab sessions; a restart is needed to pick
  up a new entry.
- **Authentication stays as it is.** Per-user OAuth 2.1 PKCE in the browser,
  token at `~/.config/fruggr/zendesk-mcp-server/<subdomain>.json`. The plugin
  ships no credentials.

## 2. Decisions

### 2.1 A committed, single-file bundle (esbuild)

Building on the AE's Mac needs pnpm and the toolchain; `npx` needs npm, a
registry publish under the upstream's name, and network at every start. So the
server is bundled here, into one ESM file with every dependency inlined, and
the file is committed next to the skill. esbuild does the bundling: it is
already in the dependency tree (tsx and tsdown depend on it, and it is on the
`allowBuilds` list), and it produces deterministic output. The one shim it
needs is a `createRequire` banner, because the ESM output leaves CommonJS
`require` to the host.

Measured: 3.75 MB, identical sha256 across rebuilds including after deleting the
output directory, no absolute paths in the file, and a successful `initialize`
+ `tools/list` handshake from a directory with no `node_modules` on Node 20 and
Node 24.

`server/package.json` is generated beside it: `"type": "module"` so Node runs
`index.js` as ESM, and the `name`/`version` that `src/utils/package-info.ts`
reads at runtime. The name stays `@fruggr/zendesk-mcp-server` on purpose:
`src/auth/token-persistence.ts` derives the token directory from it, so a
person who signed in through the old manual install keeps that sign-in. The
version is the **plugin** version, not the root `package.json` version, which
semantic-release would move underneath a committed bundle.

### 2.2 A date version that is still semver-shaped

`YYYY.M.D`, no zero padding, plus `+N` build metadata for a same-day
re-release: `2026.9.23`, `2026.9.23+1`. Three numeric segments satisfy Claude's
plugin tooling, which expects semver, and the `claude-org-management` linter,
which enforces `x.y.z` on the vendored copy. Measurabl's `chad-gpt` plugin
already documents that exact convention. Update detection compares version
strings, not semver precedence (the plugin docs: users receive an update when
the string changes), so build metadata is a real bump. The development
marketplace entry carries no version of its own: `plugin.json` always wins,
and the docs advise against setting both. The `customer-360` convention
(`2026.8.21.3`) was not adopted because four segments fail that linter, which
is why its vendored copy has to be re-versioned by hand on every re-vendor.

### 2.3 `Bundle fresh` fails a stale bundle, except for bots

The check rebuilds the bundle on every PR from the PR's own head commit and
lockfile and fails when the result differs, unless a bot (Renovate,
Dependabot) opened the PR: nobody rebuilds on a bot's behalf (no bot commits,
a deliberate choice), so a dependency update that would change the bundle only
warns there. The exemption is by author, not by a list of "bundle inputs",
because such a list has to be maintained and a human dependency bump meant to
reach AEs must not slip through as a warning. The head commit, not the merge
commit, is built so that an honestly rebuilt branch cannot fail because `main`
moved. Diffs are three-dot (what the PR itself changed): the weekly
upstream-sync branch mirrors an upstream that has no plugin at all, and a
two-dot diff would report the whole plugin as changed there. The same job runs
on every push to `main` and weekly, where a stale bundle is an error: it means
a release is due, and it is the one signal that the third-party code inside
the committed bundle lags the lockfile that dependency review and `pnpm audit`
scan (CodeQL skips the bundle, see `security.yml`).

### 2.4 Distribution by vendoring

The plugin is developed and tested here, and copied byte for byte into
`claude-org-management/plugins/zendesk-mcp/`, plus one `UPSTREAM.md` recording
the source commit and the re-vendor recipe. Because this repository is public,
a workflow there can fetch the source tarball at that commit without
credentials and fail when the vendored copy drifts. No transform is applied
during vendoring: the plugin ships its own README, CHANGELOG, an enriched
`plugin.json`, and a version both linters accept.

The alternative, detaching the fork or duplicating it into an internal
repository and registering that directly, remains open. It is an administrative
project of its own and nothing here prevents it later.

### 2.5 Install location and Node.js

The server is copied to `~/.local/share/zendesk-mcp/server/`, never run from
the plugin directory, whose path changes on every plugin update. When the Mac
has no Node 20+, `ensure-node.sh` downloads Node.js v24.21.0 (LTS, maintained
until April 2028) into `~/.local/share/zendesk-mcp/node/` and verifies it twice:
against nodejs.org's `SHASUMS256.txt` and against the checksum pinned in the
script, so a corrupt or substituted download is never unpacked. Node is not
bundled into the plugin: it is architecture-specific and the two builds alone
exceed the 50 MB cap.

### 2.6 Restart through launchd

Quitting Claude Desktop also ends the Code tab session whose Bash tool is
running the script, so the relaunch cannot come from that shell. The script
submits a one-off launchd job (`launchctl submit`) that waits for the Claude
process to exit (whichever copy of the app is running), reopens the app by
bundle id, and removes itself; only then does it ask Claude to quit (via
`osascript`, falling back to `SIGTERM`) and waits for the quit to land. If
Claude is still running after 25 seconds the job is withdrawn and the script
returns exit 3, so the person is told to quit and reopen by hand instead of
being promised a restart that did not happen. Verified: the job runs after the
submitting shell has exited. Not yet verified from a developer machine, and
part of the fresh-account test: that it survives the app quitting, and that
macOS asks no Automation permission for the quit.

### 2.7 What the skill pre-approves

`allowed-tools` pre-approves only the read-only scripts (`preflight.sh`,
`verify.sh`) and the copy into the connector's own folder in the home
directory (`install-server.sh`), each as an exact, argument-free command: a
prefix rule (`...sh"*`) would also pre-approve arbitrary arguments, and
`verify.sh --config <any file>` would then start whatever command that file
names. The Node download, the config edit, the restart, and uninstall each go
through a permission prompt, with the skill explaining the step first. That is
two or three prompts on a fresh Mac, each for something worth consenting to.

### 2.8 Rejected

- **Declaring the server in the plugin's `.mcp.json`.** Would not reach the
  Desktop chat surface, needs `node` on PATH, and would duplicate the
  desktop-config entry in Code tab sessions.
- **`${CLAUDE_PLUGIN_DATA}` as the install location.** A Claude-internal path,
  harder to document, find in Finder, and remove than `~/.local/share`.
- **Shipping a pruned `node_modules`.** Hundreds of files through a sync that
  drops executable bits, for no gain over one bundle; no native module needs it.

## 3. What would change this

- The repository becomes internal: register it directly and drop the vendoring.
- Claude Desktop reloads `claude_desktop_config.json` without a restart: drop
  `restart-claude.sh`.
- The plugin sync gains a build step or Anthropic ships a first-party
  "install a local MCP server" flow: the committed bundle becomes unnecessary.
