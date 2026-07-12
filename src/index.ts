#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Command imports
import { learn } from './commands/learnCommand.js';
import { update } from './commands/updateCommand.js';
import { init } from './commands/initCommand.js';
import { configCommand } from './commands/configCommand.js';
import { ignoreCommand } from './commands/ignoreCommand.js';
import { variablesCommand } from './commands/variablesCommand.js';
import { addCommand } from './commands/addCommand.js';
import { removeCommand } from './commands/removeCommand.js';
import { defaultPostConfigCommand } from './commands/defaultPostConfigCommand.js';
import { securityResponseCommand } from './commands/securityResponseCommand.js';

import pkg from '../package.json' with { type: 'json' };

const program = new Command();

program
  .name('pt')
  .description('Project Template CLI - Learn project structures and initialize new ones')
  .version(pkg.version, '-v', 'output the version number');

program
  .command('learn [path]')
  .description('Learn a project structure from an existing directory')
  .option('--ignore <patterns>', 'Folder patterns to ignore (comma-separated)')
  .option('-y, --yes', 'Automatically confirm prompts')
  .option('--name <name>', 'Template name (skip prompt)')
  .option('--desc <description>', 'Template description (skip prompt)')
  .option('--json', 'Output template structure as JSON for sharing instead of saving')
  .option('--allow-untrusted', 'Bypass the trusted-source check for remote URLs (set by GUI after user confirmation)')
  .action(async (pathArg: string | undefined, options) => {
    try {
      await learn(pathArg || '.', null, options);
    } catch (err: any) {
      if (options.json) {
        // Fix: Ensure the error JSON payload isn't truncated before exiting
        process.stdout.write(JSON.stringify({
          type: 'error',
          message: err.message || String(err)
        }) + '\n', () => {
          process.exit(1);
        });
      } else {
        console.error(chalk.red(`Error: ${err.message || err}`));
        process.exit(1);
      }
    }
  });

program
  .command('update <templateName> [sourcePath]')
  .description('Update an existing template with new structure/files')
  .option('--ignore <patterns>', 'Folder patterns to ignore (comma-separated)')
  .option('-y, --yes', 'Automatically confirm prompts')
  .option('--desc <description>', 'Template description (skip prompt)')
  .option('--no-diff', 'Disable additive mode, show full list')
  .action(async (templateName: string, sourcePath: string | undefined, options) => {
    try {
      await update(sourcePath || '.', templateName, options);
    } catch (err: any) {
      console.error(chalk.red(`Error: ${err.message || err}`));
      process.exit(1);
    }
  });

program
  .command('init [templateName] [destPath]')
  .description('Initialize a new project from a learned template')
  .option('-f, --file <jsonPath>', 'Initialize directly from a JSON template file without adding it to local config')
  .option('--skip-post-config', 'Skip running post-config tasks')
  .option('--dry-run', 'Show what would be created without making changes')
  .option('-y, --yes', 'Automatically answer yes to prompts')
  .option('--vars <variables>', 'Comma-separated key=value variables (e.g. key1=val1,key2=val2)')
  .action(async (typeName: string | undefined, destPath: string | undefined, options) => {
    await init(typeName, destPath, options);
  });

program
  .command('config [templateName]')
  .description('Show current config location and list templates, or export a specific template')
  .option('--json', 'Output config or specific template as JSON')
  .action(configCommand);

program
  .command('ignore [patterns]')
  .description('View or set global ignore patterns (comma-separated)')
  .option('--set', 'Set the ignore patterns to the provided value')
  .action(ignoreCommand);

program
  .command('variables [pairs]')
  .description('View or set global variables (comma-separated key=value)')
  .option('--set', 'Set the variables to the provided pairs')
  .option('--json <data>', 'Set variables via JSON string or file')
  .option('--delete <key>', 'Delete a specific global variable')
  .action(variablesCommand);

program
  .command('default-post-config')
  .description('View or set default post-config tasks')
  .option('--set', 'Set the default post-config tasks via JSON')
  .option('--json <data>', 'JSON string or file containing tasks array')
  .action(defaultPostConfigCommand);

program
  .command('add <name> [json]')
  .description('Import/add a template from a JSON string or file')
  .option('-f, --file <path>', 'Path to JSON file containing template data')
  .action(addCommand);

program
  .command('remove <template>')
  .alias('rm')
  .description('Remove a learned template from the config')
  .option('-y, --yes', 'Automatically confirm removal')
  .action(removeCommand);

program
  .command('security-response <response>')
  .description('Handle security response from GUI')
  .action(async (response: string) => {
    await securityResponseCommand(response);
  });

program.parse(process.argv);
