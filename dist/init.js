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
exports.init = init;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const inquirer_1 = __importDefault(require("inquirer"));
const config_js_1 = require("./config.js");
const chalk_1 = __importDefault(require("chalk"));
const substitute_js_1 = require("./substitute.js");
const postconfig_js_1 = require("./postconfig.js");
async function init(targetName, destPath, skipPostConfig = false) {
    const config = (0, config_js_1.loadConfig)();
    let typeName = targetName;
    // If no name provided, list templates
    if (!typeName) {
        const names = Object.keys(config.templates);
        if (names.length === 0) {
            console.log(chalk_1.default.red("No templates found. Run 'pt learn <path>' first."));
            return;
        }
        const { selected } = await inquirer_1.default.prompt({
            type: 'list',
            name: 'selected',
            message: 'Select Project Type:',
            choices: names.map(n => ({ name: n, value: n }))
        });
        typeName = selected;
    }
    const template = config.templates[typeName];
    if (!template) {
        console.error(chalk_1.default.red(`Template "${typeName}" not found.`));
        process.exit(1);
    }
    let dest = destPath;
    if (!dest) {
        const { name } = await inquirer_1.default.prompt({
            type: 'input',
            name: 'name',
            message: 'Project path/folder name:'
        });
        dest = name;
    }
    const resolvedDest = path.resolve(dest);
    if (fs.existsSync(resolvedDest)) {
        console.error(chalk_1.default.red(`Error: Destination "${resolvedDest}" already exists.`));
        process.exit(1);
    }
    console.log(chalk_1.default.cyan(`\nInitializing project "${template.name}" at: ${resolvedDest}`));
    // 1. Create structure
    createStructure(resolvedDest, template.folders);
    // 2. Process copy_files
    if (template.copy_files && template.templateRoot) {
        console.log(chalk_1.default.cyan("Processing copy_files..."));
        await (0, substitute_js_1.processCopyFiles)(template.templateRoot, resolvedDest, template, {});
    }
    // 3. Process post_copy (executable scripts)
    if (template.post_copy && template.templateRoot) {
        console.log(chalk_1.default.cyan("Processing post_copy..."));
        for (const file of template.post_copy) {
            const srcPath = path.join(template.templateRoot, file.src);
            const destPath = path.join(resolvedDest, file.dest || file.src);
            if (fs.existsSync(srcPath)) {
                const fileContent = fs.readFileSync(srcPath, 'utf-8');
                const destDir = path.dirname(destPath);
                fs.mkdirSync(destDir, { recursive: true });
                fs.writeFileSync(destPath, fileContent);
                // Auto-chmod for executables
                const ext = path.extname(file.src);
                if (['.sh', '.py', '.bash', '.bat'].includes(ext)) {
                    try {
                        fs.chmodSync(destPath, 0o755);
                    }
                    catch (e) {
                        // chmod not available (Windows)
                    }
                }
                console.log(chalk_1.default.green("  ✓ " + (file.dest || file.src)));
            }
            else {
                console.warn(chalk_1.default.yellow("  ! " + file.src + " not found, skipping"));
            }
        }
    }
    // 4. Run post-config tasks
    if (template.post_config) {
        await (0, postconfig_js_1.runPostConfig)(resolvedDest, template.post_config, template.type, skipPostConfig);
    }
    console.log(chalk_1.default.green(`\n✓ Project created successfully.`));
    console.log(chalk_1.default.gray(`  Run 'cd ${dest}' and 'git init' to get started.`));
}
function createStructure(dirPath, folders) {
    for (const folder of folders) {
        const fullDirPath = path.join(dirPath, folder.name);
        fs.mkdirSync(fullDirPath, { recursive: true });
        // Create .info.md if content exists
        if (folder.info) {
            const infoPath = path.join(fullDirPath, '.info.md');
            fs.writeFileSync(infoPath, folder.info);
        }
        // Recurse children
        if (folder.children && folder.children.length > 0) {
            createStructure(fullDirPath, folder.children);
        }
    }
}
