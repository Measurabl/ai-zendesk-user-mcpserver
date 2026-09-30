import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// The build script owns the version grammar and generates the runtime
// package.json that sits beside the bundle. Importing it here means these
// assertions cannot drift from what the generator actually writes.
import {
  nextVersion,
  PLUGIN_VERSION_PATTERN,
  RUNTIME_PACKAGE_NAME,
  runtimePackageJson,
  todayVersion,
} from '../../scripts/build-plugin.mjs';
import { resolveTokenPath } from '../../src/auth/token-persistence';

const PLUGIN_DIR = 'plugins/zendesk-mcp';

const at = (relative: string): string =>
  fileURLToPath(new URL(`../../${relative}`, import.meta.url));

const readJson = (relative: string): Record<string, unknown> =>
  JSON.parse(readFileSync(at(relative), 'utf8'));

// Minimal frontmatter reader: the block between the opening `---` on the first
// line and the next `---` line, as raw `key: value` pairs. Enough for the
// scalar fields asserted below; no YAML library needed. Plain errors (not
// `expect`) so a malformed file fails at import with a clear message.
const frontmatterOf = (markdown: string): Map<string, string> => {
  const lines = markdown.split('\n');
  if (lines[0] !== '---') throw new Error('SKILL.md must open with a --- frontmatter line');
  const end = lines.indexOf('---', 1);
  if (end < 0) throw new Error('SKILL.md frontmatter is never closed');
  const fields = new Map<string, string>();
  for (const line of lines.slice(1, end)) {
    const match = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (match?.[1] !== undefined && match[2] !== undefined) fields.set(match[1], match[2]);
  }
  return fields;
};

const plugin = readJson(`${PLUGIN_DIR}/.claude-plugin/plugin.json`);
const marketplace = readJson('.claude-plugin/marketplace.json') as {
  name: string;
  plugins: Record<string, unknown>[];
};
const runtimePackage = readJson(`${PLUGIN_DIR}/server/package.json`);
const frontmatter = frontmatterOf(readFileSync(at(`${PLUGIN_DIR}/skills/setup/SKILL.md`), 'utf8'));

const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

describe('zendesk-mcp plugin manifest', () => {
  it('names the plugin after its directory, in kebab-case', () => {
    expect(plugin.name).toBe('zendesk-mcp');
    expect(plugin.name).toMatch(KEBAB_CASE);
  });

  it('carries a date-based, semver-compatible version (YYYY.M.D or YYYY.M.D+N)', () => {
    expect(plugin.version).toMatch(PLUGIN_VERSION_PATTERN);
  });

  it('has the presentation fields the org marketplace shows', () => {
    expect(plugin.displayName).toBe('Zendesk connector for Claude');
    expect(typeof plugin.description).toBe('string');
    expect((plugin.description as string).length).toBeGreaterThan(40);
    expect(plugin.author).toEqual({ name: 'Measurabl' });
    expect(plugin.homepage).toBe('https://github.com/Measurabl/ai-zendesk-user-mcpserver');
  });
});

describe('development marketplace (.claude-plugin/marketplace.json)', () => {
  it('uses a kebab-case name that is not a reserved marketplace name', () => {
    expect(marketplace.name).toMatch(KEBAB_CASE);
    expect(marketplace.name).not.toMatch(/^(?:anthropic-|claude-for-|claude-code-)/);
    expect(marketplace.name).not.toBe('claude-plugins-official');
  });

  it('lists exactly the plugin, by relative path, without a second version to keep in sync', () => {
    expect(marketplace.plugins).toHaveLength(1);
    const entry = marketplace.plugins[0];
    expect(entry?.name).toBe(plugin.name);
    expect(entry?.source).toBe(`./${PLUGIN_DIR}`);
    // plugin.json's version always wins and the docs advise against setting both.
    expect(entry?.version).toBeUndefined();
  });
});

describe('generated runtime package.json beside the bundle', () => {
  it('is exactly what the build script generates for the plugin version (no drift)', () => {
    expect(runtimePackage).toEqual(runtimePackageJson(plugin.version as string));
  });

  it('keeps the upstream package name so the OAuth token directory does not move', () => {
    expect(RUNTIME_PACKAGE_NAME).toBe('@fruggr/zendesk-mcp-server');
    expect(runtimePackage.name).toBe(RUNTIME_PACKAGE_NAME);
  });

  it('declares ESM so Node runs index.js as a module without a .mjs rename', () => {
    expect(runtimePackage.type).toBe('module');
    expect(runtimePackage.private).toBe(true);
  });

  it('ships the bundle', () => {
    expect(existsSync(at(`${PLUGIN_DIR}/server/index.js`))).toBe(true);
  });
});

