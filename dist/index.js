#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const learn_js_1 = require("./learn.js");
const init_js_1 = require("./init.js");
const chalk_1 = __importDefault(require("chalk"));
const program = new commander_1.Command();
program
    .name('pt')
    .description('Project Template CLI - Learn and initialize project structures')
    .version(require('../package.json').version, '-v', 'output the version number');
program
    .command('learn <path>')
    .description('Scan a directory and learn its structure as a template')
    .option('--ignore <patterns>', 'Folder patterns to ignore (comma-separated, supports wildcards like DAILIES/*)')
    .action(async (pathArg, options) => {
    await (0, learn_js_1.learn)(pathArg, null, options.ignore);
});
program
    .command('update <template>')
    .description('Update an existing template from a directory')
    .option('--ignore <patterns>', 'Folder patterns to ignore (comma-separated, supports wildcards like DAILIES/*)')
    .action(async (templateName, options) => {
    await (0, learn_js_1.learn)('.', templateName, options.ignore);
});
program
    .command('init [type] [path]')
    .description('Initialize a new project from a learned template')
    .option('--skip-post-config', 'Skip running post-config tasks after project creation')
    .action(async (typeName, destPath, options) => {
    await (0, init_js_1.init)(typeName, destPath, options.skipPostConfig);
});
program
    .command('config')
    .description('Show current config location and list templates')
    .action(() => {
    const { loadConfig, getTemplateNames } = require('./config.js');
    const config = loadConfig();
    const names = getTemplateNames(config);
    console.log(chalk_1.default.cyan('Config Location:'), require('os').homedir() + '/.pt/config.yaml');
    console.log(chalk_1.default.cyan('\nLearned Templates:'));
    if (names.length === 0) {
        console.log(chalk_1.default.gray('  (none)'));
    }
    else {
        for (const name of names) {
            const t = config.templates[name];
            console.log(chalk_1.default.white(`  - ${name}`), chalk_1.default.gray(`(${t.type})`));
            if (t.templateRoot) {
                console.log(chalk_1.default.gray(`      Source: ${t.templateRoot}`));
            }
            if (t.post_config && t.post_config.length > 0) {
                console.log(chalk_1.default.cyan('      Post-config:'));
                for (const task of t.post_config) {
                    const cmd = task.command || task.script || '(unknown)';
                    const typeFilter = task.type ? ` [type: ${task.type}]` : '';
                    console.log(chalk_1.default.gray(`        - ${cmd}${typeFilter}`));
                }
            }
            if (t.post_copy && t.post_copy.length > 0) {
                console.log(chalk_1.default.cyan('      post_copy:'));
                for (const f of t.post_copy) {
                    console.log(chalk_1.default.gray(`        - ${f.src} → ${(f.dest || f.src)}`));
                }
            }
        }
    }
    // Show global ignore patterns
    if (config.ignore && config.ignore.length > 0) {
        console.log(chalk_1.default.cyan('\nIgnore Patterns (pt learn):'));
        for (const p of config.ignore) {
            console.log(chalk_1.default.gray(`  - ${p}`));
        }
    }
    console.log(chalk_1.default.cyan('\nExample post-config in config.yaml:'));
    console.log(chalk_1.default.gray(`
  my_template:
    type: javascript
    post_config:
      - command: "git init"
        description: "Initialize git repository"
      - command: "npm install"
        description: "Install npm dependencies"
        type: "javascript"`));
});
program.parse(process.argv);
