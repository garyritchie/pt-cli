import { test } from 'node:test';
import assert from 'node:assert';
import {
  detectHostOS,
  detectHostShell,
  resolveExecutionContext,
  matchesPlatform,
  matchesShell,
  classifyCommandCompatibility,
  resolveTaskCommand
} from '../src/shell.js';

test('detectHostOS returns windows, linux, or darwin', () => {
  const os = detectHostOS();
  assert.ok(['windows', 'linux', 'darwin'].includes(os));
});

test('resolveExecutionContext respects explicit flags', () => {
  const ctx = resolveExecutionContext({ shell: 'bash', platform: 'linux' });
  assert.strictEqual(ctx.os, 'linux');
  assert.strictEqual(ctx.shell, 'bash');

  const winCtx = resolveExecutionContext({ shell: 'powershell', platform: 'windows' });
  assert.strictEqual(winCtx.os, 'windows');
  assert.strictEqual(winCtx.shell, 'powershell');
});

test('matchesPlatform handles platform constraints correctly', () => {
  assert.strictEqual(matchesPlatform(undefined, 'windows'), true);
  assert.strictEqual(matchesPlatform('all', 'windows'), true);
  assert.strictEqual(matchesPlatform('windows', 'windows'), true);
  assert.strictEqual(matchesPlatform('windows', 'linux'), false);
  assert.strictEqual(matchesPlatform('posix', 'linux'), true);
  assert.strictEqual(matchesPlatform('posix', 'darwin'), true);
  assert.strictEqual(matchesPlatform('posix', 'windows'), false);
  assert.strictEqual(matchesPlatform(['windows', 'linux'], 'windows'), true);
  assert.strictEqual(matchesPlatform(['darwin'], 'linux'), false);
});

test('matchesShell handles shell constraints correctly', () => {
  assert.strictEqual(matchesShell(undefined, 'powershell'), true);
  assert.strictEqual(matchesShell('auto', 'powershell'), true);
  assert.strictEqual(matchesShell('powershell', 'powershell'), true);
  assert.strictEqual(matchesShell('pwsh', 'powershell'), true);
  assert.strictEqual(matchesShell('bash', 'powershell'), false);
  assert.strictEqual(matchesShell('bash', 'bash'), true);
  assert.strictEqual(matchesShell('sh', 'bash'), true);
  assert.strictEqual(matchesShell('cmd', 'cmd'), true);
});

test('classifyCommandCompatibility flags incompatible syntax', () => {
  const winCtx = { os: 'windows' as const, shell: 'powershell' as const };
  const chmodResult = classifyCommandCompatibility('chmod +x build.sh', winCtx);
  assert.strictEqual(chmodResult.compatible, false);
  assert.ok(chmodResult.reason?.includes('POSIX/Bash'));

  const exportResult = classifyCommandCompatibility('export FOO=bar', winCtx);
  assert.strictEqual(exportResult.compatible, false);

  const npmResult = classifyCommandCompatibility('npm install', winCtx);
  assert.strictEqual(npmResult.compatible, true);

  const linuxCtx = { os: 'linux' as const, shell: 'bash' as const };
  const psResult = classifyCommandCompatibility('Set-ExecutionPolicy RemoteSigned', linuxCtx);
  assert.strictEqual(psResult.compatible, false);

  const psEnvResult = classifyCommandCompatibility('$env:FOO = "bar"', linuxCtx);
  assert.strictEqual(psEnvResult.compatible, false);

  const gitResult = classifyCommandCompatibility('git init', linuxCtx);
  assert.strictEqual(gitResult.compatible, true);
});

test('resolveTaskCommand extracts correct command from polymorphic maps', () => {
  const winCtx = { os: 'windows' as const, shell: 'powershell' as const };
  const linuxCtx = { os: 'linux' as const, shell: 'bash' as const };

  const task = {
    description: 'Setup venv',
    command: {
      windows: 'python -m venv .venv; .\\.venv\\Scripts\\Activate.ps1',
      posix: 'python3 -m venv .venv && source .venv/bin/activate'
    }
  };

  assert.strictEqual(
    resolveTaskCommand(task, winCtx),
    'python -m venv .venv; .\\.venv\\Scripts\\Activate.ps1'
  );
  assert.strictEqual(
    resolveTaskCommand(task, linuxCtx),
    'python3 -m venv .venv && source .venv/bin/activate'
  );
});
