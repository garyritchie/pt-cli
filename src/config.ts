const YAML = require('yaml');
const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME_DIR = path.join(os.homedir(), '.pt');
const CONFIG_PATH = path.join(HOME_DIR, 'config.yaml');

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
  global_post_config?: PostConfigTask[];  // global post-config tasks applied to all projects
}

export function ensureConfigDir() {
  if (!fs.existsSync(HOME_DIR)) {
    fs.mkdirSync(HOME_DIR, { recursive: true });
  }
}

export function loadConfig(): PtConfig {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_PATH)) {
    const defaultConfig: PtConfig = {
      version: '3.0',
      templates: {},
      global_post_config: []
    };
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
  const config: PtConfig = YAML.parse(content);
  // Initialize ignore for legacy configs that don't have it
  if (config.ignore === undefined) {
    config.ignore = [];
  }

  // Initialize global_post_config for configs that don't have it
  if (config.global_post_config === undefined) {
    config.global_post_config = [];
  }

  // Migration from 2.0 to 3.0
  if (config.version === '2.0') {
    for (const key in config.templates) {
      const t = config.templates[key] as any;
      if (t.name && !t.description) {
        t.description = t.name;
        delete t.name;
      }
      if (t.type) {
        delete t.type;
      }
    }
    config.version = '3.0';
    saveConfig(config);
    console.log(`\nConfig migrated to version 3.0 (renamed 'name' to 'description', removed 'type')`);
  }

  return config;
}

export function saveConfig(config: PtConfig) {
  ensureConfigDir();
  const content = YAML.stringify(config);
  fs.writeFileSync(CONFIG_PATH, content);
}

export function getTemplateNames(config: PtConfig): string[] {
  return Object.keys(config.templates || {});
}

/**
 * Get global post-config tasks with defaults applied for unchecked entries.
 * Global tasks that have checked=true (or undefined, which defaults to true)
 * will be auto-checked. Tasks with checked=false stay unchecked by default.
 */
export function getGlobalPostConfig(config: PtConfig): PostConfigTask[] {
  const global = config.global_post_config || [];
  return global.map(t => ({
    ...t,
    checked: t.checked !== false // default to true if not explicitly false
  }));
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
