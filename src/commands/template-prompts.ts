import inquirer from 'inquirer';
import chalk from 'chalk';
import { TemplateVariable, FolderNode, CopyFileEntry, PostConfigTask } from '../config.js';

/**
 * Prompt for template name with auto-detection and confirmation
 */
export async function promptTemplateName(
  currentName: string,
  existingNames: string[],
  sourceName: string | null,
  options: { yes?: boolean; json?: boolean } = {}
): Promise<string> {
  if (options.yes || options.json) return currentName;

  // If name came from source (.info.md or JSON), confirm it
  if (sourceName && sourceName === currentName) {
    const { confirmName } = await inquirer.prompt({
      type: 'confirm',
      name: 'confirmName',
      message: `Use "${currentName}" as the template name?`,
      default: true
    });
    if (!confirmName) {
      const { newName } = await inquirer.prompt({
        type: 'input',
        name: 'newName',
        message: 'Name this template:',
        default: currentName
      });
      return newName;
    }
  }

  // Check for existing template name
  if (existingNames.includes(currentName)) {
    console.warn(chalk.yellow(`⚠ Warning: "${currentName}" already exists. Using this name will overwrite.`));
  }
  return currentName;
}

/**
 * Prompt for template description
 */
export async function promptDescription(
  currentDesc: string,
  options: { yes?: boolean; json?: boolean } = {}
): Promise<string> {
  if (options.yes || options.json) return currentDesc;

  const { description } = await inquirer.prompt({
    type: 'input',
    name: 'description',
    message: 'Template description:',
    default: currentDesc
  });
  return description;
}

/**
 * Prompt for template root directory
 */
export async function promptTemplateRoot(
  currentRoot: string,
  options: { yes?: boolean; json?: boolean } = {}
): Promise<string> {
  if (options.yes || options.json) return currentRoot;

  const { templateRoot } = await inquirer.prompt({
    type: 'input',
    name: 'templateRoot',
    message: 'Template root folder:',
    default: currentRoot
  });
  return templateRoot;
}

/**
 * Prompt for new variables (checkbox selection)
 */
export async function promptNewVariables(
  newVars: TemplateVariable[],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<TemplateVariable[]> {
  if (newVars.length === 0) return [];
  
  if (options.yes || options.json) return newVars;

  console.log(chalk.cyan(`\n📊 New Variables:`));
  console.log(chalk.green(`  + ${newVars.length} new variable(s): ${newVars.map(v => v.name).join(', ')}`));

  const { selectedVars } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedVars',
    message: 'Select variables to include (space to toggle):',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: newVars.map(v => ({ name: v.name, checked: true }))
  });

  return newVars.filter(v => selectedVars.includes(v.name));
}

/**
 * Prompt for global/default variables to include
 */
export async function promptGlobalVariables(
  globalVars: TemplateVariable[],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<TemplateVariable[]> {
  if (globalVars.length === 0) return [];
  
  if (options.yes || options.json) return globalVars;

  const { selectedGlobals } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedGlobals',
    message: 'Select default/global variables to include (space to toggle):',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: globalVars.map(v => ({ name: v.name, checked: true }))
  });

  return globalVars.filter(v => selectedGlobals.includes(v.name));
}

/**
 * Prompt for additional custom variables
 */
export async function promptAdditionalVariables(
  existingVars: TemplateVariable[],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<TemplateVariable[]> {
  if (options.yes || options.json) return [];

  const message = existingVars.length > 0 
    ? `Existing variables: ${existingVars.map(v => v.name).join(', ')}. Define more?`
    : 'Define template variables (e.g., client_name, project_type)?';

  const { hasMore } = await inquirer.prompt({
    type: 'confirm',
    name: 'hasMore',
    message,
    default: false
  });

  if (!hasMore) return [];

  const { variableDefs } = await inquirer.prompt({
    type: 'input',
    name: 'variableDefs',
    message: 'Define additional variables as comma-separated names:'
  });

  if (!variableDefs) return [];

  const additionalVars = variableDefs.split(',').map((v: string) => v.trim()).filter(Boolean);
  return additionalVars
    .filter((v: string) => !existingVars.some((existing: TemplateVariable) => existing.name === v))
    .map((v: string) => ({ name: v, prompt: `Enter ${v}:`, required: true }));
}

/**
 * Prompt for new folders (checkbox selection)
 */
export async function promptNewFolders(
  newFolders: FolderNode[],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<FolderNode[]> {
  if (newFolders.length === 0) return [];
  
  if (options.yes || options.json) return newFolders;

  console.log(chalk.cyan(`\n📊 New Folders:`));
  console.log(chalk.green(`  + ${newFolders.length} new folder(s): ${newFolders.map(f => f.name).join(', ')}`));

  const { selectedFolders } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedFolders',
    message: 'Select folders to include in template structure (space to toggle):',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: newFolders.map(f => ({ name: f.name, checked: true }))
  });

  return newFolders.filter(f => selectedFolders.includes(f.name));
}

