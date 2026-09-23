#!/usr/bin/env node
// Checks an installed Zendesk connector without touching Zendesk: the Claude
// Desktop config entry, the installed files, the Node binary, and a real MCP
// handshake (initialize + tools/list over stdio) against the installed server.
// Neither request needs a Zendesk sign-in, so this never opens a browser.
// resources/list is deliberately not sent: it would call Zendesk.
//
//   node verify.mjs --config <claude_desktop_config.json> --home <install root> [--timeout-ms 15000]
//
// Prints one `PASS <check>: <detail>` or `FAIL <check>: <detail>` line per
// check and a final `SUMMARY=pass|fail`; exits non-zero when anything failed.
// Run through verify.sh, which resolves a Node binary for this script.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';

const SERVER_KEY = 'zendesk';
const MIN_NODE_MAJOR = 20;
const PROTOCOL_VERSION = '2025-03-26';

const { values } = parseArgs({
  options: {
    config: { type: 'string' },
    home: { type: 'string' },
    'timeout-ms': { type: 'string' },
  },
});
const timeoutMs = Number(values['timeout-ms'] ?? '15000');

const outcomes = [];
const pass = (check, detail) => {
  outcomes.push(true);
  console.log(`PASS ${check}: ${detail}`);
};
const fail = (check, detail) => {
  outcomes.push(false);
  console.log(`FAIL ${check}: ${detail}`);
};
const finish = () => {
  const ok = outcomes.every(Boolean);
  console.log(`SUMMARY=${ok ? 'pass' : 'fail'}`);
  process.exit(ok ? 0 : 1);
};

const readEntry = () => {
  const configPath = values.config;
  if (!configPath) {
    fail('config-file', 'no --config path was given');
    return undefined;
  }
  if (!existsSync(configPath)) {
    fail('config-file', `Claude Desktop config not found at ${configPath}`);
    return undefined;
  }
  let config;
  try {
    config = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (error) {
    fail('config-file', `not valid JSON (${error.message})`);
    return undefined;
  }
  pass('config-file', configPath);
  const entry = config?.mcpServers?.[SERVER_KEY];
  if (!entry || typeof entry !== 'object') {
    fail('config-entry', `no "${SERVER_KEY}" entry under mcpServers`);
    return undefined;
  }
  const args = Array.isArray(entry.args) ? entry.args : [];
  const problems = [];
  if (typeof entry.command !== 'string' || !isAbsolute(entry.command)) {
    problems.push('command is not an absolute path');
  }
  if (
    typeof args[0] !== 'string' ||
    !isAbsolute(args[0]) ||
    !args[0].endsWith('/server/index.js')
  ) {
    problems.push('first argument is not an absolute path to server/index.js');
  }
  const modeIndex = args.indexOf('--mode');
  if (modeIndex < 0 || args[modeIndex + 1] !== 'single') problems.push('missing "--mode single"');
  if (problems.length > 0) {
    fail('config-entry', problems.join('; '));
    return undefined;
  }
  pass('config-entry', `${entry.command} ${args.join(' ')}`);
  return { command: entry.command, args };
};

const checkFiles = (entry) => {
  const server = entry.args[0];
  const missing = [server, join(dirname(server), 'package.json')].filter(
    (path) => !existsSync(path),
  );
  if (missing.length > 0) {
    fail('installed-files', `missing: ${missing.join(', ')}`);
    return false;
  }
  const versionFile = values.home ? join(values.home, 'VERSION') : undefined;
  const version =
    versionFile && existsSync(versionFile) ? readFileSync(versionFile, 'utf8').trim() : 'unknown';
  pass('installed-files', `server ${version} at ${dirname(server)}`);
  return true;
};

const checkNode = (entry) => {
  if (!existsSync(entry.command)) {
    fail('node-binary', `${entry.command} does not exist`);
    return false;
  }
  const probe = spawnSync(entry.command, ['-p', 'process.versions.node'], { encoding: 'utf8' });
  const version = probe.status === 0 ? probe.stdout.trim() : '';
  const major = Number(version.split('.')[0]);
  if (!version || Number.isNaN(major)) {
    fail('node-binary', `${entry.command} did not run (${probe.stderr.trim() || 'no output'})`);
    return false;
  }
  if (major < MIN_NODE_MAJOR) {
    fail('node-binary', `Node ${version} is older than the required ${MIN_NODE_MAJOR}`);
    return false;
  }
  pass('node-binary', `Node ${version} at ${entry.command}`);
  return true;
};

// A minimal newline-delimited JSON-RPC client: enough to initialize and list
// tools, nothing more.
const handshake = (entry) =>
  new Promise((resolve) => {
    const child = spawn(entry.command, entry.args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, LOG_LEVEL: 'error' },
    });
    const pending = new Map();
    let buffered = '';
    let stderr = '';
    let settled = false;

    const settle = (outcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 1000).unref();
      resolve(outcome);
    };
    const stderrTail = () => (stderr.trim() ? ` (server said: ${stderr.trim().slice(-400)})` : '');
    const timer = setTimeout(
      () => settle({ ok: false, detail: `no reply within ${timeoutMs} ms${stderrTail()}` }),
      timeoutMs,
    );

    const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
    const request = (id, method, params) =>
      new Promise((reply) => {
        pending.set(id, reply);
        send({ jsonrpc: '2.0', id, method, params });
      });

    child.stdout.on('data', (chunk) => {
      buffered += chunk;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) {
        if (line.trim() === '') continue;
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }
        const reply = pending.get(message.id);
        if (reply) {
          pending.delete(message.id);
          reply(message);
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) =>
      settle({ ok: false, detail: `could not start the server: ${error.message}` }),
    );
    child.on('exit', (code) => {
      if (pending.size > 0)
        settle({ ok: false, detail: `server exited early (code ${code})${stderrTail()}` });
    });

    const run = async () => {
      const init = await request(1, 'initialize', {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'zendesk-mcp-verify', version: '1' },
      });
      if (init.error)
        return settle({ ok: false, detail: `initialize failed: ${init.error.message}` });
      const info = init.result?.serverInfo ?? {};
      send({ jsonrpc: '2.0', method: 'notifications/initialized' });
      const listed = await request(2, 'tools/list', {});
      const names = (listed.result?.tools ?? []).map((tool) => tool.name);
      if (!names.includes(SERVER_KEY)) {
        return settle({
          ok: false,
          detail: `expected the single "${SERVER_KEY}" tool, got: ${names.join(', ') || 'none'}`,
        });
      }
      return settle({
        ok: true,
        detail:
          `${info.name ?? 'server'} ${info.version ?? ''} answered initialize and lists the ${SERVER_KEY} tool`.trim(),
      });
    };
    run().catch((error) => settle({ ok: false, detail: error.message }));
  });

const configured = readEntry();
if (configured && checkFiles(configured) && checkNode(configured)) {
  const outcome = await handshake(configured);
  if (outcome.ok) pass('mcp-handshake', outcome.detail);
  else fail('mcp-handshake', outcome.detail);
}
finish();