describe('setup skill frontmatter', () => {
  it('is named after its directory so the command is /zendesk-mcp:setup', () => {
    expect(frontmatter.get('name')).toBe('setup');
  });

  it('only runs when the user types the command', () => {
    expect(frontmatter.get('disable-model-invocation')).toBe('true');
  });

  it('carries no version key (claude-org-management #47)', () => {
    expect(frontmatter.has('version')).toBe(false);
  });

  it('says it only works in the Claude Desktop Code tab on a Mac, within the advisory length cap', () => {
    const description = frontmatter.get('description') ?? '';
    expect(description).toMatch(/Claude Desktop Code tab on a Mac/);
    expect(description.length).toBeLessThanOrEqual(1024);
  });

  it('lists the four modes in the argument hint', () => {
    expect(frontmatter.get('argument-hint')).toMatch(/install\|verify\|update\|uninstall/);
  });

  it('pre-approves only exact, quoted, argument-free bash invocations of scripts that exist', () => {
    const rules = frontmatter.get('allowed-tools') ?? '';
    // No trailing wildcard: a prefix rule would pre-approve arbitrary arguments,
    // and verify.sh's --config could then point the handshake at any command.
    const exactForm = /Bash\(bash "\$\{CLAUDE_SKILL_DIR\}\/scripts\/([a-z-]+\.sh)"\)/g;
    const scripts = [...rules.matchAll(exactForm)].map((match) => match[1] ?? '');
    expect(scripts.length).toBeGreaterThan(0);
    // Every rule is one of the exact-form matches above: nothing broader slipped in.
    expect(rules.match(/Bash\(/g)?.length).toBe(scripts.length);
    for (const script of scripts) {
      expect(existsSync(at(`${PLUGIN_DIR}/skills/setup/scripts/${script}`))).toBe(true);
    }
  });

  it('never pre-approves the scripts that download, edit the Claude config, restart, or uninstall', () => {
    const rules = frontmatter.get('allowed-tools') ?? '';
    for (const script of ['ensure-node.sh', 'register.sh', 'restart-claude.sh', 'uninstall.sh']) {
      expect(rules).not.toContain(script);
    }
  });
});

describe('token file path (lib.sh vs the server)', () => {
  it('lib.sh computes the same token path the server derives from its package name', () => {
    const home = mkdtempSync(join(tmpdir(), 'zmcp-home-'));
    try {
      // The Desktop-launched server never sees a profile XDG_CONFIG_HOME, so
      // lib.sh must not honour the shell's either.
      const env: Record<string, string> = {
        HOME: home,
        PATH: '/usr/bin:/bin',
        XDG_CONFIG_HOME: join(home, 'elsewhere'),
      };
      const lib = at(`${PLUGIN_DIR}/skills/setup/scripts/lib.sh`);
      const shell = spawnSync('/bin/bash', ['-c', `. "${lib}" && printf '%s' "$ZMCP_TOKEN_FILE"`], {
        env,
        encoding: 'utf8',
      });
      expect(shell.status).toBe(0);
      const saved = { HOME: process.env.HOME, XDG: process.env.XDG_CONFIG_HOME };
      process.env.HOME = home;
      delete process.env.XDG_CONFIG_HOME;
      try {
        expect(shell.stdout).toBe(resolveTokenPath('measurablhelp'));
      } finally {
        process.env.HOME = saved.HOME;
        if (saved.XDG !== undefined) process.env.XDG_CONFIG_HOME = saved.XDG;
      }
      expect(shell.stdout).toBe(
        join(home, '.config', 'fruggr', 'zendesk-mcp-server', 'measurablhelp.json'),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

describe('plugin version helpers', () => {
  it('formats a date as YYYY.M.D without zero padding (UTC)', () => {
    expect(todayVersion(new Date(Date.UTC(2026, 0, 5)))).toBe('2026.1.5');
    expect(todayVersion(new Date(Date.UTC(2026, 11, 31)))).toBe('2026.12.31');
  });

  it('moves to the current date, or appends +N for a same-day re-release', () => {
    const day = new Date(Date.UTC(2026, 8, 23));
    expect(nextVersion('2026.9.22', day)).toBe('2026.9.23');
    expect(nextVersion('2026.9.23', day)).toBe('2026.9.23+1');
    expect(nextVersion('2026.9.23+1', day)).toBe('2026.9.23+2');
  });

  it('accepts only the date grammar', () => {
    for (const ok of ['2026.9.23', '2026.12.1', '2026.9.23+1', '2027.1.31+12']) {
      expect(ok).toMatch(PLUGIN_VERSION_PATTERN);
    }
    for (const bad of [
      '2026.9.23.1',
      '2026.09.23',
      '1.0.0',
      '2026.13.1',
      '2026.9.32',
      '2026.9.23+0',
    ]) {
      expect(bad).not.toMatch(PLUGIN_VERSION_PATTERN);
    }
  });
});
