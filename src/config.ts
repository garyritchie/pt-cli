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

export interface TemplateConfig {
  name: string;
  type: string;
  variables?: TemplateVariable[];
  folders: FolderNode[];
  exclude?: string[];
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
  return YAML.parse(content);
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
  const name = path.basename(dirPath);
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