/**
 * Prompt for root files (checkbox selection)
 */
export async function promptRootFiles(
  files: string[],
  defaults: string[] = ['.makerc', 'readme.md', 'README.md', '.gitattributes', '.gitignore', 'Makefile', 'makefile', 'package.json'],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<string[]> {
  if (files.length === 0) return [];
  
  if (options.yes || options.json) {
    return files.filter(f => defaults.some(d => f.toLowerCase() === d.toLowerCase()));
  }

  const { selectedFiles } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedFiles',
    message: 'Select root files to include as boilerplate:',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: files.map(f => ({
      name: f,
      checked: defaults.some(d => f.toLowerCase() === d.toLowerCase())
    }))
  });

  return selectedFiles;
}

/**
 * Prompt for folders in structure (checkbox selection)
 */
export async function promptStructureFolders(
  dirs: string[],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<string[]> {
  if (dirs.length === 0) return [];
  
  if (options.yes || options.json) return dirs;

  const { selectedStructure } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedStructure',
    message: 'Select folders to include in the template structure (skeleton):',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: dirs.map(d => ({ name: d, checked: true }))
  });

  return selectedStructure;
}

/**
 * Prompt for folders to copy recursively (checkbox selection)
 */
export async function promptCopyFolders(
  structureFolders: string[],
  defaults: string[] = ['APP', 'scripts', 'bin'],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<string[]> {
  if (structureFolders.length === 0) return [];
  
  if (options.yes || options.json) {
    return structureFolders.filter(d => defaults.includes(d));
  }

  const { selectedFolders } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedFolders',
    message: 'Select folders to copy RECURSIVELY as boilerplate (with contents):',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: structureFolders.map(d => ({
      name: d,
      checked: defaults.includes(d)
    }))
  });

  return selectedFolders;
}

/**
 * Prompt for post-config tasks
 */
export async function promptPostConfigTasks(
  tasks: PostConfigTask[],
  options: { yes?: boolean; json?: boolean; dryRun?: boolean } = {}
): Promise<string[]> {
  if (tasks.length === 0) return [];
  
  if (options.dryRun) return tasks.map(t => t.command || `./${t.script}` || '');
  if (options.yes || options.json) return tasks.map(t => t.command || `./${t.script}` || '');

  const choices = tasks.map(t => ({
    name: `${t.command || `./${t.script}` || '(no command)'}${t.description ? ` (${t.description})` : ''}`,
    value: t.command || `./${t.script}` || '',
    checked: true
  }));

  const { selected } = await inquirer.prompt({
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

  return selected || [];
}

/**
 * Prompt to add detected executables to post_copy
 */
export async function promptAddPostCopy(
  executables: string[],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<boolean> {
  if (executables.length === 0) return false;
  if (options.yes || options.json) return true;

  const { addPostCopy } = await inquirer.prompt({
    type: 'confirm',
    name: 'addPostCopy',
    message: 'Add these to post_copy (auto-chmod)?',
    default: true
  });
  return addPostCopy;
}

/**
 * Print new files detection message
 */
export function printNewFiles(fileCount: number, fileNames: string[]): void {
  if (fileCount > 0) {
    console.log(chalk.cyan(`\n📊 New Files:`));
    console.log(chalk.green(`  + ${fileCount} new file(s): ${fileNames.join(', ')}`));
  } else {
    console.log(chalk.cyan("No new files detected"));
  }
}

/**
 * Print no new folders message
 */
export function printNoNewFolders(): void {
  console.log(chalk.cyan("No new folders detected"));
}

/**
 * Print no new variables message
 */
export function printNoNewVariables(): void {
  console.log(chalk.cyan("No new variables detected"));
}

/**
 * Prompt for new files (checkbox selection)
 */
export async function promptNewFiles(
  newFiles: string[],
  options: { yes?: boolean; json?: boolean } = {}
): Promise<string[]> {
  if (newFiles.length === 0) return [];
  
  if (options.yes || options.json) return newFiles;

  const { selectedFileChoices } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedFileChoices',
    message: 'Select files to include (space to toggle):',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: newFiles.map(f => ({ name: f, checked: true }))
  });

  return newFiles.filter(f => selectedFileChoices.includes(f));
}