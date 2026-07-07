import chalk from 'chalk';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { TemplateConfig } from './config.js';
import { sanitizePath } from './config.js';

/**
 * Replaces all {{var}} patterns in the content with values from the variables object.
 * Supports nested variable expansion - if a variable's value contains {{other_var}},
 * it will be expanded iteratively until no more placeholders remain or maxIterations is reached.
 */
export function substituteVariables(
  content: string,
  variables: Record<string, string>,
  maxIterations: number = 10
): string {
  let result = content;
  let iteration = 0;
  
  // Keep expanding until no more placeholders remain or we hit the limit
  while (/\{\{[^}]+\}\}/.test(result) && iteration < maxIterations) {
    // Use a more complex regex that captures the full placeholder including spaces
    result = result.replace(/(\{\{\s*)(\w+)(\s*\}\})/g, (_, prefix, varName, suffix) => {
      const val = variables[varName];
      // If variable not found, leave placeholder as-is with original spacing
      if (val === undefined) {
        return `${prefix}${varName}${suffix}`;
      }
      // Return the value (which may contain more placeholders to expand)
      return val;
    });
    iteration++;
    
    // Prevent infinite loops by checking if we're stuck
    if (iteration > 1 && result === content) {
      console.warn(chalk.yellow(`Warning: Potential infinite loop detected in variable expansion, stopping after ${iteration} iterations`));
      break;
    }
  }
  
  return result;
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
        const dirSubstitute = !!(copyFile.substitute_variables === true || (
          copyFile.substitute_variables === undefined &&
          template.variables &&
          template.variables.length > 0 &&
          Object.keys(variables).length > 0
        ));
        copyDirRecursive(srcPath, destPath, variables, dirSubstitute, copyFile.chmod);
      }
      console.log(chalk.green(`  ✓ ${copyFile.dest} (recursive)`));
    } else {
      // Single file copy
      if (dryRun) {
        console.log(chalk.gray(`  [DRY RUN] Would copy ${copyFile.src} → ${copyFile.dest}`));
        const drySubstitute = !!(copyFile.substitute_variables === true || (
          copyFile.substitute_variables === undefined &&
          template.variables &&
          template.variables.length > 0 &&
          Object.keys(variables).length > 0
        ));
        if (drySubstitute) {
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
      // Default to substituting if substitute_variables is true, OR if it's undefined AND the template defines variables.
      // If substitute_variables is explicitly false, do not substitute.
      const shouldSubstitute = !!(copyFile.substitute_variables === true || (
        copyFile.substitute_variables === undefined &&
        template.variables &&
        template.variables.length > 0 &&
        Object.keys(variables).length > 0
      ));
      if (shouldSubstitute) {
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
