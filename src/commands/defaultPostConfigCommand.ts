import fs from 'fs';
import { loadConfig, saveConfig, PostConfigTask } from '../config.js';

export interface DefaultPostConfigOptions {
  set?: boolean;
  json?: string;
}

export function defaultPostConfigCommand(options: DefaultPostConfigOptions = {}) {
  const config = loadConfig();
  
  if (options.set) {
    if (options.json) {
      try {
        const data = options.json.startsWith('{') || options.json.startsWith('[') 
          ? JSON.parse(options.json) 
          : JSON.parse(fs.readFileSync(options.json, 'utf-8'));
        config.default_post_config = Array.isArray(data) ? data : [];
        saveConfig(config);
        console.log('Default post-config updated via JSON.');
      } catch (e) {
        const error = e as Error;
        console.error('Failed to parse JSON for default post-config:', error.message);
      }
      return;
    }

    console.error('You must provide --json <data> to set the default post-config array.');
  } else {
    console.log('Current default post-config tasks:', config.default_post_config || []);
  }
}
