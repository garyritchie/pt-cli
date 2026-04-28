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
  options: any = {}
): Promise<void> {
  if (options.skipPostConfig) return;

  // 1. Filter tasks by type
  const applicableTasks = tasks.filter(t => !t.type || t.type === projectType);

  if (applicableTasks.length === 0) {
    return;
  }

  // 2. Ask user (skip in dryRun or yes mode)
  let run = false;
  if (options.dryRun) {
    console.log(chalk.yellow(`\n[DRY RUN] Applicable post-config tasks:`));
    run = true;
  } else if (options.yes) {
    run = true;
  } else {
    const response = await inquirer.prompt({
      type: 'confirm',
      name: 'run',
      message: 'Run post-config tasks?',
      default: false
    });
    run = response.run;
  }

  if (!run) return;

  // 3. Show and run each task
  for (let i = 0; i < applicableTasks.length; i++) {
    const task = applicableTasks[i];
    const progress = `[${i + 1}/${applicableTasks.length}]`;

    if (task.command) {
      if (options.dryRun) {
        console.log(chalk.gray(`  [DRY RUN] Would run: ${task.command}`));
      } else {
        try {
          console.log(chalk.yellow(`\n${progress} Running: ${task.command}`));
          execSync(task.command, {
            cwd: destPath,
            stdio: 'inherit'
          });
          console.log(chalk.green('  ✓ Command completed successfully'));
        } catch (err) {
          console.log(chalk.red('  ✗ Command failed'));
        }
      }
    }

    if (task.script) {
      if (options.dryRun) {
        console.log(chalk.gray(`  [DRY RUN] Would run script: ${task.script}`));
      } else {
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
}
