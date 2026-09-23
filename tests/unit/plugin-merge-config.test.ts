import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildEntry,
  classifyEntry,
  mergeConfig,
  parseConfigText,
  removeEntry,
  SERVER_KEY,
} from '../../plugins/zendesk-mcp/skills/setup/scripts/merge-config.mjs';

const SCRIPT = fileURLToPath(
  new URL('../../plugins/zendesk-mcp/skills/setup/scripts/merge-config.mjs', import.meta.url),
);
const NODE = '/opt/example/node/bin/node';
const SERVER = '/Users/example/.local/share/zendesk-mcp/server/index.js';
const entry = buildEntry({ node: NODE, server: SERVER });

// The entry the old Confluence guide had people paste by hand.
const oldGuideEntry = {
  command: 'node',
  args: [
    '/Users/example/dev/ai-zendesk-user-mcpserver/dist/index.js',
    'measurablhelp',
    '--mode',
    'single',
  ],
};

describe('buildEntry', () => {
  it('registers the absolute node and bundle paths with the fixed subdomain in single mode', () => {
    expect(SERVER_KEY).toBe('zendesk');
    expect(entry).toEqual({ command: NODE, args: [SERVER, 'measurablhelp', '--mode', 'single'] });
  });

  it('lets a test override the subdomain', () => {
    expect(buildEntry({ node: NODE, server: SERVER, subdomain: 'acme' }).args[1]).toBe('acme');
  });
});

describe('classifyEntry', () => {
  it('is none when there is no entry', () => {
    expect(classifyEntry(undefined, entry)).toBe('none');
  });

  it('is same when the entry starts the connector the same way, whatever the key order or extra keys', () => {
    expect(classifyEntry(structuredClone(entry), entry)).toBe('same');
    expect(classifyEntry({ args: [...entry.args], command: entry.command }, entry)).toBe('same');
    expect(classifyEntry({ ...entry, env: { LOG_LEVEL: 'debug' } }, entry)).toBe('same');
  });

  it('recognises the old-guide clone by its dist/index.js path', () => {
    expect(classifyEntry(oldGuideEntry, entry)).toBe('old-guide');
  });

  it('is other for anything else (an npx entry, a different install)', () => {
    const npx = { command: 'npx', args: ['-y', '@fruggr/zendesk-mcp-server', 'measurablhelp'] };
    expect(classifyEntry(npx, entry)).toBe('other');
    expect(
      classifyEntry({ command: NODE, args: [SERVER, 'other', '--mode', 'single'] }, entry),
    ).toBe('other');
  });
});

describe('mergeConfig', () => {
  const config = {
    preferences: { theme: 'dark' },
    mcpServers: { other: { command: 'x' }, zendesk: oldGuideEntry },
  };

  it('replaces the old-guide entry, keeps every other key, and reports what it replaced', () => {
    const result = mergeConfig(config, entry);
    expect(result.previous).toBe('old-guide');
    expect(result.changed).toBe(true);
    expect(result.config).toEqual({
      preferences: { theme: 'dark' },
      mcpServers: { other: { command: 'x' }, zendesk: entry },
    });
  });

  it('does not mutate its input', () => {
    const before = JSON.stringify(config);
    mergeConfig(config, entry);
    expect(JSON.stringify(config)).toBe(before);
  });

  it('creates mcpServers when the file had none', () => {
    expect(mergeConfig({ a: 1 }, entry)).toEqual({
      previous: 'none',
      changed: true,
      config: { a: 1, mcpServers: { zendesk: entry } },
    });
  });

  it('is a no-op when the entry is already exact', () => {
    const result = mergeConfig({ mcpServers: { zendesk: entry } }, entry);
    expect(result.changed).toBe(false);
    expect(result.previous).toBe('same');
  });

  it('refuses a config whose mcpServers is not an object', () => {
    expect(() => mergeConfig({ mcpServers: 'nope' }, entry)).toThrow(/mcpServers/);
    expect(() => mergeConfig({ mcpServers: [] }, entry)).toThrow(/mcpServers/);
  });
});

describe('removeEntry', () => {
  it('drops only the zendesk entry', () => {
    const result = removeEntry({ a: 1, mcpServers: { other: { command: 'x' }, zendesk: entry } });
    expect(result).toEqual({
      changed: true,
      config: { a: 1, mcpServers: { other: { command: 'x' } } },
    });
  });

  it('is unchanged when there is nothing to remove', () => {
    expect(removeEntry({ mcpServers: { other: { command: 'x' } } }).changed).toBe(false);
    expect(removeEntry({}).changed).toBe(false);
  });
});

describe('parseConfigText', () => {
  it('treats an empty or blank file as an empty config', () => {
    expect(parseConfigText('')).toEqual({});
    expect(parseConfigText(' \n')).toEqual({});
  });

  it('rejects invalid JSON with a plain-language message', () => {
    expect(() => parseConfigText('{ not json')).toThrow(/not valid JSON/);
  });

  it('rejects a top level that is not an object', () => {
    expect(() => parseConfigText('[]')).toThrow(/object/);
    expect(() => parseConfigText('"x"')).toThrow(/object/);
  });
});

