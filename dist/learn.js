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
exports.detectExecutables = detectExecutables;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const config_js_1 = require("./config.js");
const chalk_1 = __importDefault(require("chalk"));
async function learn(sourcePath, updateTemplate = null) {
    const resolvedPath = path.resolve(sourcePath);
    if (!fs.existsSync(resolvedPath)) {
        console.error(chalk_1.default.red(`Error: Path "${sourcePath}" does not exist.`));
        process.exit(1);
    }
    const isUpdate = !!updateTemplate;
    const config = (0, config_js_1.loadConfig)();
    const existingNames = (0, config_js_1.getTemplateNames)(config);
    let targetName = updateTemplate || '';
    if (isUpdate) {
        if (!targetName || !config.templates[targetName]) {
            console.error(chalk_1.default.red(`Template "${targetName}" not found.`));
            process.exit(1);
        }
    }
    else {
        const { newName } = await inquirer_1.default.prompt({
            type: 'input',
            name: 'newName',
            message: 'Name this template:',
            default: path.basename(resolvedPath)
        });
        targetName = newName;
    }
    let type = '';
    if (isUpdate) {
        const currentType = config.templates[updateTemplate].type;
        const { keepType } = await inquirer_1.default.prompt({
            type: 'confirm',
            name: 'keepType',
            message: `Keep current type "${currentType}"?`,
            default: true
        });
        if (keepType) {
            type = currentType;
        }
        else {
            const typeChoice = await inquirer_1.default.prompt({
                type: 'list',
                name: 'type',
                message: 'Select Project Type:',
                choices: [
                    ...existingNames.map(n => ({ name: `Use existing: ${n}`, value: n })),
                    { name: '(Create new type)', value: '__NEW__' }
                ]
            });
            type = typeChoice.type;
            if (type === '__NEW__') {
                const { newTypeName } = await inquirer_1.default.prompt({
                    type: 'input',
                    name: 'newTypeName',
                    message: 'New type name:'
                });
                type = newTypeName;
            }
        }
    }
    else {
        const typeChoice = await inquirer_1.default.prompt({
            type: 'list',
            name: 'type',
            message: 'Select Project Type:',
            choices: [
                ...existingNames.map(n => ({ name: `Use existing: ${n}`, value: n })),
                { name: '(Create new type)', value: '__NEW__' }
            ]
        });
        type = typeChoice.type;
        if (type === '__NEW__') {
            const { newTypeName } = await inquirer_1.default.prompt({
                type: 'input',
                name: 'newTypeName',
                message: 'New type name:'
            });
            type = newTypeName;
        }
    }
    const { hasVariables } = await inquirer_1.default.prompt({
        type: 'confirm',
        name: 'hasVariables',
        message: 'Define template variables (e.g., client_name, project_type)?',
        default: false
    });
    let variables = [];
    if (hasVariables) {
        const { variableDefs } = await inquirer_1.default.prompt({
            type: 'input',
            name: 'variableDefs',
            message: 'Define variables as comma-separated names (e.g., client_name,project_type):',
            default: 'client_name,project_name'
        });
        variables = variableDefs.split(',').map((v) => ({
            name: v.trim(),
            prompt: `Enter ${v.trim()}:`,
            required: true
        }));
    }
    const folders = extractStructure(resolvedPath, resolvedPath);
    if (folders.length === 0) {
        console.log(chalk_1.default.yellow("No folders found (excluding .git, node_modules, etc)."));
        return;
    }
    const templateConfig = {
        name: path.basename(resolvedPath),
        type: type,
        templateRoot: resolvedPath, // absolute path to source directory
        folders: folders,
        variables: variables.length > 0 ? variables : undefined
    };
    // Auto-detect executable files at project root
    const detectedExecutables = detectExecutables(resolvedPath);
    let post_copy;
    if (detectedExecutables.length > 0) {
        console.log(chalk_1.default.cyan("\nAuto-detected " + detectedExecutables.length + " executable file(s) at project root:"));
        for (const file of detectedExecutables) {
            // find description
            let desc = '';
            const patterns = [
                { name: '*.sh', desc: 'shell script' },
                { name: '*.py', desc: 'Python script' },
                { name: '*.bat', desc: 'batch file' },
                { name: '*.cmd', desc: 'batch file' },
                { name: 'Makefile', desc: 'makefile' },
                { name: '*.mk', desc: 'makefile include' },
            ];
            for (const pat of patterns) {
                if (pat.name === 'Makefile') {
                    if (file === 'Makefile')
                        desc = pat.desc;
                }
                else if (pat.name === '*.mk') {
                    if (file.endsWith('.mk'))
                        desc = pat.desc;
                }
                else {
                    if (path.extname(file) === pat.name.substring(1))
                        desc = pat.desc;
                }
                if (desc)
                    break;
            }
            console.log(chalk_1.default.gray("  - " + file + " (" + desc + ")"));
        }
        const { addPostCopy } = await inquirer_1.default.prompt({
            type: 'confirm',
            name: 'addPostCopy',
            message: 'Add these to post_copy (copied during pt init)?',
            default: true
        });
        if (addPostCopy) {
            post_copy = detectedExecutables.map(f => ({ src: f, dest: f }));
        }
    }
    if (post_copy) {
        templateConfig.post_copy = post_copy;
    }
    config.templates[targetName] = templateConfig;
    (0, config_js_1.saveConfig)(config);
    console.log(chalk_1.default.green(`\n${isUpdate ? '✓ Template updated' : '✓ Template learned'} "${targetName}" and saved to ~/.pt/config.yaml`));
    console.log(chalk_1.default.gray(`  Type: ${type}`));
    console.log(chalk_1.default.gray(`  Folders: ${folders.length}`));
    if (variables.length > 0) {
        console.log(chalk_1.default.gray(`  Variables: ${variables.map(v => v.name).join(', ')}`));
    }
}
/**
 * Scan the root of the template directory for executable/script files.
 * Returns filenames relative to the project root.
 */
