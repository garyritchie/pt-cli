import { loadConfig, saveConfig } from '../config.js';

export interface IgnoreOptions {
  set?: boolean;
}

export function ignoreCommand(patterns: string | undefined, options: IgnoreOptions = {}) {
  const config = loadConfig();
  
  if (options.set) {
    config.ignore = patterns ? patterns.split(',').map((s: string) => s.trim()).filter((s: string) => s !== '') : [];
    saveConfig(config);
    console.log('Ignore patterns updated:', config.ignore);
  } else {
    console.log('Current ignore patterns:', config.ignore || []);
  }
}
