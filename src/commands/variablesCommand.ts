import fs from 'fs';
import { loadConfig, saveConfig } from '../config.js';

export interface VariablesOptions {
  set?: boolean;
  json?: string;
  delete?: string;
}

export function variablesCommand(pairs: string | undefined, options: VariablesOptions = {}) {
  const config = loadConfig();
  
  if (options.delete) {
    if (config.variables) {
      const index = config.variables.findIndex((v) => v.name === options.delete);
      if (index !== -1) {
        config.variables.splice(index, 1);
        saveConfig(config);
        console.log(`Global variable "${options.delete}" removed.`);
      } else {
        console.log(`Global variable "${options.delete}" not found.`);
      }
    }
    return;
  }

  if (options.set) {
    if (options.json) {
      try {
        const data = options.json.startsWith('{') || options.json.startsWith('[') 
          ? JSON.parse(options.json) 
          : JSON.parse(fs.readFileSync(options.json, 'utf-8'));
        config.variables = Array.isArray(data) ? data : [];
        saveConfig(config);
        console.log('Global variables updated via JSON.');
      } catch (e) {
        const error = e as Error;
        console.error('Failed to parse JSON for variables:', error.message);
      }
      return;
    }

    if (!config.variables) config.variables = [];
    const parts = pairs ? pairs.split(',') : [];
    for (const part of parts) {
      const [k, ...v] = part.split('=');
      if (k) {
        const name = k.trim();
        const val = v.join('=').trim();
        const existing = config.variables.find((x) => x.name === name);
        if (existing) {
          existing.default = val;
        } else {
          config.variables.push({
            name,
            prompt: `Enter ${name}:`,
            default: val
          });
        }
      }
    }
    saveConfig(config);
    console.log('Global variables updated.');
  } else {
    console.log('Current global variables:', config.variables || []);
  }
}
