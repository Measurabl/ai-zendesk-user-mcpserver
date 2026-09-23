---
name: setup
description: Set up, check, update, or remove the Measurabl Zendesk connector for Claude on this Mac. Only works in the Claude Desktop Code tab on a Mac. Installs a local copy of the Zendesk MCP server, registers it with Claude Desktop, and restarts Claude; each person then signs in through Measurabl SSO (Okta) on first use. Run it as /zendesk-mcp:setup followed by install (default), verify, update, or uninstall.
argument-hint: "[install|verify|update|uninstall]"
disable-model-invocation: true
allowed-tools: 'Bash(bash "${CLAUDE_SKILL_DIR}/scripts/preflight.sh") Bash(bash "${CLAUDE_SKILL_DIR}/scripts/verify.sh") Bash(bash "${CLAUDE_SKILL_DIR}/scripts/install-server.sh")'
---

# Zendesk connector setup

You are helping a Measurabl colleague, usually an account executive rather than
an engineer, connect Claude to Zendesk on their Mac. Everything happens through
the scripts in this skill. Speak plainly. Before each step that needs their
approval, say in one or two sentences what is about to happen and why. Keep
messages short, and do not show shell commands, file paths, or error codes
unless the person has to act on them.

## Mode

Requested mode: `$0`

If the line above shows one of the words `install`, `verify`, `update`, or
`uninstall`, that is the mode. If it shows a dollar sign followed by a zero, or
nothing at all, no mode was typed: run **install**. Any other word: list the
four modes and stop.

## Rules

- Run every script exactly like this, quoted, with `bash` in front and nothing
  after the closing quote: `bash "${CLAUDE_SKILL_DIR}/scripts/<name>.sh"`.
  Never `cd` first, never `./`, never add options (the two exceptions are named
  below). The three read-only-or-local scripts are pre-approved in exactly that
  form; anything else asks the person for approval.
- Use only these scripts, in the order given. Do not improvise with `python3`,
  `git`, `jq`, `brew`, `npm`, `sudo`, or by editing files yourself. The scripts
  do everything that is needed; anything else may trigger installer prompts on
  a fresh Mac.
- Each script prints `key=value` lines; those are the facts to report. A
  non-zero exit prints one `FAIL: <code> <message>` line. Stop there, look the
  code up in `${CLAUDE_SKILL_DIR}/references/troubleshooting.md`, and tell the
  person what happened and what to do next in plain words.
- Never report progress that did not happen. If a step did not run, say so.

## install

### 1. Check this Mac

Run `bash "${CLAUDE_SKILL_DIR}/scripts/preflight.sh"`.

- Exit code 2 with a `STOP=` line: repeat the sentence it printed and stop.
- `PLUGIN_SERVER_FILES=missing`: stop; see `plugin-incomplete` in troubleshooting.
- `INSTALLED_VERSION` equal to `PLUGIN_VERSION`: say the connector is already
  installed at this version and offer to run the check instead (see verify).
  Continue with a reinstall only if they ask for it.
- `OLD_GUIDE_CLONE=present` or `CONFIG_MENTIONS_ZENDESK=yes`: remember it for
  step 4; they set this up before with the manual guide.
- `TOKEN_FILE=present`: they signed in to Zendesk before and will most likely
  not be asked again.

Then give them the plan in two or three sentences: a small program (Node.js)
is needed to run the connector, the connector's files go into a folder in
their home directory, Claude Desktop's settings get one entry, and Claude
restarts once. Say which of those steps will ask for their approval.

### 2. Node.js

If preflight printed `NODE_FOUND=none`, explain first: "Your Mac has no copy
of Node.js, the program that runs the connector. I will download the official
version 24 from nodejs.org (about 53 MB) into your home folder and check it
against its published checksum. Nothing is installed system-wide and no
password is needed."

Run `bash "${CLAUDE_SKILL_DIR}/scripts/ensure-node.sh"`. `NODE_SOURCE=existing`
means the Mac already had a usable Node.js, `private` means the copy this
plugin installed earlier is being reused, and `downloaded` means the private
copy was just installed.

### 3. Install the connector

