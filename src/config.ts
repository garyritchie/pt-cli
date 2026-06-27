import YAML from 'yaml';
import fs from 'fs';
import path from 'path';
import os from 'os';
import chalk from 'chalk';
import { SecurityPolicy } from './safety.js';

export function getHomeDir(): string {
  return path.join(os.homedir(), '.pt');
}

export function getConfigPath(): string {
  return path.join(getHomeDir(), 'config.yaml');
}

export interface FolderNode {
  name: string;
  info: string;
  children?: FolderNode[];
  is_file?: boolean;
}

export interface PostConfigTask {
  command?: string;       // shell command to run
  description: string;   // shown to user
  type?: string;          // only run for matching project type (optional)
  always_prompt?: boolean; // if true, ask per-task even if user says "yes"
  script?: string;        // path to script relative to template root
  cross_platform?: boolean; // if true, use platform-safe runner
  checked?: boolean;      // default checkbox state (only for global tasks)
}

export interface CopyFileEntry {
  src: string;       // relative to template root
  dest: string;      // relative to project root
  substitute_variables?: boolean;
  chmod?: string;    // e.g., "0755"
}


export interface PostCopyFile {
  src: string;       // relative to templateRoot
  dest?: string;     // relative to project root (defaults to src)
}
export interface TemplateConfig {
  description: string;
  templateRoot?: string;    // path to source directory (set by `pt learn`)
  variables?: TemplateVariable[];
  folders: FolderNode[];
  exclude?: string[];
  copy_files?: CopyFileEntry[];
  post_copy?: PostCopyFile[];    // auto-detected executables/scripts
  post_config?: PostConfigTask[];  // NEW
}

export interface TemplateVariable {
  name: string;
  prompt: string;
  default?: string;
  required?: boolean;
}

export interface PtConfig {
  version: string;
  templates: Record<string, TemplateConfig>;
  ignore?: string[];  // top-level folder ignore patterns for pt learn
  default_post_config?: PostConfigTask[];  // default post-config tasks applied to all projects
  variables?: TemplateVariable[];         // global variables for substitution
  security?: SecurityPolicy;  // security policy configuration
}

export function ensureConfigDir() {
  if (!fs.existsSync(getHomeDir())) {
    fs.mkdirSync(getHomeDir(), { recursive: true });
  }
}

export function loadConfig(): PtConfig {
  ensureConfigDir();
  if (!fs.existsSync(getConfigPath())) {
    const defaultConfig: PtConfig = {
      version: '3.0',
      templates: {},
      default_post_config: [],
      variables: []
    };
    // Don't automatically save a default config on load.
    // This prevents accidental creation of mostly-empty configs 
    // if the home directory is temporarily mapped incorrectly.
    return defaultConfig;
  }

  try {
    const content = fs.readFileSync(getConfigPath(), 'utf-8');
    if (!content.trim()) {
      throw new Error("Config file is empty");
    }
    const config: PtConfig = YAML.parse(content);
    
    // Initialize ignore for legacy configs that don't have it
    if (config.ignore === undefined) {
      config.ignore = [];
    }

    // Initialize default_post_config for configs that don't have it
    if (config.default_post_config === undefined) {
      // Migrate from global_post_config if it exists
      if ((config as any).global_post_config !== undefined) {
        config.default_post_config = (config as any).global_post_config;
        delete (config as any).global_post_config;
        saveConfig(config);
      } else {
        config.default_post_config = [];
      }
    }

    // Initialize variables for configs that don't have it
    if (config.variables === undefined) {
      config.variables = [];
    } else if (!Array.isArray(config.variables)) {
      // Migrate from Record<string, string> to TemplateVariable[]
      const oldVars = config.variables as unknown as Record<string, string>;
      config.variables = Object.entries(oldVars).map(([name, value]) => ({
        name,
        prompt: `Enter ${name}:`,
        default: value
      }));
    }

    // Migration from 2.0 to 3.0
    if (config.version === '2.0') {
      for (const key in config.templates) {
        const t = config.templates[key];
        if (t.description === undefined && (t as any).name) {
          t.description = (t as any).name;
          delete (t as any).name;
        }
        if ((t as any).type) {
          delete (t as any).type;
        }
      }
      config.version = '3.0';
      saveConfig(config);
      console.log(`\nConfig migrated to version 3.0 (renamed 'name' to 'description', removed 'type')`);
    }

    return config;
  } catch (err) {
    const error = err as Error;
    console.error(chalk.red(`\nError loading config: ${error.message}`));
    // If we have a backup, maybe suggest using it
    const backupPath = getConfigPath() + '.bak';
    if (fs.existsSync(backupPath)) {
      console.error(chalk.yellow(`A backup exists at ${backupPath}. You may want to restore it.`));
    }
    process.exit(1);
  }
}

