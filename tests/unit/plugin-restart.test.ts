import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

// Contract tests for the relaunch job restart-claude.sh hands to launchd.
// launchd re-runs a submitted job every time it exits until the job is
// removed, so no run after the first may reopen Claude. The job text is taken
// from --dry-run, exactly as it would be submitted, with its absolute commands
// swapped for fakes that record what they were asked to do.
const RESTART = fileURLToPath(
  new URL('../../plugins/zendesk-mcp/skills/setup/scripts/restart-claude.sh', import.meta.url),
);
const LABEL = 'com.measurabl.zendesk-mcp.relaunch';
const SUBMIT_PREFIX = `WOULD_SUBMIT=launchctl submit -l ${LABEL} -- /bin/sh -c "`;
const OPEN_CLAUDE = 'open -b com.anthropic.claudefordesktop';
const REMOVE_JOB = `launchctl remove ${LABEL}`;

const created: string[] = [];
afterEach(() => {
  for (const dir of created.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const scratch = () => {
  const dir = mkdtempSync(join(tmpdir(), 'zmcp-restart-'));
  created.push(dir);
  return dir;
};

const dryRunJob = (home: string) => {
  // restart-claude.sh stops early unless Claude Desktop is installed.
  mkdirSync(join(home, 'Applications', 'Claude.app'), { recursive: true });
  const result = spawnSync('/bin/bash', [RESTART, '--dry-run'], {
    env: { HOME: home, PATH: '/usr/bin:/bin' },
    encoding: 'utf8',
  });
  const line = result.stdout.split('\n').find((text) => text.startsWith(SUBMIT_PREFIX));
  // Plain errors (not `expect`): this helper runs outside it().
  if (result.status !== 0 || line === undefined) {
    throw new Error(`restart-claude.sh --dry-run printed no job: ${result.stderr}`);
  }
  return line.slice(SUBMIT_PREFIX.length, -1);
};

// A scratch setup: the job wired to fakes, a sentinel file, and a log of the
// fakes' calls. `claudeRunning` decides what the fake `ps` reports.
const relaunchJob = (claudeRunning: boolean) => {
  const home = scratch();
  const bin = join(home, 'fake-bin');
  const log = join(home, 'calls.log');
  const sentinel = join(home, 'relaunch.sentinel');
  mkdirSync(bin);
  writeFileSync(log, '');
  writeFileSync(sentinel, '');
  const record = (name: string) =>
    writeFileSync(join(bin, name), `#!/bin/sh\necho "${name} $*" >> '${log}'\n`, { mode: 0o755 });
  record('open');
  record('launchctl');
  writeFileSync(
    join(bin, 'ps'),
    `#!/bin/sh\n${claudeRunning ? "echo '/Applications/Claude.app/Contents/MacOS/Claude'" : 'exit 0'}\n`,
    { mode: 0o755 },
  );
  const job = dryRunJob(home)
    .replaceAll('<sentinel>', sentinel)
    .replaceAll('/usr/bin/open', join(bin, 'open'))
    .replaceAll('/bin/launchctl', join(bin, 'launchctl'))
    .replaceAll('/bin/ps', join(bin, 'ps'))
    .replaceAll('/bin/sleep', ':');
  return {
    sentinel,
    run: () => spawnSync('/bin/sh', ['-c', job], { encoding: 'utf8' }),
    calls: () => readFileSync(log, 'utf8').split('\n').filter(Boolean),
  };
};

describe('restart-claude.sh relaunch job', () => {
  it('reopens Claude once it has quit, consumes the sentinel, and removes itself', () => {
    const job = relaunchJob(false);

    expect(job.run().status).toBe(0);

    expect(job.calls()).toEqual([OPEN_CLAUDE, REMOVE_JOB]);
    expect(existsSync(job.sentinel)).toBe(false);
  });

  it('never reopens Claude on a re-run, which launchd makes after every exit', () => {
    const job = relaunchJob(false);

    job.run();
    const rerun = job.run();

    expect(rerun.status).toBe(0);
    expect(job.calls()).toEqual([OPEN_CLAUDE, REMOVE_JOB, REMOVE_JOB]);
  });

  it('gives up without reopening when Claude never quits, and a re-run stays a no-op', () => {
    const job = relaunchJob(true);

    expect(job.run().status).toBe(0);
    job.run();

    expect(job.calls()).toEqual([REMOVE_JOB, REMOVE_JOB]);
    expect(existsSync(job.sentinel)).toBe(false);
  });
});
