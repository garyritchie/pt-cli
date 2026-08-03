import fs from 'fs';
import { loadConfig, saveConfig, PostConfigTask } from '../config.js';

export interface DefaultPostConfigOptions {
  set?: boolean;
  json?: string;
}

function coercePostConfigTasks(data: unknown): PostConfigTask[] {
  if (!Array.isArray(data)) return [];
  return data.map(item => {
    if (typeof item !== 'object' || item === null) return { description: '', command: '' };
    const obj = item as Record<string, unknown>;
    const task: PostConfigTask = {
      description: typeof obj.description === 'string' ? obj.description : '',
      command: typeof obj.command === 'string' ? obj.command : undefined,
      type: typeof obj.type === 'string' ? obj.type : undefined,
      script: typeof obj.script === 'string' ? obj.script : undefined,
      always_prompt: typeof obj.always_prompt === 'boolean' ? obj.always_prompt : undefined,
      cross_platform: typeof obj.cross_platform === 'boolean' ? obj.cross_platform : undefined,
    };
    // Coerce checked: accept boolean, "true"/"false" strings, or omit (defaults to true in getDefaultPostConfig)
    if (typeof obj.checked === 'boolean') {
      task.checked = obj.checked;
    } else if (typeof obj.checked === 'string') {
      task.checked = obj.checked.toLowerCase() === 'true';
    }
    return task;
  });
}

export function defaultPostConfigCommand(options: DefaultPostConfigOptions = {}) {
  const config = loadConfig();
  
  if (options.set) {
    if (options.json) {
      try {
        const rawData = options.json.startsWith('{') || options.json.startsWith('[') 
          ? JSON.parse(options.json) 
          : JSON.parse(fs.readFileSync(options.json, 'utf-8'));
        config.default_post_config = coercePostConfigTasks(rawData);
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
    const tasks = config.default_post_config || [];
    console.log(JSON.stringify(tasks, null, 2));
  }
}
