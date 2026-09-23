#!/usr/bin/env node
// Registers the Zendesk connector in Claude Desktop's config file, or removes
// it. Everything else in the file is preserved. Before any write the current
// file is backed up beside itself, and the new content is written to a
// temporary file and renamed into place, so a crash cannot leave a half-written
// config. A file that is not valid JSON is never touched.
//
//   node merge-config.mjs --node <abs node> --server <abs server/index.js> \
//        [--subdomain measurablhelp] [--config <path>] [--dry-run]
//   node merge-config.mjs --remove [--config <path>] [--dry-run]
//
// Output (stdout, one `key=value` per line): CONFIG, FILE=existing|created,
// PREVIOUS=none|same|old-guide|other, CLAUDE_CODE_ENTRY=present|absent,
// BACKUP=<path> when one was made, RESULT=written|removed|unchanged (or
// DRY_RUN=1 with RESULT=would-write|would-remove). Failures print one
// `FAIL: <code> <message>` line on stderr and exit 1. Run through register.sh
// or uninstall.sh, which resolve a Node binary for this script.
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

/** The key under `mcpServers`; the same one the old Confluence guide used. */
export const SERVER_KEY = 'zendesk';
export const DEFAULT_SUBDOMAIN = 'measurablhelp';
// What the old guide's hand-written entry pointed at: a clone built under ~/dev.
const OLD_GUIDE_MARKER = '/ai-zendesk-user-mcpserver/dist/index.js';

export const defaultConfigPath = () =>
  join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

const claudeCodeConfigPath = () => join(homedir(), '.claude.json');

const isPlainObject = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** The entry Claude Desktop needs: an absolute Node, the absolute bundle, single-tool mode. */
export const buildEntry = ({ node, server, subdomain = DEFAULT_SUBDOMAIN }) => ({
  command: node,
  args: [server, subdomain, '--mode', 'single'],
});

/** What an existing `zendesk` entry is, so the skill can tell the person what it replaced. */
export const classifyEntry = (existing, wanted) => {
  if (existing === undefined) return 'none';
  if (JSON.stringify(existing) === JSON.stringify(wanted)) return 'same';
  const args = isPlainObject(existing) && Array.isArray(existing.args) ? existing.args : [];
  if (args.some((arg) => typeof arg === 'string' && arg.includes(OLD_GUIDE_MARKER))) {
    return 'old-guide';
  }
  return 'other';
};

/** Parses the config file's text; an empty file is an empty config. Throws with a plain message otherwise. */
export const parseConfigText = (text) => {
  if (text.trim() === '') return {};
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      'The Claude Desktop config file is not valid JSON, so it was left untouched. Open it (Claude > Settings > Developer > Edit Config), fix or remove the broken part, then run the setup again.',
      { cause: error },
    );
  }
  if (!isPlainObject(parsed)) {
    throw new Error(
      'The Claude Desktop config file must contain a JSON object at the top level; it was left untouched.',
    );
  }
  return parsed;
};

const serversOf = (config) => {
  const servers = config.mcpServers ?? {};
  if (!isPlainObject(servers)) {
    throw new Error(
      'The "mcpServers" entry in the Claude Desktop config is not an object, so the file was left untouched.',
    );
  }
  return servers;
};

/** Sets the entry, keeping every other key. Pure: returns a new config. */
export const mergeConfig = (config, entry) => {
  const servers = serversOf(config);
  const previous = classifyEntry(servers[SERVER_KEY], entry);
  return {
    previous,
    changed: previous !== 'same',
    config: { ...config, mcpServers: { ...servers, [SERVER_KEY]: entry } },
  };
};

/** Drops the entry, keeping every other server. Pure: returns a new config. */
export const removeEntry = (config) => {
  const servers = serversOf(config);
  if (!(SERVER_KEY in servers)) return { changed: false, config };
  const { [SERVER_KEY]: _removed, ...rest } = servers;
  return { changed: true, config: { ...config, mcpServers: rest } };
};

const timestamp = () => {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  return `${date}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
};

// Temporary file plus rename: the config is either the old content or the new,
// never a truncated mix. Owner-only permissions, like the file Claude writes.
const writeAtomically = (path, config) => {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.zendesk-mcp-tmp-${process.pid}`;
  writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
};

// The old guide also registered the server with the Claude Code CLI
// (`claude mcp add zendesk ...`, stored in ~/.claude.json). Reported only: the
// Desktop entry wins on a name clash, and that file belongs to Claude Code.
const claudeCodeHasEntry = () => {
  try {
    const config = JSON.parse(readFileSync(claudeCodeConfigPath(), 'utf8'));
    return isPlainObject(config?.mcpServers) && SERVER_KEY in config.mcpServers;
  } catch {
    return false;
  }
};

const failWith = (code, message) => {
  console.error(`FAIL: ${code} ${message}`);
  process.exit(1);
};

const main = () => {
  const { values } = parseArgs({
    options: {
      config: { type: 'string' },
      node: { type: 'string' },
      server: { type: 'string' },
      subdomain: { type: 'string' },
      remove: { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  });
  if (!values.remove && !(values.node && values.server)) {
    failWith(
      'missing-arguments',
      'both --node and --server are required to register the connector',
    );
  }

  const configPath = values.config ?? defaultConfigPath();
  const exists = existsSync(configPath);
  let result;
  try {
    const config = parseConfigText(exists ? readFileSync(configPath, 'utf8') : '');
    if (values.remove) {
      result = removeEntry(config);
    } else {
      const entry = buildEntry({
        node: values.node,
        server: values.server,
        ...(values.subdomain ? { subdomain: values.subdomain } : {}),
      });
      result = mergeConfig(config, entry);
      console.log(`PREVIOUS=${result.previous}`);
    }
  } catch (error) {
    failWith('config-invalid-json', error.message);
  }

  console.log(`CONFIG=${configPath}`);
  console.log(`FILE=${exists ? 'existing' : 'created'}`);
  console.log(`CLAUDE_CODE_ENTRY=${claudeCodeHasEntry() ? 'present' : 'absent'}`);

  if (!result.changed) {
    console.log('RESULT=unchanged');
    return;
  }
  if (values['dry-run']) {
    console.log('DRY_RUN=1');
    console.log(`RESULT=${values.remove ? 'would-remove' : 'would-write'}`);
    return;
  }
  if (exists) {
    const backup = `${configPath}.zendesk-mcp-backup-${timestamp()}`;
    copyFileSync(configPath, backup);
    console.log(`BACKUP=${backup}`);
  }
  try {
    writeAtomically(configPath, result.config);
  } catch (error) {
    failWith('config-write-failed', `could not write ${configPath}: ${error.message}`);
  }
  console.log(`RESULT=${values.remove ? 'removed' : 'written'}`);
};

// Only act when run directly, not when imported by a test.
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
