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
  name: string;
  type: string;
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
      version: '2.0',
      templates: {}
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

// Default exclusions for template scanning
export const DEFAULT_EXCLUDES = [
  '.git',
  'node_modules',
  'dist',
  'build',
  '.DS_Store',
  '.pytest_cache',
  '__pycache__',
  '.vscode',
  '.idea',
  '.gitkeep.md',
  '.info.md',
  '.vale.ini',
  '.gitattributes',
  '.gitconfig',
  '.detoxrc',
  '.markdownlint.json',
  '.update-exclude',
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
//   DAILIES/**     - same as DAILIES/* (deep match)
//   FOLDER         - ignore this specific folder (no wildcard)
export function shouldIgnore(folderName: string, relativePath: string, ignorePatterns?: string[]): boolean {
  if (!ignorePatterns || ignorePatterns.length === 0) return false;

  const parts = relativePath.split(path.sep);

  for (const pattern of ignorePatterns) {
    // Handle wildcard patterns: "FOLDER/*" or "FOLDER/**"
    // These match children of the named folder, NOT the folder itself
    if (pattern.endsWith('/*') || pattern.endsWith('/**')) {
      const suffix = pattern.endsWith('/**') ? 3 : 2;
      const parentName = pattern.slice(0, -suffix);  // "FOLDER" from "FOLDER/*"
      // Match if the relative path has the parent as a prefix AND has more depth
      if (parts[0] === parentName && parts.length > 1) {
        return true;
      }
    }
    // No wildcard: exact folder name match
    else {
      if (folderName === pattern) return true;
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
  ];
  
  for (const pattern of excludePatterns) {
    if (pattern.startsWith('*')) {
      const ext = pattern.substring(1);
      if (fileName.endsWith(ext)) {
        return true;
      }
    }
  }
  
  return false;
}
