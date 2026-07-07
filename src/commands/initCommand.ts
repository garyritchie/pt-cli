import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadConfig, FolderNode, sanitizePath, TemplateConfig } from '../config.js';
import chalk from 'chalk';
import { processCopyFiles } from '../substitute.js';
import { execSync } from 'child_process';

export interface InitOptions {
  skipPostConfig?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  vars?: string;
  file?: string;
}

/**
 * Scan parent directories for .env files and parse their variables.
 * Returns a map of variable names to their values, supporting:
 * - KEY=VALUE format
 * - KEY="VALUE with spaces" format
 * - KEY='VALUE with spaces' format
 * - Comments (lines starting with #)
 * - Empty lines
 */
function scanEnvForVariables(targetPath: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  let currentDir = path.resolve(targetPath);
  
  // Scan up to 5 parent directories for .env files
  const maxDepth = 5;
  
  for (let depth = 0; depth < maxDepth; depth++) {
    const envPath = path.join(currentDir, '.env');
    
    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          // Skip empty lines and comments
          if (!trimmed || trimmed.startsWith('#')) {
            continue;
          }
          
          // Match KEY=VALUE patterns
          const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
          if (match) {
            const key = match[1];
            let value = match[2];
            
            // Remove surrounding quotes if present
            if ((value.startsWith('"') && value.endsWith('"')) || 
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            
            envVars[key] = value;
          }
        }
      } catch (err) {
        // Silently skip unreadable .env files
        continue;
      }
    }
    
    // Move to parent directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      // Reached filesystem root
      break;
    }
    currentDir = parentDir;
  }
  
  return envVars;
}