Run `bash "${CLAUDE_SKILL_DIR}/scripts/install-server.sh"`. It copies the
prebuilt server into a folder in their home directory.

### 4. Register with Claude Desktop

Explain first: "Next I add one entry to Claude Desktop's settings file so it
knows how to start the connector. I back the file up first and change nothing
else in it." If step 1 showed an earlier manual install, add: "You set this up
before with the manual guide. I will replace that entry; the old folder
`~/dev/ai-zendesk-user-mcpserver` is no longer used and can be deleted later."

Run `bash "${CLAUDE_SKILL_DIR}/scripts/register.sh"`. Read `PREVIOUS=`:
`old-guide` means the manual-guide entry was replaced (confirm it);
`other` means a different Zendesk entry was replaced and the file named in
`BACKUP=` still holds it (tell them); `same` means it was already set up.
If `CLAUDE_CODE_ENTRY=present`, mention once that an older Claude Code entry
also exists, that Claude uses the Desktop one, and that it can be ignored.
`INSTALLED_VERSION=` confirms the install is complete.

### 5. Before the restart, tell them what happens next

Say all of this before running anything else:

1. Claude will quit and reopen by itself within a few seconds. This
   conversation ends when it does; that is expected. If Claude has not
   reopened after about 15 seconds, open it from Applications.
2. The first time Claude uses the connector, a browser window opens. Sign in
   with Measurabl SSO (Okta) and click Allow. The window may or may not close
   on its own; either is fine.
3. Then open a new chat and send exactly: "Please check the Zendesk connector
   and tell me how many open tickets I can see." If Claude says it is not
   authenticated the first time, reply "I've already done that" and it works.

### 6. Restart Claude

Run `bash "${CLAUDE_SKILL_DIR}/scripts/restart-claude.sh"`. When it succeeds
you will not get another turn, which is why step 5 comes first. If you do get
a turn back with exit code 3 (`RESTART=manual`), the restart could not be
completed automatically: the installation is complete, and the person should
quit Claude with Cmd+Q and open it again themselves.

## verify

Run `bash "${CLAUDE_SKILL_DIR}/scripts/verify.sh"`. It prints one `PASS` or
`FAIL` line per check: `config-file` and `config-entry` (the Claude Desktop
settings), `installed-files`, `node-binary` (the Node.js the entry uses, run
the way Claude Desktop runs it), and `mcp-handshake` (a real start of the
connector). Report each in plain words. A full pass means the connector starts
correctly; it does not test the Zendesk sign-in, which they test by asking the
open-tickets question in a chat. On any `FAIL` line, the check's name is the
code to look up in troubleshooting.

## update

Run `bash "${CLAUDE_SKILL_DIR}/scripts/update.sh"`. `STATUS=not-installed`:
offer to install. `up-to-date`: say so. `updated`: say the new version is in
place and that Claude has to restart to use it; offer the restart, and if they
accept, give the step 5 explanation and then run
`bash "${CLAUDE_SKILL_DIR}/scripts/restart-claude.sh"`.

## uninstall

Explain first what will be removed: the connector's entry in Claude Desktop's
settings (after a backup) and the connector's folder in their home directory.
Run `bash "${CLAUDE_SKILL_DIR}/scripts/uninstall.sh"`.

Then read `TOKEN_FILE_STATUS=`. If `present`, explain that the file holding
their Zendesk sign-in is still on disk (the path is in `TOKEN_FILE=`) and that
keeping it means no new sign-in if they reinstall. Only if they want it gone,
run `bash "${CLAUDE_SKILL_DIR}/scripts/uninstall.sh" --tokens` (the one option
this skill ever adds; it asks for approval).
If `OLD_GUIDE_CLONE=present`, mention that the old `~/dev` folder from the
manual guide can be deleted in Finder. Finally ask them to quit and reopen
Claude so it stops looking for the connector.

## When something fails

Open `${CLAUDE_SKILL_DIR}/references/troubleshooting.md`, find the `FAIL` code
or symptom, and follow it. If it is not listed, quote the message word for
word and suggest sharing it with whoever maintains the connector at Measurabl.
