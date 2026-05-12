import chalk from 'chalk';
import inquirer from 'inquirer';
import { loadConfig, saveConfig } from '../config.js';

export interface RemoveOptions {
  yes?: boolean;
}

export async function removeCommand(templateName: string, options: RemoveOptions = {}) {
  const config = loadConfig();
  
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
}
