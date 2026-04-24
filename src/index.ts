#!/usr/bin/env node
import { Command } from 'commander';
import { learn } from './learn.js';
import { init } from './init.js';
import chalk from 'chalk';

const program = new Command();

program
  .name('pt')
  .description('Project Template CLI - Learn and initialize project structures')
  .version('0.1.0');

program
  .command('learn <path>')
  .description('Scan a directory and learn its structure as a template')
  .action(async (pathArg) => {
    await learn(pathArg);
  });

program
  .command('init [type] [path]')
  .description('Initialize a new project from a learned template')
  .action(async (typeName, destPath) => {
    await init(typeName, destPath);
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
      }
    }
  });

program.parse(process.argv);
