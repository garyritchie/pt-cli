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
async function init(targetName, destPath) {
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
    // Recursively create structure
    createStructure(resolvedDest, template.folders);
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
