// pt-cli/src/safety.ts
// Security warnings and safeguards for post_config command execution
import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

// === BLOCKLIST ===
// Commands that are NEVER allowed (safety-critical operations)
const BLOCKED_COMMANDS = [
  // Privilege escalation
  'sudo', 'su', 'su -', 'su root',
  // Disk operations that could destroy data
  'dd', 'mkfs', 'fdisk', 'mount', 'umount',
  // Shell injection patterns
  ';', '|', '&', '&&', '||',
  // Dangerous chmod
  'chmod 777', 'chmod -R 777', 'chmod 666',
  // System commands that could kill processes
  'kill', 'killall', 'pkill', 'fuser',
  // Network operations that could exfiltrate data
  'nc', 'netcat', 'socat',
  // Package manager with dangerous flags
  'apt purge', 'apt remove', 'yum remove', 'brew uninstall',
];

// === DANGEROUS PATTERNS ===
// Commands that should trigger a warning but are NOT blocked
const DANGEROUS_PATTERNS = [
  // Destructive file operations
  'rm -rf', 'rm -r', 'rm --no-preserve-root', 'rm -rf /',
  // Remote downloads + execution
  'curl', 'wget', 'wget -O', 'curl |', 'wget |',
  // Script execution
  'bash', 'sh', 'python', 'python3', 'node -e', 'node -p',
  // Shell operations
  'eval', 'exec', 'source',
  // File system manipulation
  'chmod -R', 'chown -R', 'chgrp -R',
  // PowerShell (Windows)
  'powershell', 'pwsh', 'Invoke-Expression', 'IEX',
  // macOS-specific
  'diskutil', 'hdiutil', 'csrutil',
];

// === DEFAULT CONFIGURATION ===
export interface SecurityPolicy {
  maxExecutionTime: number; // milliseconds
  enableAuditLogging: boolean;
  trustedSources: string[];
  maxCommandsPerRun: number;
  securityLevel: 'warn' | 'strict';
}

// Default security policy - warning focused
const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  maxExecutionTime: 30000, // 30 seconds
  enableAuditLogging: true,
  trustedSources: [
    'github.com/garyritchie',
    'git.lyonritchie.com',
    'github.com/lyonritchie',
  ],
  maxCommandsPerRun: 50,
  securityLevel: 'warn', // Warning-focused mode
};

/**
 * Check if a command is in the blocklist (NEVER allowed)
 * Only truly dangerous operations that could destroy data
 */
