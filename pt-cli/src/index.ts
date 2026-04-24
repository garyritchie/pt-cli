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
  .action(async (pathArg) => {
    await learn(pathArg);
  });

program
  .command('update <template>')
  .description('Update an existing template from a directory')
  .action(async (templateName) => {
    await learn('.', templateName);
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
          console.log(chalk.cyan(`      Post-config:`));
          for (const task of t.post_config) {
            const cmd = task.command || task.script || '(unknown)';
            const typeFilter = task.type ? ` [type: ${task.type}]` : '';
            console.log(chalk.gray(`        - ${cmd}${typeFilter}`));
          }
        }
      }
    }
    
    // Show example post-config block
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