function detectExecutables(sourcePath) {
    const executablePatterns = [
        { name: '*.sh', desc: 'shell script' },
        { name: '*.py', desc: 'Python script' },
        { name: '*.bat', desc: 'batch file' },
        { name: '*.cmd', desc: 'batch file' },
        { name: 'Makefile', desc: 'makefile' },
        { name: '*.mk', desc: 'makefile include' },
    ];
    let detected = [];
    try {
        const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isFile())
                continue;
            const fullPath = path.join(sourcePath, entry.name);
            for (const pat of executablePatterns) {
                if (pat.name === 'Makefile') {
                    if (entry.name === 'Makefile') {
                        detected.push(entry.name);
                        break;
                    }
                }
                else if (pat.name === '*.mk') {
                    if (entry.name.endsWith('.mk')) {
                        detected.push(entry.name);
                        break;
                    }
                }
                else {
                    const ext = path.extname(entry.name);
                    const expectedExt = pat.name.substring(1); // remove '*'
                    if (ext === expectedExt) {
                        detected.push(entry.name);
                        break;
                    }
                }
            }
        }
    }
    catch (e) {
        // Skip permission errors
    }
    return detected;
}
function extractStructure(dirPath, rootPath) {
    let nodes = [];
    try {
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry.name);
            // Use shouldExclude from config instead of hardcoded list
            if ((0, config_js_1.shouldExclude)(dirPath, fullPath)) {
                continue;
            }
            if (entry.isDirectory()) {
                const children = extractStructure(fullPath, rootPath);
                let info = "";
                const gitkeepPath = path.join(fullPath, '.gitkeep.md');
                const infoPath = path.join(fullPath, '.info.md');
                if (fs.existsSync(gitkeepPath)) {
                    info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
                }
                else if (fs.existsSync(infoPath)) {
                    info = fs.readFileSync(infoPath, 'utf-8').trim();
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
