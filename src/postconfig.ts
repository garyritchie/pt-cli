import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { PostConfigTask } from './config.js';

/**
 * Runs post-configuration tasks for a project.
 */
export async function runPostConfig(
  destPath: string,
  tasks: PostConfigTask[],
  projectType: string,
  skipPostConfig: boolean = false
): Promise<void> {
  if (skipPostConfig) return;

  // 1. Filter tasks by type
  const applicableTasks = tasks.filter(t => !t.type || t.type === projectType);

  if (applicableTasks.length === 0) {
    return;
  }

  // 2. Ask user
  const { run } = await inquirer.prompt({
    type: 'confirm',
    name: 'run',
    message: 'Run post-config tasks?',
    default: false
  });

  if (!run) return;

  // 3. Show and run each task
  for (let i = 0; i < applicableTasks.length; i++) {
    const task = applicableTasks[i];
    const progress = `[${i + 1}/${applicableTasks.length}]`;

    if (task.command) {
      const isWindows = process.platform === 'win32';
      const shell = isWindows ? 'cmd' : 'sh';
      const flag = isWindows ? '/c' : '-c';

      try {
        process.stdout.write(`${progress} ${task.command} `);
        execSync(`${shell} ${flag} "${task.command}"`, {
          cwd: destPath,
          stdio: 'inherit'
        });
        console.log(chalk.green('✓'));
      } catch (err) {
        console.log(chalk.red('✗'));
      }
    }

    if (task.script) {
      // For now, we'll assume scripts are executable or run with node/python
      // In a real implementation, we'd detect the extension
      try {
        process.stdout.write(`${progress} ${task.script} `);
        // Logic to run script would go here
        console.log(chalk.yellow('(not yet implemented)'));
      } catch (err) {
        console.log(chalk.red('✗'));
      }
    }
  }
}
