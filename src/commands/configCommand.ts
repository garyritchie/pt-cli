import chalk from 'chalk';
import { loadConfig, getTemplateNames, CONFIG_PATH } from '../config.js';

export interface ConfigOptions {
  json?: boolean;
}

export function configCommand(templateName: string | undefined, options: ConfigOptions = {}) {
  const config = loadConfig();
  
  if (options.json) {
    if (templateName) {
      if (config.templates && config.templates[templateName]) {
        const output = {
          name: templateName,
          ...config.templates[templateName]
        };
        console.log(JSON.stringify(output, null, 2));
      } else {
        console.error(chalk.red(`Error: Template "${templateName}" not found.`));
        process.exit(1);
      }
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
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
  
  // Show default post-config tasks
  if (config.default_post_config && config.default_post_config.length > 0) {
  console.log(chalk.cyan('\nDefault Post-Config Tasks:'));
    for (const task of config.default_post_config) {
      const cmd = task.command || task.script || '(unknown)';
      const desc = task.description ? ` — ${task.description}` : '';
      const checked = task.checked !== false ? '[default: on]' : '[default: off]';
      const typeFilter = task.type ? ` [type: ${task.type}]` : '';
      console.log(chalk.gray(`  - ${cmd}${desc}`));
      console.log(chalk.gray(`    ${checked}${typeFilter}`));
    }
  }
  
  // Show global variables
  if (config.variables && config.variables.length > 0) {
    console.log(chalk.cyan('\nGlobal Variables:'));
    for (const v of config.variables) {
      console.log(chalk.white(`  - ${v.name}:`), chalk.gray(v.default || '(no default)'));
      if (v.prompt) console.log(chalk.gray(`    Prompt: ${v.prompt}`));
      if (v.required) console.log(chalk.yellow(`    [Required]`));
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
        type: "javascript"
`));
}
