import chalk from 'chalk';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { TemplateConfig, PostConfigTask, CopyFileEntry } from './config';
import { loadConfig } from './config';

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
  variables: Record<string, string>
): Promise<void> {
  if (!template.copy_files) return;

  for (const copyFile of template.copy_files) {
    const srcPath = path.join(templateRoot, copyFile.src);
    const destPath = path.join(resolvedDest, copyFile.dest);

    if (!fs.existsSync(srcPath)) {
      console.warn(chalk.yellow(`Warning: ${copyFile.src} not found in template`));
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
