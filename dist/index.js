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
    .version('0.1.0');
program
    .command('learn <path>')
    .description('Scan a directory and learn its structure as a template')
    .action(async (pathArg) => {
    await (0, learn_js_1.learn)(pathArg);
});
program
    .command('update <template>')
    .description('Update an existing template from a directory')
    .action(async (templateName) => {
    await (0, learn_js_1.learn)('.', templateName);
});
program
    .command('init [type] [path]')
    .description('Initialize a new project from a learned template')
    .action(async (typeName, destPath) => {
    await (0, init_js_1.init)(typeName, destPath);
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
        }
    }
});
program.parse(process.argv);
