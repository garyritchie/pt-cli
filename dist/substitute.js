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
exports.substituteVariables = substituteVariables;
exports.processCopyFiles = processCopyFiles;
const chalk_1 = __importDefault(require("chalk"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Replaces all {{var}} patterns in the content with values from the variables object.
 */
function substituteVariables(content, variables) {
    return content.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
        return variables[varName] ?? `{{${varName}}}`;
    });
}
/**
 * Processes copy_files tasks from a template.
 */
async function processCopyFiles(templateRoot, resolvedDest, template, variables) {
    if (!template.copy_files)
        return;
    for (const copyFile of template.copy_files) {
        const srcPath = path.join(templateRoot, copyFile.src);
        const destPath = path.join(resolvedDest, copyFile.dest);
        if (!fs.existsSync(srcPath)) {
            console.warn(chalk_1.default.yellow(`Warning: ${copyFile.src} not found in template`));
            continue;
        }
        // Ensure destination directory exists
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        let content = fs.readFileSync(srcPath, 'utf-8');
        if (copyFile.substitute_variables) {
            content = substituteVariables(content, variables);
        }
        fs.writeFileSync(destPath, content);
        if (copyFile.chmod) {
            try {
                fs.chmodSync(destPath, parseInt(copyFile.chmod, 8));
            }
            catch (e) {
                if (process.platform !== 'win32') {
                    console.error(chalk_1.default.red(`Failed to set chmod ${copyFile.chmod} on ${copyFile.dest}`));
                }
            }
        }
        console.log(chalk_1.default.green(`  ✓ ${copyFile.dest}`));
    }
}
