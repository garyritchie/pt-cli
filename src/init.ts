import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, FolderNode, PostCopyFile } from './config.js';
import chalk from 'chalk';
import { processCopyFiles } from './substitute.js';
import { runPostConfig } from './postconfig.js';

export async function init(targetName: string | undefined, destPath: string | undefined, options: any = {}) {
  const config = loadConfig();

  let typeName: string | undefined = targetName;

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

  const template = config.templates[typeName!];
  if (!template) {
    console.error(chalk.red(`Template "${typeName}" not found.`));
    process.exit(1);
  }

  let dest: string | undefined = destPath;
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

  // 2. Process copy_files
  if (template.copy_files && template.templateRoot) {
    if (options.dryRun) console.log(chalk.yellow("[DRY RUN] Processing copy_files..."));
    else console.log(chalk.cyan("Processing copy_files..."));
    await processCopyFiles(template.templateRoot, resolvedDest, template, variables, options.dryRun);
  }


  // 3. Process post_copy (executable scripts)
  if (template.post_copy && template.templateRoot) {
    if (options.dryRun) console.log(chalk.yellow("[DRY RUN] Processing post_copy..."));
    else console.log(chalk.cyan("Processing post_copy..."));

    for (const file of template.post_copy) {
      const srcPath = path.join(template.templateRoot, file.src);
      const destPath = path.join(resolvedDest, file.dest || file.src);

      if (fs.existsSync(srcPath)) {
        if (options.dryRun) {
          console.log(chalk.gray(`  [DRY RUN] Would copy ${file.src} → ${file.dest || file.src}`));
          const ext = path.extname(file.src);
          if (['.sh', '.py', '.bash', '.bat'].includes(ext)) {
            console.log(chalk.gray(`  [DRY RUN] Would chmod +x ${file.dest || file.src}`));
          }
          continue;
        }

        const fileContent = fs.readFileSync(srcPath, 'utf-8');
        const destDir = path.dirname(destPath);
        fs.mkdirSync(destDir, { recursive: true });
        fs.writeFileSync(destPath, fileContent);

        // Auto-chmod for executables
        const ext = path.extname(file.src);
        if (['.sh', '.py', '.bash', '.bat'].includes(ext)) {
          try {
            fs.chmodSync(destPath, 0o755);
          } catch (e) {
            // chmod not available (Windows)
          }
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

  // Write post_config scripts
  if (template.post_config && template.post_config.length > 0) {
    if (!options.dryRun) {
      let bashContent = '#!/bin/bash\n# Auto-generated post_config script\n\n';
      let batContent = '@echo off\n:: Auto-generated post_config script\n\n';
      for (const task of template.post_config) {
        const cmd = task.command || (task.script ? `./${task.script}` : '');
        if (cmd) {
          bashContent += `echo "Running: ${task.description || cmd}"\n${cmd}\n`;
          batContent += `echo Running: ${task.description || cmd}\n${cmd}\n`;
        }
      }
      fs.writeFileSync(path.join(resolvedDest, 'post_config.sh'), bashContent);
      try { fs.chmodSync(path.join(resolvedDest, 'post_config.sh'), 0o755); } catch(e) {}
      fs.writeFileSync(path.join(resolvedDest, 'post_config.bat'), batContent);
    } else {
      console.log(chalk.gray(`  [DRY RUN] Would create post_config.sh and post_config.bat`));
    }
  }

  // 4. Run post-config tasks
  if (template.post_config) {
    await runPostConfig(resolvedDest, template.post_config, typeName!, options);
  }

  if (options.dryRun) {
    console.log(chalk.yellow(`\n[DRY RUN] Project initialization preview complete.`));
  } else {
    console.log(chalk.green(`\n✓ Project created successfully.`));
  }
}

function createStructure(dirPath: string, folders: FolderNode[], dryRun: boolean = false) {
  for (const folder of folders) {
    const fullDirPath = path.join(dirPath, folder.name);

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
