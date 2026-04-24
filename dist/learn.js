"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.learn = learn;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const config_js_1 = require("./config.js");
const chalk_1 = __importDefault(require("chalk"));
async function learn(sourcePath) {
    const resolvedPath = path.resolve(sourcePath);
    if (!fs.existsSync(resolvedPath)) {
        console.error(chalk_1.default.red(`Error: Path "${sourcePath}" does not exist.`));
        process.exit(1);
    }
    console.log(chalk_1.default.cyan(`\nScanning structure: ${resolvedPath}`));
    // 1. Extract structure
    const folders = extractStructure(resolvedPath, resolvedPath);
    if (folders.length === 0) {
        console.log(chalk_1.default.yellow("No folders found (excluding .git, node_modules, etc)."));
        return;
    }
    // 2. Get template name/type
    const config = (0, config_js_1.loadConfig)();
    const existingNames = (0, config_js_1.getTemplateNames)(config);
    const { newName } = await inquirer_1.default.prompt({
        type: 'input',
        name: 'newName',
        message: 'Name this template:',
        default: path.basename(resolvedPath)
    });
    const typeChoice = await inquirer_1.default.prompt({
        type: 'list',
        name: 'type',
        message: 'Select Project Type:',
        choices: [
            ...existingNames.map(n => ({ name: `Use existing: ${n}`, value: n })),
            { name: '(Create new type)', value: '__NEW__' }
        ]
    });
    let type = typeChoice.type;
    if (type === '__NEW__') {
        const { newTypeName } = await inquirer_1.default.prompt({
            type: 'input',
            name: 'newTypeName',
            message: 'New type name:'
        });
        type = newTypeName;
    }
    // 3. Update config
    const templateConfig = {
        name: newName,
        type: type,
        folders: folders
    };
    config.templates[newName] = templateConfig;
    (0, config_js_1.saveConfig)(config);
    console.log(chalk_1.default.green(`\n✓ Template "${newName}" learned and saved to ~/.pt/config.yaml`));
    console.log(chalk_1.default.gray(`  Type: ${type}`));
    console.log(chalk_1.default.gray(`  Folders: ${folders.length}`));
}
function extractStructure(dirPath, rootPath) {
    let nodes = [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        // Filter out noisy directories/files
        const ignoreList = ['.git', 'node_modules', 'dist', 'build', '.DS_Store'];
        for (const entry of entries) {
            if (ignoreList.includes(entry.name))
                continue;
            if (entry.name.startsWith('.'))
                continue; // Hidden files generally
            const fullPath = path.join(dirPath, entry.name);
            const relPath = path.relative(rootPath, fullPath);
            if (entry.isDirectory()) {
                // Recurse
                const children = extractStructure(fullPath, rootPath);
                let info = "";
                // Check for .gitkeep.md
                const gitkeepPath = path.join(fullPath, '.gitkeep.md');
                if (fs.existsSync(gitkeepPath)) {
                    info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
                }
                nodes.push({
                    name: entry.name,
                    info: info,
                    children: children
                });
            }
        }
    }
    catch (e) {
        // Skip permission errors
    }
    return nodes;
}
