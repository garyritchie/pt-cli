import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { PostConfigTask } from './config.js';
import {
  isBlockedCommand,
  isDangerousCommand,
  executeWithTimeout,
  logSecurityEvent,
  canExecute,
  showDangerousCommandWarning,
  getSecurityPolicy,
} from './safety.js';

export interface PostConfigOptions {
  skipPostConfig?: boolean;
  dryRun?: boolean;
  yes?: boolean;
}

/**
 * Runs post-configuration tasks for a project.
 */
export async function runPostConfig(
  destPath: string,
  tasks: PostConfigTask[],
  projectType: string,
  options: PostConfigOptions = {}
): Promise<void> {
  if (options.skipPostConfig) return;

  // Load security policy
  const configPath = path.join(process.env.HOME || os.homedir(), '.pt', 'config.yaml');
  const securityPolicy = getSecurityPolicy(configPath);

  // Check rate limiting
  if (!canExecute('init', securityPolicy.maxCommandsPerRun)) {
    console.log(chalk.yellow('⚠️  Rate limit reached: max commands per run exceeded'));
    return;
  }

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
      // SECURITY CHECK 1: Blocklist check (NEVER allow these)
      if (isBlockedCommand(task.command)) {
        console.log(chalk.red(`${progress} ⚠️  BLOCKED: ${task.command}`));
        logSecurityEvent('command_blocked', task.command, projectType, 'blocked');
        continue;
      }

      // SECURITY CHECK 2: Dangerous command warning (but allow execution)
      if (isDangerousCommand(task.command)) {
        console.log(chalk.yellow(`${progress} ⚠️  WARNING: This command may be dangerous: ${task.command}`));
        console.log(chalk.yellow(`   Press CTRL+C to cancel, or wait 5s to continue...`));
        
        // Wait for user to cancel or timeout
        const allowContinue = await showDangerousCommandWarning(task.command, 5);
        if (!allowContinue) {
          console.log(chalk.yellow(`${progress} ⊘ Command cancelled by user`));
          logSecurityEvent('command_blocked', task.command, projectType, 'blocked');
          continue;
        }
      }

      // SECURITY CHECK 3: Rate limiting
      if (!canExecute(task.command, securityPolicy.maxCommandsPerRun)) {
        console.log(chalk.red(`${progress} ⚠️  Rate limited: too many commands executed`));
        continue;
      }

      if (options.dryRun) {
        console.log(chalk.gray(`  [DRY RUN] Would run: ${task.command}`));
      } else {
        try {
          console.log(chalk.yellow(`\n${progress} Running: ${task.command}`));
          
          // SECURITY CHECK 4: Execution timeout
          const result = await executeWithTimeout(
            task.command,
            destPath,
            securityPolicy.maxExecutionTime
          );

          if (result.timedOut) {
            console.log(chalk.red(`  ✗ Command timed out after ${securityPolicy.maxExecutionTime / 1000}s`));
            logSecurityEvent('command_timed_out', task.command, projectType, 'timedout');
          } else if (result.success) {
            console.log(chalk.green('  ✓ Command completed successfully'));
            logSecurityEvent('command_executed', task.command, projectType, 'success');
          } else {
            console.log(chalk.red(`  ✗ Command failed: ${result.stderr}`));
            logSecurityEvent('command_executed', task.command, projectType, 'failed');
          }
        } catch (err) {
          console.log(chalk.red('  ✗ Command failed'));
          logSecurityEvent('command_executed', task.command, projectType, 'failed');
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