describe('merge-config.mjs as a command', () => {
  const run = (args: string[]) =>
    spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
  const created: string[] = [];
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), 'zmcp-merge-'));
    created.push(dir);
    return dir;
  };
  afterEach(() => {
    for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  const backupsIn = (dir: string) =>
    readdirSync(dir).filter((name) => name.includes('.zendesk-mcp-backup-'));

  it('backs up, writes atomically with owner-only permissions, and reports the result', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    writeFileSync(config, JSON.stringify({ mcpServers: { other: { command: 'x' } } }));

    const result = run(['--config', config, '--node', NODE, '--server', SERVER]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^RESULT=written$/m);
    expect(result.stdout).toMatch(/^PREVIOUS=none$/m);
    expect(result.stdout).toMatch(/^FILE=existing$/m);
    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({
      mcpServers: { other: { command: 'x' }, zendesk: entry },
    });
    expect(statSync(config).mode % 0o1000).toBe(0o600);
    const backups = backupsIn(dir);
    expect(backups).toHaveLength(1);
    // The CLI works on the config's real path (a symlinked config is edited in
    // place), and macOS reaches its temp dir through a symlink, so compare real paths.
    expect(result.stdout).toContain(`BACKUP=${join(realpathSync(dir), backups[0] ?? '')}`);
    expect(readdirSync(dir).some((name) => name.includes('-tmp-'))).toBe(false);
  });

  it('creates the file when Claude Desktop has never written one', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');

    const result = run(['--config', config, '--node', NODE, '--server', SERVER]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^FILE=created$/m);
    expect(result.stdout).not.toMatch(/^BACKUP=/m);
    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({ mcpServers: { zendesk: entry } });
  });

  it('leaves an invalid file untouched and exits non-zero with a plain explanation', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    writeFileSync(config, '{ not json');

    const result = run(['--config', config, '--node', NODE, '--server', SERVER]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^FAIL: config-invalid-json /m);
    expect(readFileSync(config, 'utf8')).toBe('{ not json');
    expect(backupsIn(dir)).toHaveLength(0);
  });

  it('reports the old-guide entry it replaced', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    writeFileSync(config, JSON.stringify({ mcpServers: { zendesk: oldGuideEntry } }));

    const result = run(['--config', config, '--node', NODE, '--server', SERVER]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^PREVIOUS=old-guide$/m);
  });

  it('is unchanged on a second run', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    writeFileSync(config, JSON.stringify({ mcpServers: { zendesk: entry } }));

    const result = run(['--config', config, '--node', NODE, '--server', SERVER]);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^RESULT=unchanged$/m);
    expect(backupsIn(dir)).toHaveLength(0);
  });

  it('--remove drops only the zendesk entry, after a backup', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    writeFileSync(
      config,
      JSON.stringify({ mcpServers: { other: { command: 'x' }, zendesk: entry } }),
    );

    const result = run(['--config', config, '--remove']);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^RESULT=removed$/m);
    expect(JSON.parse(readFileSync(config, 'utf8'))).toEqual({
      mcpServers: { other: { command: 'x' } },
    });
    expect(backupsIn(dir)).toHaveLength(1);
  });

  it('--dry-run reports the change without writing anything', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    const before = JSON.stringify({ mcpServers: { zendesk: oldGuideEntry } });
    writeFileSync(config, before);

    const result = run(['--config', config, '--node', NODE, '--server', SERVER, '--dry-run']);

    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^DRY_RUN=1$/m);
    expect(result.stdout).toMatch(/^PREVIOUS=old-guide$/m);
    expect(readFileSync(config, 'utf8')).toBe(before);
    expect(backupsIn(dir)).toHaveLength(0);
  });

  it('reports an unreadable config (a directory in its place) as unreadable, not as invalid JSON', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    mkdirSync(config);

    const result = run(['--config', config, '--node', NODE, '--server', SERVER]);

    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^FAIL: config-unreadable /m);
    expect(backupsIn(dir)).toHaveLength(0);
  });

  it('rejects unknown options with a FAIL line instead of a stack trace', () => {
    const dir = scratch();
    const result = run(['--config', join(dir, 'claude_desktop_config.json'), '--bogus']);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^FAIL: bad-arguments /m);
    expect(result.stderr).not.toMatch(/node:internal/);
  });

  it('--remove on a missing file changes nothing and creates nothing', () => {
    const dir = scratch();
    const config = join(dir, 'claude_desktop_config.json');
    const result = run(['--config', config, '--remove']);
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^RESULT=unchanged$/m);
    expect(result.stdout).not.toMatch(/^FILE=/m);
    expect(existsSync(config)).toBe(false);
  });

  it('edits the target of a symlinked config and keeps the symlink', () => {
    const dir = scratch();
    const target = join(dir, 'real-config.json');
    const link = join(dir, 'claude_desktop_config.json');
    writeFileSync(target, JSON.stringify({ mcpServers: { other: { command: 'x' } } }));
    symlinkSync(target, link);

    const result = run(['--config', link, '--node', NODE, '--server', SERVER]);

    expect(result.status).toBe(0);
    expect(lstatSync(link).isSymbolicLink()).toBe(true);
    expect(JSON.parse(readFileSync(target, 'utf8')).mcpServers.zendesk).toEqual(entry);
  });

  it('refuses to register without the node and server paths', () => {
    const dir = scratch();
    const result = run(['--config', join(dir, 'claude_desktop_config.json')]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^FAIL: missing-arguments /m);
    expect(existsSync(join(dir, 'claude_desktop_config.json'))).toBe(false);
  });
});
