import { execSync } from 'child_process';
import { PostConfigTask, SupportedPlatform, SupportedShell } from './config.js';

export interface ExecutionContext {
  os: 'windows' | 'linux' | 'darwin';
  shell: 'powershell' | 'bash' | 'cmd';
}

const executableCache = new Map<string, boolean>();

/**
 * Checks whether an executable binary exists on the PATH.
 */
export function hasExecutable(binaryName: string): boolean {
  if (executableCache.has(binaryName)) {
    return executableCache.get(binaryName)!;
  }
  try {
    const isWin = process.platform === 'win32';
    const checkCmd = isWin ? `where ${binaryName}` : `which ${binaryName}`;
    execSync(checkCmd, { stdio: 'ignore' });
    executableCache.set(binaryName, true);
    return true;
  } catch {
    executableCache.set(binaryName, false);
    return false;
  }
}

/**
 * Clears cached executable checks (used primarily in tests).
 */
export function clearExecutableCache(): void {
  executableCache.clear();
}

/**
 * Detects the normalized host operating system.
 */
export function detectHostOS(): 'windows' | 'linux' | 'darwin' {
  if (process.platform === 'win32') return 'windows';
  if (process.platform === 'darwin') return 'darwin';
  return 'linux';
}

/**
 * Detects the active shell interpreter for the current environment.
 */
export function detectHostShell(overrideShell?: string): 'powershell' | 'bash' | 'cmd' {
  if (overrideShell) {
    const lower = overrideShell.toLowerCase();
    if (lower === 'powershell' || lower === 'pwsh') return 'powershell';
    if (lower === 'bash' || lower === 'sh') return 'bash';
    if (lower === 'cmd' || lower === 'batch') return 'cmd';
  }

  const hostOS = detectHostOS();
  if (hostOS === 'windows') {
    // Check if running in Git Bash / MSYS2 / Cygwin
    const envShell = process.env.SHELL || '';
    if (envShell.toLowerCase().endsWith('bash.exe') || envShell.toLowerCase().endsWith('bash')) {
      return 'bash';
    }
    // Default to PowerShell on Windows if available
    if (hasExecutable('pwsh') || hasExecutable('powershell')) {
      return 'powershell';
    }
    return 'cmd';
  }

  // Non-Windows default is bash
  return 'bash';
}

/**
 * Resolves the full execution context given optional CLI overrides.
 */
export function resolveExecutionContext(options: {
  shell?: string;
  platform?: string;
} = {}): ExecutionContext {
  let resolvedOS = detectHostOS();
  if (options.platform) {
    const p = options.platform.toLowerCase();
    if (p === 'windows' || p === 'win32') resolvedOS = 'windows';
    else if (p === 'darwin' || p === 'macos' || p === 'osx') resolvedOS = 'darwin';
    else if (p === 'linux') resolvedOS = 'linux';
  }

  const resolvedShell = detectHostShell(options.shell);
  return { os: resolvedOS, shell: resolvedShell };
}

/**
 * Known indicator patterns for commands that only run in POSIX/Bash environments.
 */
const POSIX_COMMAND_PATTERNS = [
  /^(chmod|chown)\b/,
  /^(export|source)\b/,
  /^(apt|apt-get|brew|yum|pacman)\b/,
  /^(systemctl|service)\b/,
  /^(ln\s+-s)\b/,
  /\bcat\s+<<\s*EOF/,
  /2>&1\s*\|\s*tee/,
  /\$\([^\)]+\)/,
];

/**
 * Known indicator patterns for PowerShell-specific commands.
 */
const POWERSHELL_COMMAND_PATTERNS = [
  /^(Set-ExecutionPolicy|Get-ChildItem|New-Item|Remove-Item|Start-Process|Invoke-WebRequest|Select-Object)\b/i,
  /\$env:[A-Za-z_][A-Za-z0-9_]*/,
  /\$_/,
  /\s-(eq|ne|match|like)\s/i,
];

/**
 * Known indicator patterns for Windows CMD commands.
 */