export function isBlockedCommand(command: string): boolean {
  for (const blocked of BLOCKED_COMMANDS) {
    if (command.includes(blocked)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if a command should trigger a warning (but is allowed)
 */
export function isDangerousCommand(command: string): boolean {
  for (const pattern of DANGEROUS_PATTERNS) {
    if (command.includes(pattern)) {
      return true;
    }
  }
  return false;
}

/**
 * Execute a command with timeout and error handling
 */
export async function executeWithTimeout(
  command: string,
  cwd: string,
  timeoutMs: number = 30000
): Promise<{ success: boolean; stdout?: string; stderr?: string; timedOut?: boolean }> {
  const { execSync } = await import('child_process');

  try {
    const output = execSync(command, {
      cwd,
      stdio: 'pipe',
      timeout: timeoutMs,
      encoding: 'utf-8',
    });
    return { success: true, stdout: output };
  } catch (err: any) {
    if (err.code === 'ETIMEDOUT') {
      return { success: false, timedOut: true };
    }
    return {
      success: false,
      stderr: err.stderr || err.message,
    };
  }
}

/**
 * Log a security event to audit log
 */
export function logSecurityEvent(
  eventType: 'command_executed' | 'command_blocked' | 'command_timed_out' | 'template_loaded',
  command: string,
  templateName: string,
  result: 'success' | 'failed' | 'timedout' | 'blocked'
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    eventType,
    command,
    template: templateName,
    user: os.userInfo().username,
    result,
    hostname: os.hostname(),
  };

  const logDir = path.join(os.homedir(), '.pt');
  const logFile = path.join(logDir, 'security-audit.log');

  try {
    // Ensure log directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    // Append to audit log
    fs.appendFileSync(logFile, JSON.stringify(logEntry) + '\n');
  } catch (err) {
    // Silently fail if logging fails
    console.warn('Warning: Failed to write security audit log');
  }
}

/**
 * Check if a URL is from a trusted source
 */
export function isTrustedSource(url: string, trustedSources: string[] = DEFAULT_SECURITY_POLICY.trustedSources): boolean {
  return trustedSources.some(source => url.includes(source));
}

/**
 * Rate limiting: track the last execution timestamp per command hash
 */
const lastExecutionTimes = new Map<string, number>();
const RATE_LIMIT_MS = 1000; // 1 second between identical commands

export function canExecute(command: string, maxCommandsPerRun: number = 50): boolean {
  // Check total commands executed this run
  const totalExecuted = lastExecutionTimes.size;
  if (totalExecuted >= maxCommandsPerRun) {
    return false;
  }

  // Check rate limit for this specific command
  const hash = crypto.createHash('md5').update(command).digest('hex');
  const lastTime = lastExecutionTimes.get(hash) || 0;
  if (Date.now() - lastTime < RATE_LIMIT_MS) {
    return false;
  }

  // Record execution timestamp
  lastExecutionTimes.set(hash, Date.now());
  return true;
}

/**
 * Reset execution timestamps (for testing or between runs)
 */
export function resetExecutionCounts(): void {
  lastExecutionTimes.clear();
}

/**
 * Validate a template's security before execution
 */
export function validateTemplateSecurity(
  templateConfig: any,
  securityPolicy: SecurityPolicy = DEFAULT_SECURITY_POLICY
): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check post_config tasks
  const postConfigTasks = templateConfig.post_config || [];
  for (const task of postConfigTasks) {
    const command = task.command;
    if (!command) continue;

    // Check for blocked commands
    if (isBlockedCommand(command)) {
      errors.push(`Blocked command in template: ${command}`);
    }

    // Warn about dangerous commands
    if (isDangerousCommand(command)) {
      warnings.push(`Dangerous command in template: ${command}`);
    }

    // Check for shell injection patterns
    if (command.includes(';') || command.includes('|') || command.includes('&')) {
      warnings.push(`Shell injection pattern in command: ${command}`);
    }

    // Check for remote downloads
    if (command.includes('curl') || command.includes('wget')) {
      warnings.push(`Remote download in command: ${command}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get security policy from config or use defaults
 */
export function getSecurityPolicy(configPath?: string): SecurityPolicy {
  // Try to load from config
  if (configPath) {
    try {
      const YAML = require('yaml');
      const config = YAML.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.security) {
        return { ...DEFAULT_SECURITY_POLICY, ...config.security };
      }
    } catch (err) {
      // Fall back to defaults
    }
  }

  return DEFAULT_SECURITY_POLICY;
}

/**
 * Show warning about dangerous command and wait for user to cancel.
 * Resolves true after the timeout (continue), or false immediately on CTRL+C (cancel).
 */
export async function showDangerousCommandWarning(command: string, timeoutSeconds: number = 5): Promise<boolean> {
  const readline = await import('readline');

  console.log(chalk.red('\n⚠️  DANGEROUS COMMAND DETECTED'));
  console.log(chalk.red(`   Command: ${command}`));
  console.log(chalk.red('   This could potentially harm your system.'));
  console.log(chalk.yellow(`   Press CTRL+C to cancel, or wait ${timeoutSeconds}s to continue...`));

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      rl.close();
      resolve(true);
    }, timeoutSeconds * 1000);

    rl.on('SIGINT', () => {
      clearTimeout(timer);
      rl.close();
      console.log(chalk.yellow('\n⚠️  Command cancelled by user'));
      resolve(false);
    });
  });
}

// Security response handling for GUI integration
export async function handleSecurityResponse(response: string): Promise<boolean> {
  // Normalize response
  const normalized = response.trim().toLowerCase();
  
  // Accept 'y' or 'yes' as positive response
  if (normalized === 'y' || normalized === 'yes') {
    console.log('Security response: ALLOWED');
    return true;
  }
  
  // Reject any other response
  console.log('Security response: DENIED');
  return false;
}
