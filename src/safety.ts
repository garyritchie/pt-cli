// pt-cli/src/safety.ts
// Security validation for post_config command execution
import crypto from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';

// === ALLOWLIST ===
// Safe commands that are allowed by default (no confirmation needed)
const ALLOWED_COMMANDS = [
  // Build tools
  'npm', 'npm run', 'yarn', 'yarn run', 'pnpm',
  // Version control
  'git', 'git add', 'git commit', 'git pull', 'git fetch',
  // Package managers
  'pip', 'pip install', 'python', 'python3',
  // Script runners
  'bash', 'sh', 'node',
  // Common utilities
  'chmod', 'chown', 'mkdir', 'cp', 'mv',
  // Database
  'sqlite3', 'mysql', 'psql',
  // File operations
  'cat', 'echo', 'touch', 'ln', 'rm', 'rmdir',
  // Text processing
  'sed', 'awk', 'grep', 'find', 'xargs',
  // Networking (read-only)
  'curl', 'wget',
  // Environment
  'env', 'export', 'source',
  // Package managers (additional)
  'apt', 'apt-get', 'yum', 'brew', 'pacman',
  // Python tools
  'pip3', 'pipenv', 'poetry', 'virtualenv',
  // Node tools
  'npx', 'tsc', 'webpack', 'rollup', 'esbuild',
  // Python scripting
  'python3 -m', 'python -m',
  // Shell scripting
  'chmod +x', 'chmod 755', 'chmod 644',
];

// === BLOCKLIST ===
// Commands that are NEVER allowed, even with confirmation
const BLOCKED_COMMANDS = [
  // Destructive operations
  'rm -rf', 'rm -r', 'rm --no-preserve-root', 'rm -rf /',
  // Privilege escalation
  'sudo', 'su', 'su -', 'su root',
  // Dangerous shell operations
  'eval', 'exec', 'source',
  // Disk operations
  'dd', 'mkfs', 'fdisk', 'mount', 'umount',
  // Network download + execute
  'curl | bash', 'curl | sh', 'wget | bash', 'wget | sh',
  // Shell injection patterns
  ';', '|', '&', '&&', '||',
  // Dangerous chmod
  'chmod 777', 'chmod -R 777', 'chmod 666',
  // System commands
  'kill', 'killall', 'pkill', 'fuser',
  // File system manipulation
  'chmod -R', 'chown -R', 'chgrp -R',
  // Network operations that could exfiltrate data
  'nc', 'netcat', 'socat',
  // Package manager with dangerous flags
  'apt purge', 'apt remove', 'yum remove', 'brew uninstall',
];

// === DANGEROUS PATTERNS ===
// Commands that require user confirmation before execution
const DANGEROUS_PATTERNS = [
  'rm -rf', 'rm -r', 'rm --no-preserve-root',
  'curl', 'wget', 'wget -O',
  'bash', 'sh', 'python', 'python3',
  'eval', 'exec', 'source',
  'sudo', 'su',
  'dd', 'mkfs', 'fdisk',
  'chmod 777', 'chmod -R',
  'curl |', 'wget |',
  'node -e', 'node -p',
];

// === DEFAULT CONFIGURATION ===
export interface SecurityPolicy {
  allowlist: string[];
  blocklist: string[];
  dangerousPatterns: string[];
  maxExecutionTime: number; // milliseconds
  requireConfirmationForDangerous: boolean;
  enableAuditLogging: boolean;
  trustedSources: string[];
  maxCommandsPerRun: number;
  requireSandbox: boolean;
  securityLevel: 'strict' | 'medium' | 'relaxed';
}

// Default security policy
const DEFAULT_SECURITY_POLICY: SecurityPolicy = {
  allowlist: [...ALLOWED_COMMANDS],
  blocklist: [...BLOCKED_COMMANDS],
  dangerousPatterns: [...DANGEROUS_PATTERNS],
  maxExecutionTime: 30000, // 30 seconds
  requireConfirmationForDangerous: true,
  enableAuditLogging: true,
  trustedSources: [
    'github.com/garyritchie',
    'gitea.lyonritchie.com/garyritchie',
    'github.com/lyonritchie',
  ],
  maxCommandsPerRun: 50,
  requireSandbox: false,
  securityLevel: 'strict',
};

/**
 * Check if a command is in the blocklist (NEVER allowed)
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
 * Check if a command requires user confirmation (dangerous but not blocked)
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
 * Check if a command is in the allowlist (allowed without confirmation)
 */
export function isAllowedCommand(command: string): boolean {
  const baseCmd = command.split(' ')[0].trim();
  return ALLOWED_COMMANDS.some(allowed =>
    baseCmd === allowed || baseCmd.startsWith(allowed + ' ')
  );
}

/**
 * Check if a command is safe to execute (not blocked and not dangerous)
 */
export function isSafeCommand(command: string): boolean {
  if (isBlockedCommand(command)) {
    return false;
  }
  if (isDangerousCommand(command)) {
    return false;
  }
  return true;
}

/**
 * Check if a command is allowed based on security policy
 */
export function isCommandAllowed(command: string, securityLevel: string = 'strict'): boolean {
  // Blocklist always wins
  if (isBlockedCommand(command)) {
    return false;
  }

  // In strict mode, only allowlist commands are permitted
  if (securityLevel === 'strict') {
    return isAllowedCommand(command);
  }

  // In medium mode, allowlist + dangerous with confirmation
  if (securityLevel === 'medium') {
    return isAllowedCommand(command) || isDangerousCommand(command);
  }

  // In relaxed mode, only blocklist is enforced
  return !isBlockedCommand(command);
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
 * Check if a command has been executed too many times (rate limiting)
 */
const executionCounts = new Map<string, number>();
const RATE_LIMIT_MS = 1000; // 1 second between identical commands

export function canExecute(command: string, maxCommandsPerRun: number = 50): boolean {
  // Check total count per run
  const totalExecuted = Array.from(executionCounts.values()).reduce((sum, count) => sum + count, 0);
  if (totalExecuted >= maxCommandsPerRun) {
    return false;
  }

  // Check rate limit for this specific command
  const hash = crypto.createHash('md5').update(command).digest('hex');
  const last = executionCounts.get(hash) || 0;
  if (Date.now() - last < RATE_LIMIT_MS) {
    return false;
  }

  // Update count
  executionCounts.set(hash, Date.now());
  return true;
}

/**
 * Reset execution counts (for testing or between runs)
 */
export function resetExecutionCounts(): void {
  executionCounts.clear();
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
