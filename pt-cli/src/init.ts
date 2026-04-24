import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, FolderNode, TemplateConfig } from './config.js';
import chalk from 'chalk';
import { processCopyFiles } from './substitute.js';
import { runPostConfig, getBuiltInDefaults } from './postconfig.js';

export async function init(targetName: string | undefined, destPath: string | undefined, skipPostConfig: boolean = false) {
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

  if (fs.existsSync(resolvedDest)) {
    console.error(chalk.red(`Error: Destination "${resolvedDest}" already exists.`));
    process.exit(1);
  }

  console.log(chalk.cyan(`\nInitializing project "${template.name}" at: ${resolvedDest}`));

  // 1. Create structure
  createStructure(resolvedDest, template.folders);

  // 2. Process copy_files (if templateRoot is available)
  if (template.templateRoot && template.copy_files) {
    try {
      await processCopyFiles(template.templateRoot, resolvedDest, template, {});
    } catch (err) {
      console.warn(chalk.yellow('  Warning: copy_files encountered an error, continuing...'));
    }
  }

  // 3. Determine post-config tasks (template-defined or built-in defaults)
  let postConfigTasks = template.post_config;
  if (!postConfigTasks) {
    // Check if any tasks apply to this type
    const defaults = getBuiltInDefaults(template.type);
    const applicableDefaults = defaults.filter(t => !t.type || t.type === template.type);
    if (applicableDefaults.length > 0) {
      // Offer built-in defaults as suggestions
      const { useDefaults } = await inquirer.prompt({
        type: 'confirm',
        name: 'useDefaults',
        message: `No post-config defined for this template. Use suggested tasks?`,
        default: true
      });
      if (useDefaults) {
        postConfigTasks = applicableDefaults;
      }
    }
  }

  // 4. Run post-config tasks
  if (postConfigTasks) {
    await runPostConfig(resolvedDest, postConfigTasks, template.type, skipPostConfig);
  }

  console.log(chalk.green(`\n✓ Project created successfully.`));
}

function createStructure(dirPath: string, folders: FolderNode[]) {
  for (const folder of folders) {
    const fullDirPath = path.join(dirPath, folder.name);
    fs.mkdirSync(fullDirPath, { recursive: true });

    // Create .info.md if content exists
    if (folder.info) {
      const infoPath = path.join(fullDirPath, '.info.md');
      fs.writeFileSync(infoPath, folder.info);
    }

    // Recurse children
    if (folder.children && folder.children.length > 0) {
      createStructure(fullDirPath, folder.children);
    }
  }
}