export async function init(targetName: string | undefined, destPath: string | undefined, options: InitOptions = {}) {
  const config = loadConfig();

  let typeName: string | undefined = targetName;
  let dest: string | undefined = destPath;
  let template: TemplateConfig;

  if (options.file) {
    // If direct template file is specified, targetName could be the destPath if destPath is omitted
    if (typeName && !dest) {
      dest = typeName;
      typeName = undefined;
    }

    try {
      const fileContent = fs.readFileSync(options.file, 'utf-8');
      template = JSON.parse(fileContent);
    } catch (e) {
      console.error(chalk.red(`Error: Failed to read/parse template file "${options.file}": ${(e as Error).message}`));
      process.exit(1);
    }

    if (!typeName) {
      typeName = (template as any).name || 'custom-template';
    }
  } else {
    // If no name provided, list templates
    if (!typeName) {
      const names = Object.keys(config.templates);
      if (names.length === 0) {
        console.log(chalk.red("No templates found. Run 'pt learn <path>' first."));
        return;
      }

      if (options.yes) {
        console.error(chalk.red("No project type specified and running in non-interactive mode."));
        process.exit(1);
      }
      const { selected } = await inquirer.prompt({
        type: 'list',
        name: 'selected',
        message: 'Select Project Type:',
        loop: false,
        theme: {
          icon: {
            cursor: chalk.green('[x] ')
          }
        },
        choices: names.map(n => ({ name: n, value: n }))
      });
      typeName = selected;
    }

    template = config.templates[typeName!];
    if (!template) {
      console.error(chalk.red(`Template "${typeName}" not found.`));
      process.exit(1);
    }
  }

  if (!dest) {
    if (options.yes) {
      console.error(chalk.red("No destination path specified and running in non-interactive mode."));
      process.exit(1);
    }
    const { name } = await inquirer.prompt({
      type: 'input',
      name: 'name',
      message: 'Project path/folder name:'
    });
    dest = name;
  }

  const resolvedDest = path.resolve(dest!);

  if (fs.existsSync(resolvedDest) && !options.dryRun) {
    console.error(chalk.red(`Error: Destination "${resolvedDest}" already exists.`));
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`\n[DRY RUN] Initializing project "${template.description}" at: ${resolvedDest}`));
  } else {
    console.log(chalk.cyan(`\nInitializing project "${template.description}" at: ${resolvedDest}`));
  }

  // Handle Variables
  let variables: Record<string, string> = {};
  if (template.variables && template.variables.length > 0) {
    // Scan parent directories for .env files and pre-fill variables
    const envVars = scanEnvForVariables(resolvedDest);
    
    // Merge .env variables into variables (with lower priority than --vars)
    if (Object.keys(envVars).length > 0) {
      for (const [key, value] of Object.entries(envVars)) {
        if (!variables[key]) {
          variables[key] = value;
        }
      }
    }
    
    if (options.vars) {
      // Parse --vars "key=val,key2=val2"
      const pairs = options.vars.split(',').map((p: string) => p.trim());
      for (const pair of pairs) {
        const [k, ...v] = pair.split('=');
        if (k && v.length > 0) {
          variables[k.trim()] = v.join('=').trim();
        }
      }
    }

    if (!options.yes) {
      // Prompt for any missing variables
      for (const v of template.variables) {
        if (!variables[v.name]) {
          const answer = await inquirer.prompt({
            type: 'input',
            name: v.name,
            message: v.prompt || `Enter ${v.name}:`,
            default: v.default || ''
          });
          variables[v.name] = answer[v.name];
        }
      }
    } else {
      // Non-interactive mode: check required
      for (const v of template.variables) {
        if (!variables[v.name]) {
          if (v.required) {
            console.error(chalk.red(`Error: Variable "${v.name}" is required but was not provided in non-interactive mode. Use --vars ${v.name}=value`));
            process.exit(1);
          } else {
            variables[v.name] = v.default || '';
          }
        }
      }
    }
  }

  // 1. Create structure
  createStructure(resolvedDest, template.folders, options.dryRun);
  
  // Check if templateRoot exists (if it's defined)
  const templateRootExists = template.templateRoot && fs.existsSync(template.templateRoot);
  if (template.templateRoot && !templateRootExists) {
    console.warn(chalk.yellow(`\nWarning: Template source directory not found: ${template.templateRoot}`));
    console.warn(chalk.gray("Folder structure created, but files/boilerplate will be skipped."));
  }

  // 2. Process copy_files
  if (template.copy_files && templateRootExists) {
    if (options.dryRun) console.log(chalk.yellow("[DRY RUN] Processing copy_files..."));
    else console.log(chalk.cyan("Processing copy_files..."));
    await processCopyFiles(template.templateRoot!, resolvedDest, template, variables, options.dryRun);
  }


  // 3. Process post_copy (executable scripts)
  if (template.post_copy && templateRootExists) {
    if (options.dryRun) console.log(chalk.yellow("[DRY RUN] Processing post_copy..."));
    else console.log(chalk.cyan("Processing post_copy..."));

    for (const file of template.post_copy) {
      const srcPath = path.join(template.templateRoot!, file.src);
      const destPath = path.join(resolvedDest, sanitizePath(file.dest || file.src));

      if (fs.existsSync(srcPath)) {
        if (options.dryRun) {
          console.log(chalk.gray(`  [DRY RUN] Would copy ${file.src} → ${file.dest || file.src}`));
          console.log(chalk.gray(`  [DRY RUN] Would chmod +x ${file.dest || file.src}`));
          continue;
        }

        let fileContent = fs.readFileSync(srcPath, 'utf-8');

        // Substitute variables in post_copy files if template has variables
        if (template.variables && template.variables.length > 0) {
          const { substituteVariables } = await import('../substitute.js');
          fileContent = substituteVariables(fileContent, variables);
        }

        const destDir = path.dirname(destPath);
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(destPath, fileContent);

        // post_copy files are executables by definition — always chmod
        try {
          // Check if source had execute permissions, otherwise default to 0o755
          const srcStat = fs.statSync(srcPath);
          fs.chmodSync(destPath, srcStat.mode & 0o111 ? srcStat.mode : 0o755);
        } catch (e) {
          // chmod not available (Windows)
        }
        console.log(chalk.green("  ✓ " + (file.dest || file.src)));
      } else {
        console.warn(chalk.yellow("  ! " + file.src + " not found, skipping"));
      }
    }
  }
  // Write .info.md
  if (!options.dryRun) {
    const infoContent = `# ${typeName}\n\n${template.description || ''}\n`;
    fs.writeFileSync(path.join(resolvedDest, '.info.md'), infoContent);
  } else {
    console.log(chalk.gray(`  [DRY RUN] Would create .info.md`));
  }

  // Use template post_config tasks
  const allTasks = template.post_config?.filter(t => !t.type || t.type === typeName!) || [];

  if (allTasks.length > 0 && !options.skipPostConfig) {
    // SECURITY CHECK: Validate template safety before running post_config tasks
    const { validateTemplateSecurity } = await import('../safety.js');
    const { valid, errors, warnings } = validateTemplateSecurity(template);
    
    if (!valid) {
      console.error(chalk.red("\n❌ SECURITY ERROR: Aborting post_config execution due to blocked commands:"));
      for (const err of errors) {
        console.error(chalk.red(`   - ${err}`));
      }
      process.exit(1);
    }

    if (warnings.length > 0) {
      console.warn(chalk.yellow("\n⚠️  SECURITY WARNING: Post-config contains dangerous or suspicious commands:"));
      for (const warn of warnings) {
        console.warn(chalk.yellow(`   - ${warn}`));
      }
      
      if (!options.yes) {
        const { proceed } = await inquirer.prompt({
          type: 'confirm',
          name: 'proceed',
          message: chalk.red('Are you sure you want to run these post-config tasks?'),
          default: false
        });
        if (!proceed) {
          console.log(chalk.yellow("Post-config tasks aborted by user."));
          return;
        }
      } else {
        console.warn(chalk.yellow("Proceeding anyway (non-interactive mode with auto-confirm enabled)."));
      }
    }
    // Determine which tasks to include
    let selectedTaskNames: string[] = [];
    
    if (options.skipPostConfig) {
      // Skip entirely
      selectedTaskNames = [];
    } else if (options.dryRun) {
      // In dry-run, select all (for display)
      selectedTaskNames = allTasks.map(t => t.command || t.script || '');
      console.log(chalk.yellow(`\n[DRY RUN] Applicable post-config tasks:`));
      for (const t of allTasks) {
        const desc = t.description ? ` (${t.description})` : '';
        console.log(chalk.gray(`  [template] - ${t.command || t.script}${desc}`));
      }
    } else if (options.yes) {
      // All tasks selected
      selectedTaskNames = allTasks.map(t => t.command || t.script || '');
    } else if (allTasks.length === 0) {
      selectedTaskNames = [];
    } else {
      // Checkbox prompt
      const choices: Array<{name: string; value: string; checked?: boolean}> = [];
      
      for (const t of allTasks) {
        const cmd = t.command || t.script || '(no command)';
        const desc = t.description ? ` (${t.description})` : '';
        choices.push({
          name: `${cmd}${desc}`,
          value: cmd,
          checked: true
        });
      }
      
      const response = await inquirer.prompt({
        type: 'checkbox',
        name: 'selected',
        message: 'Select post-config tasks to run:',
        loop: false,
        theme: {
          icon: {
            checked: chalk.green('[x] '),
            unchecked: '[ ] ',
          }
        },
        choices
      });
      selectedTaskNames = response.selected || [];
    }
    
   // Write post_config scripts for selected tasks
    if (selectedTaskNames.length > 0 && !options.dryRun) {
      let bashContent = '#!/bin/bash\n# Auto-generated post_config script\n\n';
      let batContent = '@echo off\n:: Auto-generated post_config script\n\n';
      for (const t of allTasks) {
        // Determine the actual command/script to use
        let cmd = '';
        if (t.command) {
          cmd = t.command;
        } else if (t.script) {
          cmd = `./${t.script}`;
        }
        // Match against selected names (use command if available, else script)
        const taskKey = t.command || (t.script ? `./${t.script}` : '');
        if (selectedTaskNames.includes(taskKey)) {
          if (cmd) {
            bashContent += `echo "Running: ${t.description || taskKey}"\n${cmd}\n`;
            batContent += `echo Running: ${t.description || taskKey}\n${cmd}\n`;
          }
        }
      }
      fs.writeFileSync(path.join(resolvedDest, 'post_config.sh'), bashContent);
      try { fs.chmodSync(path.join(resolvedDest, 'post_config.sh'), 0o755); } catch(e) {}
      fs.writeFileSync(path.join(resolvedDest, 'post_config.bat'), batContent);

      // Execute the appropriate script
      console.log(chalk.cyan("\nExecuting post-config tasks..."));
      try {
        const scriptCmd = process.platform === 'win32' ? 'post_config.bat' : './post_config.sh';
        execSync(scriptCmd, { 
          cwd: resolvedDest, 
          stdio: 'inherit' 
        });
      } catch (e) {
        console.error(chalk.red("\nError: Some post-config tasks failed. Check the output above."));
      }
    }
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`\n[DRY RUN] Project initialization preview complete.`));
  } else {
    console.log(chalk.green(`\n✓ Project created successfully.`));
  }
}

function createStructure(dirPath: string, folders: FolderNode[], dryRun: boolean = false) {
  for (const folder of folders) {
    const fullDirPath = path.join(dirPath, sanitizePath(folder.name));

    if (dryRun) {
      console.log(chalk.gray(`  [DRY RUN] Would create directory: ${fullDirPath}`));
    } else {
      fs.mkdirSync(fullDirPath, { recursive: true });
    }

    // Create .info.md if content exists
    if (folder.info) {
      const infoPath = path.join(fullDirPath, '.info.md');
      if (dryRun) {
        console.log(chalk.gray(`  [DRY RUN] Would create info file: ${infoPath}`));
      } else {
        fs.writeFileSync(infoPath, folder.info);
      }
    }

    // Recurse children
    if (folder.children && folder.children.length > 0) {
      createStructure(fullDirPath, folder.children, dryRun);
    }
  }
}
