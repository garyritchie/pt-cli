import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../config.js';

export interface AddOptions {
  file?: string;
}

export function addCommand(name: string, jsonStr: string | undefined, options: AddOptions = {}) {
  const config = loadConfig();
  try {
    let data;
    if (options.file) {
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
  } catch (e) {
    const error = e as Error;
    console.error(chalk.red(`Failed to parse template JSON: ${error.message}`));
    process.exit(1);
  }
}
