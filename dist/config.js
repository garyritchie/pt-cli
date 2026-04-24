"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureConfigDir = ensureConfigDir;
exports.loadConfig = loadConfig;
exports.saveConfig = saveConfig;
exports.getTemplateNames = getTemplateNames;
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
