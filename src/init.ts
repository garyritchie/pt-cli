import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, FolderNode, PostCopyFile } from './config.js';
import chalk from 'chalk';
import { processCopyFiles } from './substitute.js';
import { runPostConfig } from './postconfig.js';

export async function init(targetName: string | undefined, destPath: string | undefined, skipPostConfig: boolean = false, dryRun: boolean = false) {
  const config = loadConfig();

  let typeName: string | undefined = targetName;

  // If no name provided, list templates
  if (!typeName) {
    const names = Object.keys(config.templates);
    if (names.length === 0) {
      console.log(chalk.red("No templates found. Run 'pt learn <path>' first."));
      return;
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
    const { name } = await inquirer.prompt({
      type: 'input',
      name: 'name',
      message: 'Project path/folder name:'
    });
    dest = name;
  }

  const resolvedDest = path.resolve(dest!);

  if (fs.existsSync(resolvedDest) && !dryRun) {
    console.error(chalk.red(`Error: Destination "${resolvedDest}" already exists.`));
    process.exit(1);
  }

  if (dryRun) {
    console.log(chalk.yellow(`\n[DRY RUN] Initializing project "${template.description}" at: ${resolvedDest}`));
  } else {
    console.log(chalk.cyan(`\nInitializing project "${template.description}" at: ${resolvedDest}`));
  }

  // 1. Create structure
  createStructure(resolvedDest, template.folders, dryRun);

  // 2. Process copy_files
  if (template.copy_files && template.templateRoot) {
    if (dryRun) console.log(chalk.yellow("[DRY RUN] Processing copy_files..."));
    else console.log(chalk.cyan("Processing copy_files..."));
    await processCopyFiles(template.templateRoot, resolvedDest, template, {}, dryRun);
  }


  // 3. Process post_copy (executable scripts)
  if (template.post_copy && template.templateRoot) {
    if (dryRun) console.log(chalk.yellow("[DRY RUN] Processing post_copy..."));
    else console.log(chalk.cyan("Processing post_copy..."));

    for (const file of template.post_copy) {
      const srcPath = path.join(template.templateRoot, file.src);
      const destPath = path.join(resolvedDest, file.dest || file.src);

      if (fs.existsSync(srcPath)) {
        if (dryRun) {
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
  // 4. Run post-config tasks
  if (template.post_config) {
    await runPostConfig(resolvedDest, template.post_config, typeName!, skipPostConfig, dryRun);
  }

  if (dryRun) {
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