export function normalizeVariable(v: TemplateVariable): TemplateVariable {
  const result: any = { name: v.name };
  if (v.prompt !== undefined) result.prompt = v.prompt;
  if (v.default !== undefined) result.default = v.default;
  if (v.required !== undefined) result.required = v.required;
  return result;
}

export function saveConfig(config: PtConfig) {
  ensureConfigDir();

  // Normalize variable key ordering (forces 'name' to be first in serialized YAML)
  if (config.variables && Array.isArray(config.variables)) {
    config.variables = config.variables.map(normalizeVariable);
  }
  if (config.templates) {
    for (const key of Object.keys(config.templates)) {
      const template = config.templates[key];
      if (template.variables && Array.isArray(template.variables)) {
        template.variables = template.variables.map(normalizeVariable);
      }
    }
  }

  const content = YAML.stringify(config);
  const tempPath = getConfigPath() + '.tmp';
  const backupPath = getConfigPath() + '.bak';

  try {
    // 1. Create a backup of the current valid config if it exists
    if (fs.existsSync(getConfigPath())) {
      fs.copyFileSync(getConfigPath(), backupPath);
    }

    // 2. Write to a temporary file first (atomic save)
    fs.writeFileSync(tempPath, content);

    // 3. Rename temp file to actual config path
    fs.renameSync(tempPath, getConfigPath());
  } catch (err) {
    const error = err as Error;
    console.error(chalk.red(`\nFailed to save config: ${error.message}`));
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch (e) {}
    }
    throw error;
  }
}

export function getTemplateNames(config: PtConfig): string[] {
  return Object.keys(config.templates || {});
}

/**
 * Get default post-config tasks with defaults applied for unchecked entries.
 * Default tasks that have checked=true (or undefined, which defaults to true)
 * will be auto-checked. Tasks with checked=false stay unchecked by default.
 */
export function getDefaultPostConfig(config: PtConfig): PostConfigTask[] {
  const defaults = config.default_post_config || [];
  return defaults.map(t => ({
    ...t,
    checked: t.checked !== false // default to true if not explicitly false
  }));
}

/**
 * Get security policy from config or use defaults
 */
