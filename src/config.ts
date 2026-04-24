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
}

export interface TemplateConfig {
  name: string;
  type: string;
  folders: FolderNode[];
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