const CMD_COMMAND_PATTERNS = [
  /^(del\s+\/[fFqsQS]|rmdir\s+\/[sS])/i,
  /%[A-Za-z_][A-Za-z0-9_]*%/,
];

export interface CompatibilityResult {
  compatible: boolean;
  reason?: string;
}

/**
 * Classifies whether a raw command string is compatible with the target context.
 */
export function classifyCommandCompatibility(
  rawCmd: string,
  context: ExecutionContext
): CompatibilityResult {
  const trimmed = rawCmd.trim();

  // If running on Windows with PowerShell or CMD
  if (context.os === 'windows' && context.shell !== 'bash') {
    for (const pattern of POSIX_COMMAND_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          compatible: false,
          reason: `Command uses POSIX/Bash syntax ('${trimmed}') not supported directly in ${context.shell} on Windows`,
        };
      }
    }
  }

  // If running on Linux/macOS with Bash
  if (context.os !== 'windows' && context.shell === 'bash') {
    for (const pattern of POWERSHELL_COMMAND_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          compatible: false,
          reason: `Command uses PowerShell syntax ('${trimmed}') on ${context.os}`,
        };
      }
    }
    for (const pattern of CMD_COMMAND_PATTERNS) {
      if (pattern.test(trimmed)) {
        return {
          compatible: false,
          reason: `Command uses Windows CMD syntax ('${trimmed}') on ${context.os}`,
        };
      }
    }
  }

  return { compatible: true };
}

/**
 * Checks if a task's explicit platform declaration matches the active context.
 */
export function matchesPlatform(
  taskPlatform: SupportedPlatform | SupportedPlatform[] | undefined,
  contextOS: 'windows' | 'linux' | 'darwin'
): boolean {
  if (!taskPlatform || taskPlatform === 'all') return true;
  const list = Array.isArray(taskPlatform) ? taskPlatform : [taskPlatform];
  for (const p of list) {
    if (p === 'all') return true;
    if (p === 'windows' && contextOS === 'windows') return true;
    if (p === 'posix' && (contextOS === 'linux' || contextOS === 'darwin')) return true;
    if (p === contextOS) return true;
  }
  return false;
}

/**
 * Checks if a task's explicit shell declaration matches the active context.
 */
export function matchesShell(
  taskShell: SupportedShell | SupportedShell[] | undefined,
  contextShell: 'powershell' | 'bash' | 'cmd'
): boolean {
  if (!taskShell || taskShell === 'auto') return true;
  const list = Array.isArray(taskShell) ? taskShell : [taskShell];
  for (const s of list) {
    if (s === 'auto') return true;
    if ((s === 'powershell' || s === 'pwsh') && contextShell === 'powershell') return true;
    if ((s === 'bash' || s === 'sh') && contextShell === 'bash') return true;
    if (s === 'cmd' && contextShell === 'cmd') return true;
  }
  return false;
}

/**
 * Resolves the concrete string command for a task from either a string
 * or a polymorphic command map.
 */
export function resolveTaskCommand(
  task: PostConfigTask,
  context: ExecutionContext
): string | undefined {
  if (!task.command) return undefined;
  if (typeof task.command === 'string') return task.command;

  const map = task.command;
  // Check exact shell first
  if (context.shell === 'powershell' && (map.powershell || map.pwsh)) {
    return map.powershell || map.pwsh;
  }
  if (context.shell === 'bash' && (map.bash || map.sh)) {
    return map.bash || map.sh;
  }
  if (context.shell === 'cmd' && map.cmd) {
    return map.cmd;
  }

  // Check OS / platform
  if (context.os === 'windows' && map.windows) {
    return map.windows;
  }
  if ((context.os === 'linux' || context.os === 'darwin') && map.posix) {
    return map.posix;
  }
  if (context.os === 'linux' && map.linux) {
    return map.linux;
  }
  if (context.os === 'darwin' && (map.darwin || (map as any).macos)) {
    return map.darwin || (map as any).macos;
  }
  if (map.all) {
    return map.all;
  }

  return undefined;
}
