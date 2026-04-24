#!/usr/bin/env node
import { Command } from 'commander';
import { learn } from './learn.js';
import { init } from './init.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('pt')
  .description('Project Template CLI - Learn and initialize project structures')
  .version(require('../package.json').version, '-v', 'output the version number');

program
  .command('learn <path>')
  .description('Scan a directory and learn its structure as a template')
  .option('--ignore <patterns>', 'Folder patterns to ignore (comma-separated, supports wildcards like DAILIES/*)')
  .action(async (pathArg, options) => {
    await learn(pathArg, null, options.ignore);
  });

program
  .command('update <template>')
  .description('Update an existing template from a directory')
  .option('--ignore <patterns>', 'Folder patterns to ignore (comma-separated, supports wildcards like DAILIES/*)')
  .action(async (templateName, options) => {
    await learn('.', templateName, options.ignore);
  });

program
  .command('init [type] [path]')
  .description('Initialize a new project from a learned template')
  .option('--skip-post-config', 'Skip running post-config tasks after project creation')
  .action(async (typeName, destPath, options) => {
    await init(typeName, destPath, options.skipPostConfig);
  });

program
  .command('config')
  .description('Show current config location and list templates')
  .action(() => {
    const { loadConfig, getTemplateNames } = require('./config.js');
    const config = loadConfig();
    const names = getTemplateNames(config);
    
    console.log(chalk.cyan('Config Location:'), require('os').homedir() + '/.pt/config.yaml');
    console.log(chalk.cyan('\nLearned Templates:'));
    if (names.length === 0) {
      console.log(chalk.gray('  (none)'));
    } else {
      for (const name of names) {
        const t = config.templates[name];
        console.log(chalk.white(`  - ${name}`), chalk.gray(`(${t.type})`));
        if (t.templateRoot) {
          console.log(chalk.gray(`      Source: ${t.templateRoot}`));
        }
        if (t.post_config && t.post_config.length > 0) {
          console.log(chalk.cyan('      Post-config:'));
          for (const task of t.post_config) {
            const cmd = task.command || task.script || '(unknown)';
            const typeFilter = task.type ? ` [type: ${task.type}]` : '';
            console.log(chalk.gray(`        - ${cmd}${typeFilter}`));
          }
        }
        if (t.post_copy && t.post_copy.length > 0) {
          console.log(chalk.cyan('      post_copy:'));
          for (const f of t.post_copy) {
            console.log(chalk.gray(`        - ${f.src} → ${(f.dest || f.src)}`));
          }
        }
      }
    }
    
    // Show global ignore patterns
    if (config.ignore && config.ignore.length > 0) {
      console.log(chalk.cyan('\nIgnore Patterns (pt learn):'));
      for (const p of config.ignore) {
        console.log(chalk.gray(`  - ${p}`));
      }
    }
    
    console.log(chalk.cyan('\nExample post-config in config.yaml:'));
    console.log(chalk.gray(`
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
