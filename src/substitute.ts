import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateConfig, PostConfigTask, CopyFileEntry } from './config';
import { loadConfig, sanitizePath } from './config';

/**
 * Replaces all {{var}} patterns in the content with values from the variables object.
 */
export function substituteVariables(
  content: string,
  variables: Record<string, string>
): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
    return variables[varName] ?? `{{${varName}}}`;
  });
}

/**
 * Processes copy_files tasks from a template.
 */
export async function processCopyFiles(
  templateRoot: string,
  resolvedDest: string,
  template: TemplateConfig,
  variables: Record<string, string>,
  dryRun: boolean = false
): Promise<void> {
  if (!template.copy_files) return;

  for (const copyFile of template.copy_files) {
    const srcPath = path.join(templateRoot, copyFile.src);
    const destPath = path.join(resolvedDest, sanitizePath(copyFile.dest));

    if (!fs.existsSync(srcPath)) {
      console.warn(chalk.yellow(`Warning: ${copyFile.src} not found in template`));
      continue;
    }

    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      // Recursive directory copy
      if (dryRun) {
        console.log(chalk.gray(`  [DRY RUN] Would recursively copy directory ${copyFile.src} → ${copyFile.dest}`));
      } else {
        copyDirRecursive(srcPath, destPath, variables, copyFile.substitute_variables || false, copyFile.chmod);
      }
      console.log(chalk.green(`  ✓ ${copyFile.dest} (recursive)`));
    } else {
      // Single file copy
      if (dryRun) {
        console.log(chalk.gray(`  [DRY RUN] Would copy ${copyFile.src} → ${copyFile.dest}`));
        if (copyFile.substitute_variables) {
          console.log(chalk.gray(`  [DRY RUN] Would substitute variables in ${copyFile.dest}`));
        }
        if (copyFile.chmod) {
          console.log(chalk.gray(`  [DRY RUN] Would chmod ${copyFile.chmod} ${copyFile.dest}`));
        }
        continue;
      }

      // Ensure destination directory exists
      fs.mkdirSync(path.dirname(destPath), { recursive: true });

      let content = fs.readFileSync(srcPath, 'utf-8');
      if (copyFile.substitute_variables) {
        content = substituteVariables(content, variables);
      }

      fs.writeFileSync(destPath, content);

      if (copyFile.chmod) {
        try {
          fs.chmodSync(destPath, parseInt(copyFile.chmod, 8));
        } catch (e) {
          if (process.platform !== 'win32') {
            console.error(chalk.red(`Failed to set chmod ${copyFile.chmod} on ${copyFile.dest}`));
          }
        }
      }

      console.log(chalk.green(`  ✓ ${copyFile.dest}`));
    }
  }
}

function copyDirRecursive(
  src: string,
  dest: string,
  variables: Record<string, string>,
  substitute: boolean,
  chmod?: string
) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath, variables, substitute, chmod);
    } else {
      let content = fs.readFileSync(srcPath, 'utf-8');
      if (substitute) {
        content = substituteVariables(content, variables);
      }
      fs.writeFileSync(destPath, content);
      
      // Preserve execute permission if it exists in source
      try {
        const srcStat = fs.statSync(srcPath);
        if (srcStat.mode & 0o111) {
          fs.chmodSync(destPath, 0o755);
        } else if (chmod) {
          fs.chmodSync(destPath, parseInt(chmod, 8));
        }
      } catch (e) {}
    }
  }
}
