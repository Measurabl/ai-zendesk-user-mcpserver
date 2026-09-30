import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Contract tests for the Node version floor in the setup scripts' shared
// library. Node 20 and 22 are both still supported by the server itself
// (package.json#engines.node), but the connector the skill installs runs on
// Node 24 or newer: an older Node on the Mac is ignored and the pinned Node 24
// is installed instead.
const LIB = fileURLToPath(
  new URL('../../plugins/zendesk-mcp/skills/setup/scripts/lib.sh', import.meta.url),
);

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'zmcp-node-'));
  created.push(dir);
  return dir;
};

// A stand-in `node` that answers `-p process.version` the way the real one does.
const fakeNode = (path: string, version: string) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `#!/bin/sh\necho v${version}\n`, { mode: 0o755 });
  return path;
};

// Sources lib.sh in /bin/bash with a scratch HOME and install root, then runs
// `snippet`; lib.sh's `set -e` is why the snippets branch with `if`. No
// system-wide Node locations, so a Node on this machine can never win.
const runLib = (home: string, snippet: string) =>
  spawnSync('/bin/bash', ['-c', `. "${LIB}" && ${snippet}`], {
    env: {
      HOME: home,
      PATH: '/usr/bin:/bin',
      ZENDESK_MCP_HOME: join(home, 'install'),
      ZENDESK_MCP_SYSTEM_NODES: '',
    },
    encoding: 'utf8',
  });

describe('setup scripts: Node version floor', () => {
  it('requires Node 24', () => {
    const home = scratch();
    expect(runLib(home, `printf '%s' "$ZMCP_MIN_NODE_MAJOR"`).stdout).toBe('24');
  });

  it.each([
    ['20.19.4', 'no'],
    ['22.22.0', 'no'],
    ['24.21.0', 'yes'],
    ['25.1.0', 'yes'],
  ])('treats Node %s as usable: %s', (version, expected) => {
    const home = scratch();
    const node = fakeNode(join(home, 'bin', 'node'), version);
    const result = runLib(home, `if node_usable "${node}"; then echo yes; else echo no; fi`);
    expect(result.stdout.trim()).toBe(expected);
  });

  it('picks the private Node 24 the skill installed before anything else', () => {
    const home = scratch();
    const privateNode = fakeNode(join(home, 'install', 'node', 'bin', 'node'), '24.21.0');
    const result = runLib(home, `find_node`);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe(privateNode);
  });

  it('never picks an nvm Node older than 24, even when it is the only one', () => {
    const home = scratch();
    fakeNode(join(home, '.nvm', 'versions', 'node', 'v20.19.4', 'bin', 'node'), '20.19.4');
    const result = runLib(home, `if found="$(find_node)"; then printf '%s' "$found"; fi`);
    expect(result.stdout).toBe('');
  });

  it('prefers the newest nvm Node 24 over an older nvm install', () => {
    const home = scratch();
    fakeNode(join(home, '.nvm', 'versions', 'node', 'v20.19.4', 'bin', 'node'), '20.19.4');
    fakeNode(join(home, '.nvm', 'versions', 'node', 'v24.9.0', 'bin', 'node'), '24.9.0');
    const node24 = fakeNode(
      join(home, '.nvm', 'versions', 'node', 'v24.21.0', 'bin', 'node'),
      '24.21.0',
    );
    const result = runLib(home, `if found="$(find_node)"; then printf '%s' "$found"; fi`);
    expect(result.stdout).toBe(node24);
  });

  it('picks a system-wide Node 24 before an nvm one', () => {
    const home = scratch();
    const system = fakeNode(join(home, 'system', 'bin', 'node'), '24.21.0');
    fakeNode(join(home, '.nvm', 'versions', 'node', 'v25.1.0', 'bin', 'node'), '25.1.0');
    const result = runLib(
      home,
      `ZMCP_SYSTEM_NODES="${system}"; if found="$(find_node)"; then printf '%s' "$found"; fi`,
    );
    expect(result.stdout).toBe(system);
  });
});
