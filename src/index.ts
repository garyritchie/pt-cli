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
  .option('--json', 'Output template structure as JSON instead of saving')
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
  .option('--json', 'Output config as JSON')
  .action((options) => {
    const { loadConfig, getTemplateNames, CONFIG_PATH } = require('./config.js');
    const config = loadConfig();
    
    if (options.json) {
      console.log(JSON.stringify(config, null, 2));
      return;
    }
    
    const names = getTemplateNames(config);
    
    console.log(chalk.cyan('Config Location:'), CONFIG_PATH);
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
    
    // Show global post-config tasks
    if (config.global_post_config && config.global_post_config.length > 0) {
    console.log(chalk.cyan('\nGlobal Post-Config Tasks:'));
      for (const task of config.global_post_config) {
        const cmd = task.command || task.script || '(unknown)';
        const desc = task.description ? ` — ${task.description}` : '';
        const checked = task.checked !== false ? '[default: on]' : '[default: off]';
        const typeFilter = task.type ? ` [type: ${task.type}]` : '';
        console.log(chalk.gray(`  - ${cmd}${desc}`));
        console.log(chalk.gray(`    ${checked}${typeFilter}`));
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
  .command('ignore [patterns]')
  .description('View or set global ignore patterns (comma-separated)')
  .option('--set', 'Set the ignore patterns to the provided value')
  .action((patterns, options) => {
    const { loadConfig, saveConfig } = require('./config.js');
    const config = loadConfig();
    
    if (options.set) {
      config.ignore = patterns ? patterns.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '') : [];
      saveConfig(config);
      console.log('Ignore patterns updated:', config.ignore);
    } else {
      console.log('Current ignore patterns:', config.ignore || []);
    }
  });

program
  .command('add <name> [json]')
  .description('Add or update a template from JSON string or file')
  .option('-f, --file <path>', 'Path to JSON file containing template data')
  .action((name, jsonStr, options) => {
    const { loadConfig, saveConfig } = require('./config.js');
    const config = loadConfig();
    try {
      let data;
      if (options.file) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.resolve(options.file);
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      } else if (jsonStr) {
        data = JSON.parse(jsonStr);
      } else {
        console.error('Error: Either a JSON string or --file <path> must be provided.');
        process.exit(1);
      }
      
      if (!config.templates) config.templates = {};
      
      // Basic validation: ensure we aren't accidentally adding a full config object
      if (data && data.templates && typeof data.templates === 'object') {
        console.error(chalk.red('Error: The provided JSON appears to be a full configuration file, not a single template.'));
        console.error(chalk.gray('If you want to import a specific template from it, extract that template object first.'));
        process.exit(1);
      }

      config.templates[name] = data;
      saveConfig(config);
      console.log(chalk.green(`✓ Template "${name}" saved successfully.`));
    } catch (e: any) {
      console.error(chalk.red(`Failed to parse template JSON: ${e.message}`));
      process.exit(1);
    }
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
