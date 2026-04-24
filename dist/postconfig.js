"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPostConfig = runPostConfig;
const child_process_1 = require("child_process");
const chalk_1 = __importDefault(require("chalk"));
const inquirer_1 = __importDefault(require("inquirer"));
/**
 * Runs post-configuration tasks for a project.
 */
async function runPostConfig(destPath, tasks, projectType, skipPostConfig = false) {
    if (skipPostConfig)
        return;
    // 1. Filter tasks by type
    const applicableTasks = tasks.filter(t => !t.type || t.type === projectType);
    if (applicableTasks.length === 0) {
        return;
    }
    // 2. Ask user
    const { run } = await inquirer_1.default.prompt({
        type: 'confirm',
        name: 'run',
        message: 'Run post-config tasks?',
        default: false
    });
    if (!run)
        return;
    // 3. Show and run each task
    for (let i = 0; i < applicableTasks.length; i++) {
        const task = applicableTasks[i];
        const progress = `[${i + 1}/${applicableTasks.length}]`;
        if (task.command) {
            const isWindows = process.platform === 'win32';
            const shell = isWindows ? 'cmd' : 'sh';
            const flag = isWindows ? '/c' : '-c';
            try {
                process.stdout.write(`${progress} ${task.command} `);
                (0, child_process_1.execSync)(`${shell} ${flag} "${task.command}"`, {
                    cwd: destPath,
                    stdio: 'inherit'
                });
                console.log(chalk_1.default.green('✓'));
            }
            catch (err) {
                console.log(chalk_1.default.red('✗'));
            }
        }
        if (task.script) {
            // For now, we'll assume scripts are executable or run with node/python
            // In a real implementation, we'd detect the extension
            try {
                process.stdout.write(`${progress} ${task.script} `);
                // Logic to run script would go here
                console.log(chalk_1.default.yellow('(not yet implemented)'));
            }
            catch (err) {
                console.log(chalk_1.default.red('✗'));
            }
        }
    }
}
