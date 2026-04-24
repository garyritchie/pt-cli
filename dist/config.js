"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_EXCLUDES = void 0;
exports.ensureConfigDir = ensureConfigDir;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.getTemplateNames = getTemplateNames;
exports.shouldExclude = shouldExclude;
exports.shouldExcludeFile = shouldExcludeFile;
const YAML = require('yaml');
const fs = require('fs');
const path = require('path');
const os = require('os');
const HOME_DIR = path.join(os.homedir(), '.pt');
const CONFIG_PATH = path.join(HOME_DIR, 'config.yaml');
function ensureConfigDir() {
    if (!fs.existsSync(HOME_DIR)) {
        fs.mkdirSync(HOME_DIR, { recursive: true });
    }
}
function loadConfig() {
    ensureConfigDir();
    if (!fs.existsSync(CONFIG_PATH)) {
        const defaultConfig = {
            version: '2.0',
            templates: {}
        };
        saveConfig(defaultConfig);
        return defaultConfig;
    }
    const content = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return YAML.parse(content);
}
function saveConfig(config) {
    ensureConfigDir();
    const content = YAML.stringify(config);
    fs.writeFileSync(CONFIG_PATH, content);
}
function getTemplateNames(config) {
    return Object.keys(config.templates || {});
}
// Default exclusions for template scanning
exports.DEFAULT_EXCLUDES = [
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
function shouldExclude(dirPath, fullPath, excludes) {
    const name = path.basename(dirPath);
    const allExcludes = [...exports.DEFAULT_EXCLUDES, ...(excludes || [])];
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
        }
        catch (e) {
            // Ignore errors reading gitmodules
        }
    }
    return allExcludes.includes(name);
}
// Check if a file should be excluded (e.g., .gitignore patterns)
function shouldExcludeFile(fileName) {
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