export function getSecurityPolicy(config: PtConfig): SecurityPolicy {
  const defaultPolicy: SecurityPolicy = {
    allowlist: [
      'npm', 'npm run', 'yarn', 'yarn run', 'pnpm',
      'git', 'git add', 'git commit', 'git pull', 'git fetch',
      'pip', 'pip install', 'python', 'python3',
      'bash', 'sh', 'node',
      'chmod', 'chown', 'mkdir', 'cp', 'mv',
      'sqlite3', 'mysql', 'psql',
    ],
    blocklist: [
      'rm -rf', 'rm -r', 'rm --no-preserve-root',
      'curl', 'wget', 'wget -O',
      'bash', 'sh', 'python', 'python3',
      'eval', 'exec', 'source',
      'sudo', 'su',
      'dd', 'mkfs', 'fdisk',
      'chmod 777', 'chmod -R',
    ],
    dangerousPatterns: [
      'rm -rf', 'rm -r', 'rm --no-preserve-root',
      'curl', 'wget', 'wget -O',
      'bash', 'sh', 'python', 'python3',
      'eval', 'exec', 'source',
      'sudo', 'su',
      'dd', 'mkfs', 'fdisk',
      'chmod 777', 'chmod -R',
      'curl |', 'wget |',
      'node -e', 'node -p',
    ],
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

  return config.security || defaultPolicy;
}

// Default exclusions for template scanning
export const DEFAULT_EXCLUDES = [
  '.git',
  '.gitea',
  '.vscode',
  'node_modules',
  'dist',
  'build',
  'bin',
  '.DS_Store',
  'Thumbs.db',
  '.stignore',
  '.stfolder',
  '.stversions',
];

// Check if a path should be excluded
export function shouldExclude(dirPath: string, fullPath: string, excludes?: string[]): boolean {
  const name = path.basename(fullPath);  // Check the entry name, not the parent dir
  const allExcludes = [...DEFAULT_EXCLUDES, ...(excludes || [])];

  // Check if any entry is a git submodule
  if (name === '.git' && fs.existsSync(path.join(fullPath, 'modules'))) {
    return true;
  }

  // Check for submodules in the parent
  const gitmodulesPath = path.join(fullPath, '..', '.gitmodules');
  if (fs.existsSync(gitmodulesPath)) {
    try {
      const gitmodules = fs.readFileSync(gitmodulesPath, 'utf-8');
      const regex = new RegExp(`path = ${name}\\s*$`, 'm');
      if (regex.test(gitmodules)) {
        return true;
      }
    } catch (e) {
      // Ignore errors reading gitmodules
    }
  }

  return allExcludes.includes(name);
}

// Check if a folder should be ignored based on ignore patterns.
// Patterns support glob-style wildcards:
//   DAILIES/*      - ignore everything inside DAILIES (DAILIES itself is kept)
//   DAILIES/**     - same as DAILIES/* (deep match from root)
//   **/FOLDER/     - ignore any folder named FOLDER at any depth
//   FOLDER         - ignore this specific folder (at root or as name)
export function shouldIgnore(folderName: string, relativePath: string, ignorePatterns?: string[]): boolean {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;

  // Normalize relativePath to use forward slashes for consistent pattern matching
  const normalizedPath = relativePath.split(path.sep).join('/');
  const parts = normalizedPath.split('/');

  for (let pattern of ignorePatterns) {
    // Normalize pattern slashes
    pattern = pattern.split(/[/\\]/).join('/');

    // 1. Deep match: "**/NAME" or "**/NAME/"
    if (pattern.startsWith('**/')) {
      let target = pattern.substring(3);
      if (target.endsWith('/')) target = target.slice(0, -1);
      
      // Match if any segment of the path matches the target
      if (parts.includes(target)) return true;
      continue;
    }

    // 2. Wildcard children at root: "FOLDER/*" or "FOLDER/**"
    // Matches children of the named folder, NOT the folder itself
    if (pattern.endsWith('/*') || pattern.endsWith('/**')) {
      const suffix = pattern.endsWith('/**') ? 3 : 2;
      const parentName = pattern.slice(0, -suffix);
      if (parts[0] === parentName && parts.length > 1) {
        return true;
      }
      continue;
    }

    // 3. Exact match (name or path)
    let cleanPattern = pattern;
    if (cleanPattern.endsWith('/')) cleanPattern = cleanPattern.slice(0, -1);

    if (folderName === cleanPattern || normalizedPath === cleanPattern) {
      return true;
    }
  }
  return false;
}

// Check if a file should be excluded (e.g., .gitignore patterns)
export function shouldExcludeFile(fileName: string): boolean {
  const excludePatterns = [
    '*.pyc',
    '*.pyo',
    '*.pyd',
    '.Python',
    '*.egg-info',
    '*.egg',
    '*.whl',
    '*.so',
    '*.dll',
    '*.dylib',
    '*.exe',
    '*.o',
    '*.a',
    '*.lib',
    '*.class',
    '*.jar',
    '*.war',
    '*.ear',
    '*.log',
    '*.tmp',
    '*.swp',
    '*.swo',
    '*~',
    '.bak',
    '*.md',
    '*.txt',
    '*.json',
    '*.yaml',
    '*.yml',
    '*.ini',
    '*.conf',
    '*.config',
    '.gitconfig',
    '.makerc',
    'Gemfile.lock',
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'composer.json',
    'composer.lock',
  ];

  for (const pattern of excludePatterns) {
    if (pattern.startsWith('*')) {
      const ext = pattern.substring(1);
      if (fileName.endsWith(ext)) {
        return true;
      }
    } else if (fileName === pattern) {
      return true;
    }
  }

  return false;
}
// Sanitize path to prevent traversal
export function sanitizePath(p: string): string {
  // Remove any path segments that attempt to go up, and trim whitespace
  const segments = p.split(/[/\\]/);
  const safeSegments = segments
    .map(s => s.trim())
    .filter(s => s !== '..' && s !== '.' && s !== '');
  return safeSegments.join(path.sep);
}
