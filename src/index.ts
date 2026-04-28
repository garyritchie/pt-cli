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
  .option('-y, --yes', 'Automatically confirm prompts')
  .option('--name <name>', 'Template name (skip prompt)')
  .option('--desc <description>', 'Template description (skip prompt)')
  .action(async (pathArg, options) => {
    await learn(pathArg, null, options);
  });

program
  .command('update <template> [path]')
  .description('Update an existing template from a directory')
  .option('--ignore <patterns>', 'Folder patterns to ignore (comma-separated, supports wildcards like DAILIES/*)')
  .option('-y, --yes', 'Automatically confirm prompts')
  .option('--desc <description>', 'Template description (skip prompt)')
  .action(async (templateName, sourcePath, options) => {
    await learn(sourcePath || '.', templateName, options);
  });

program
  .command('init [type] [path]')
  .description('Initialize a new project from a learned template')
  .option('--skip-post-config', 'Skip running post-config prompt')
  .option('--dry-run', 'Show what would be created without making changes')
  .option('-y, --yes', 'Automatically answer yes to prompts')
  .option('--vars <variables>', 'Comma-separated key=value variables (e.g. key1=val1,key2=val2)')
  .action(async (typeName, destPath, options) => {
    await init(typeName, destPath, options);
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
        if (!t) continue;
        console.log(chalk.white(`  - ${name}`), chalk.gray(`(${t.description})`));
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
    description: "My standard web project"
    post_config:
      - command: "git init"
        description: "Initialize git repository"
      - command: "npm install"
        description: "Install npm dependencies"
        type: "javascript"`));
  });

program
  .command('remove <template>')
  .alias('rm')
  .description('Remove a learned template from the config')
  .option('-y, --yes', 'Automatically confirm removal')
  .action(async (templateName, options) => {
    const { loadConfig, saveConfig } = require('./config.js');
    const config = loadConfig();
    const inquirer = (await import('inquirer')).default;
    
    if (!config.templates[templateName]) {
      console.error(chalk.red(`Template "${templateName}" not found.`));
      process.exit(1);
    }

    let confirmRemoval = options.yes;
    if (!confirmRemoval) {
      const response = await inquirer.prompt({
        type: 'confirm',
        name: 'confirmRemoval',
        message: `Are you sure you want to remove template "${templateName}"?`,
        default: false
      });
      confirmRemoval = response.confirmRemoval;
    }

    if (confirmRemoval) {
      delete config.templates[templateName];
      saveConfig(config);
      console.log(chalk.green(`✓ Template "${templateName}" removed.`));
    } else {
      console.log(chalk.gray('Removal cancelled.'));
    }
  });

program.parse(process.argv);
