import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { FolderNode, TemplateConfig, CopyFileEntry, PostConfigTask, PostCopyFile, TemplateVariable, shouldIgnore, shouldExclude, shouldExcludeFile } from '../config.js';
import chalk from 'chalk';

/**
 * Extract folder structure skeleton from a directory
 * Only includes directories, with optional .info.md content
 */
export function extractStructure(dirPath: string, rootPath: string, ignorePatterns?: string[]): FolderNode[] {
  const nodes: FolderNode[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      // Only include directories in the structure skeleton
      const isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory());
      if (!isDirectory) continue;

      if (shouldIgnore(entry.name, relativePath, ignorePatterns)) continue;
      if (shouldExclude(dirPath, fullPath)) continue;

      const children = extractStructure(fullPath, rootPath, ignorePatterns);
      let info = '';
      const gitkeepPath = path.join(fullPath, '.gitkeep.md');
      const infoPath = path.join(fullPath, '.info.md');
      if (fs.existsSync(infoPath)) info = fs.readFileSync(infoPath, 'utf-8').trim();
      else if (fs.existsSync(gitkeepPath)) info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
      nodes.push({ name: entry.name, info, children });
    }
  } catch (e) {
    // Ignore directory read errors
  }
  return nodes;
}

/**
 * Scan text files in top-level and 1st-level subdirectories for {{ variable_name }} placeholders.
 */
export function findVariablesInFiles(dirPath: string, rootPath: string, ignorePatterns?: string[]): string[] {
  const variables = new Set<string>();
  const regex = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

  const textExtensions = ['.md', '.txt', '.makerc', '.json', '.yaml', '.yml', '.ini', '.conf', '.config', '.sh', '.py', '.js', '.ts', '.html', '.css', '.makefile'];

  const scan = (currentPath: string, depth: number) => {
    if (depth > 1) return; // Top level (0) and 1st level subfolders (1)

    try {
      const entries = fs.readdirSync(currentPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentPath, entry.name);
        const relativePath = path.relative(rootPath, fullPath);

        if (entry.isDirectory()) {
          if (shouldIgnore(entry.name, relativePath, ignorePatterns)) continue;
          if (shouldExclude(currentPath, fullPath)) continue;
          scan(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const isMakefile = entry.name.toLowerCase() === 'makefile';

          if (textExtensions.includes(ext) || isMakefile || ext === '') {
            try {
              const content = fs.readFileSync(fullPath, 'utf-8');
              let match;
              regex.lastIndex = 0;
              while ((match = regex.exec(content)) !== null) {
                variables.add(match[1]);
              }
            } catch (e) {
              // Skip files that can't be read or aren't text
            }
          }
        }
      }
    } catch (e) {
      // Ignore directory read errors
    }
  };

  scan(dirPath, 0);
  return Array.from(variables);
}

/**
 * Check if a file is executable (by extension or permissions)
 */
export function isExecutable(fullPath: string, fileName: string): boolean {
  if (shouldExcludeFile(fileName)) return false;
  const ext = path.extname(fileName).toLowerCase();
  if (['.sh', '.py', '.bash', '.bat', '.cmd'].includes(ext)) return true;
  if (fileName.toLowerCase() === 'makefile') return true;
  try {
    const stat = fs.statSync(fullPath);
    return !!(stat.mode & 0o111);
  } catch {
    return false;
  }
}

/**
 * Parse .info.md file for name and description
 */
export function parseInfoFile(infoPath: string): { name: string; description: string } {
  let name = '';
  let description = '';
  if (fs.existsSync(infoPath)) {
    const content = fs.readFileSync(infoPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        name = line.substring(2).trim();
      } else if (line.trim() !== '' && !description && !line.startsWith('#')) {
        description = line.trim();
      }
    }
  }
  return { name, description };
}

/**
 * Load JSON template config from .pt-template.json or template.json
 */
export function loadJsonTemplateConfig(dirPath: string): Partial<TemplateConfig> & { name?: string } {
  const jsonConfigPaths = [
    path.join(dirPath, '.pt-template.json'),
    path.join(dirPath, 'template.json')
  ];
  for (const jPath of jsonConfigPaths) {
    if (fs.existsSync(jPath)) {
      try {
        const content = fs.readFileSync(jPath, 'utf-8');
        return JSON.parse(content);
      } catch (e) {
        console.warn(`Warning: Failed to parse ${path.basename(jPath)}: ${(e as Error).message}`);
      }
    }
  }
  return {};
}

/**
 * Get root-level files and directories (for copy_files selection)
 */
export function getRootEntries(dirPath: string, ignorePatterns?: string[]): { files: string[]; dirs: string[] } {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(e => !shouldExclude(dirPath, path.join(dirPath, e.name), ignorePatterns))
    .filter(e => !shouldIgnore(e.name, e.name, ignorePatterns));

  const files = entries.filter(e => e.isFile()).map(e => e.name);
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  return { files, dirs };
}

/**
 * Detect executable files at root level
 */
export function detectRootExecutables(dirPath: string, ignorePatterns?: string[]): string[] {
  const { files } = getRootEntries(dirPath, ignorePatterns);
  return files.filter(file => isExecutable(path.join(dirPath, file), file));
}

/**
 * Parse post_config.sh/.bat scripts for tasks
 */
export function parsePostConfigScript(shPath: string, batPath: string): PostConfigTask[] {
  const tasks: PostConfigTask[] = [];
  
  if (fs.existsSync(shPath)) {
    const lines = fs.readFileSync(shPath, 'utf-8').split('\n');
    let currentDesc = '';
    for (const line of lines) {
      if (line.startsWith('echo "Running: ')) {
        currentDesc = line.substring(15, line.length - 1).replace(/"$/, '');
      } else if (line.trim() && !line.startsWith('#') && !line.startsWith('echo ')) {
        tasks.push({ command: line.trim(), description: currentDesc || line.trim() });
        currentDesc = '';
      }
    }
  } else if (fs.existsSync(batPath)) {
    const lines = fs.readFileSync(batPath, 'utf-8').split('\n');
    let currentDesc = '';
    for (const line of lines) {
      if (line.startsWith('echo Running: ')) {
        currentDesc = line.substring(14).trim();
      } else if (line.trim() && !line.startsWith('::') && !line.startsWith('@echo') && !line.startsWith('echo ')) {
        tasks.push({ command: line.trim(), description: currentDesc || line.trim() });
        currentDesc = '';
      }
    }
  }
  return tasks;
}

/**
 * Merge post_config tasks from existing, JSON file, and detected scripts
 */
export function mergePostConfigTasks(
  existingTasks: PostConfigTask[],
  jsonTasks: PostConfigTask[] | undefined,
  detectedTasks: PostConfigTask[]
): PostConfigTask[] {
  if (jsonTasks && Array.isArray(jsonTasks)) {
    return [...jsonTasks];
  }
  return detectedTasks.length > 0 ? detectedTasks : existingTasks;
}

/**
 * Merge post_copy files from existing, JSON file, and detected executables
 */
export function mergePostCopyFiles(
  existingPostCopy: PostCopyFile[],
  jsonPostCopy: PostCopyFile[] | undefined,
  detectedExecutables: string[]
): PostCopyFile[] {
  let post_copy = [...existingPostCopy];

  if (jsonPostCopy && Array.isArray(jsonPostCopy)) {
    for (const pc of jsonPostCopy) {
      if (!post_copy.some(existing => existing.src === pc.src)) {
        post_copy.push(pc);
      }
    }
  }

  const newExecutables = detectedExecutables.filter(file => !post_copy.some(existing => existing.src === file));
  
  if (newExecutables.length > 0) {
    // In interactive mode, we'd prompt to add these - for now just auto-add
    for (const file of newExecutables) {
      post_copy.push({ src: file, dest: file });
    }
  }

  return post_copy;
}

/**
 * Build copy_files array from selected files/folders and existing entries
 */
export function buildCopyFiles(
  selectedFiles: string[],
  selectedFolders: string[],
  existingCopyFiles: CopyFileEntry[]
): CopyFileEntry[] {
  const copy_files: CopyFileEntry[] = [...existingCopyFiles];
  const existingSrcs = new Set(existingCopyFiles.map(e => e.src));

  // Add new files
  for (const f of selectedFiles) {
    if (!existingSrcs.has(f)) {
      copy_files.push({ src: f, dest: f, substitute_variables: true });
    }
  }
  // Add new folder entries
  for (const d of selectedFolders) {
    if (!existingSrcs.has(d)) {
      copy_files.push({ src: d, dest: d, substitute_variables: true });
    }
  }
  return copy_files;
}

/**
 * Prompt for template name with overwrite warning
 */
export async function promptTemplateName(
  targetName: string,
  existingNames: string[],
  autoDetectedName: string | null,
  options: { yes?: boolean; json?: boolean }
): Promise<string> {
  if (autoDetectedName && !options.json) {
    if (options.yes) {
      if (existingNames.includes(targetName)) {
        console.warn(chalk.yellow(`⚠ Warning: "${targetName}" already exists. Using this name will overwrite the existing template.`));
      }
    } else {
      const { confirmName } = await inquirer.prompt({
        type: 'confirm',
        name: 'confirmName',
        message: `Use "${targetName}" as the template name?`,
        default: true
      });
      if (!confirmName) {
        const { newName } = await inquirer.prompt({
          type: 'input',
          name: 'newName',
          message: 'Name this template:',
          default: targetName
        });
        targetName = newName;
      }
    }
  }
  return targetName;
}

/**
 * Prompt for description
 */
export async function promptDescription(
  defaultDesc: string,
  options: { yes?: boolean; json?: boolean }
): Promise<string> {
  if (options.yes || options.json) return defaultDesc;
  
  const { newDesc } = await inquirer.prompt({
    type: 'input',
    name: 'newDesc',
    message: 'Purpose/Description of this template:',
    default: defaultDesc
  });
  return newDesc;
}

/**
 * Prompt for additional variables (new template mode)
 */
export async function promptAdditionalVariables(
  variables: TemplateVariable[],
  options: { yes?: boolean; json?: boolean }
): Promise<TemplateVariable[]> {
  if (options.yes || options.json) return [];

  const message = variables.length > 0 
    ? `Detected/Existing variables: ${variables.map(v => v.name).join(', ')}. Define more?`
    : 'Define template variables (e.g., client_name, project_type)?';
    
  const response = await inquirer.prompt({
    type: 'confirm',
    name: 'hasMoreVariables',
    message: message,
    default: false
  });

  if (!response.hasMoreVariables) return [];

  const { variableDefs } = await inquirer.prompt({
    type: 'input',
    name: 'variableDefs',
    message: 'Define additional variables as comma-separated names:',
  });

  if (!variableDefs) return [];
  
  const additionalVars = (variableDefs as string).split(',').map((v: string) => v.trim()).filter(Boolean);
  return additionalVars
    .filter(v => !variables.some(existing => existing.name === v))
    .map(v => ({ name: v, prompt: `Enter ${v}:`, required: true }));
}

/**
 * Prompt for new variables (additive mode)
 */
export async function promptNewVariables(
  newVariables: TemplateVariable[],
  options: { yes?: boolean; json?: boolean }
): Promise<TemplateVariable[]> {
  if (newVariables.length === 0) return [];

  console.log(chalk.cyan(`\n📊 New Variables:`));
  console.log(chalk.green(`  + ${newVariables.length} new variable(s): ${newVariables.map(v => v.name).join(', ')}`));

  if (options.yes || options.json) return newVariables;

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
    choices: newVariables.map(v => ({ 
      name: v.name, 
      checked: true // Auto-select by default
    }))
  });

  return newVariables.filter(v => selectedVars.includes(v.name));
}

/**
 * Prompt for global variables
 */
export async function promptGlobalVariables(
  globalVars: TemplateVariable[],
  options: { yes?: boolean; json?: boolean }
): Promise<TemplateVariable[]> {
  if (globalVars.length === 0 || options.yes || options.json) {
    return options.yes || options.json ? globalVars : [];
  }

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
 * Print "no new variables" message
 */
export function printNoNewVariables(): void {
  console.log(chalk.cyan("No new variables detected"));
}

/**
 * Prompt for new folders (additive mode)
 */
export async function promptNewFolders(
  newFolders: FolderNode[],
  options: { yes?: boolean; json?: boolean }
): Promise<FolderNode[]> {
  if (newFolders.length === 0) return [];

  console.log(chalk.cyan(`\n📊 New Folders:`));
  console.log(chalk.green(`  + ${newFolders.length} new folder(s): ${newFolders.map(f => f.name).join(', ')}`));

  if (options.yes || options.json) return newFolders;

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
    choices: newFolders.map(f => ({ 
      name: f.name, 
      checked: true // Auto-select by default
    }))
  });

  return newFolders.filter(f => selectedFolders.includes(f.name));
}

/**
 * Print "no new folders" message
 */
export function printNoNewFolders(): void {
  console.log(chalk.cyan("No new folders detected"));
}

/**
 * Print new files message
 */
export function printNewFiles(count: number, files: string[]): void {
  if (count > 0) {
    console.log(chalk.cyan(`\n📊 New Files:`));
    console.log(chalk.green(`  + ${count} new file(s): ${files.join(', ')}`));
  } else {
    console.log(chalk.cyan("No new files detected"));
  }
}

/**
 * Prompt for new files (additive mode)
 */
export async function promptNewFiles(
  newFiles: string[],
  options: { yes?: boolean; json?: boolean }
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
    choices: newFiles.map(f => ({ 
      name: f, 
      checked: true // Auto-select by default
    }))
  });

  return newFiles.filter(f => selectedFileChoices.includes(f));
}

/**
 * Prompt for root files (new template mode)
 */
export async function promptRootFiles(
  rootFiles: string[],
  defaultFiles: string[] | undefined,
  options: { yes?: boolean; json?: boolean }
): Promise<string[]> {
  if (rootFiles.length === 0) return [];

  if (options.yes || options.json) {
    const defaults = ['.makerc', 'readme.md', 'README.md', '.gitattributes', '.gitignore', 'Makefile', 'makefile', 'package.json'];
    return rootFiles.filter(f => defaults.some(p => f.toLowerCase() === p.toLowerCase()));
  }

  const filesResponse = await inquirer.prompt({
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
    choices: rootFiles.map(f => ({ 
      name: f, 
      checked: ['.makerc', 'readme.md', 'README.md', '.gitattributes', '.gitignore', 'Makefile', 'makefile', 'package.json'].some(p => f.toLowerCase() === p.toLowerCase()) 
    }))
  });

  return filesResponse.selectedFiles;
}

/**
 * Prompt for structure folders (new template mode)
 */
export async function promptStructureFolders(
  rootDirs: string[],
  options: { yes?: boolean; json?: boolean }
): Promise<string[]> {
  if (rootDirs.length === 0) return [];

  if (options.yes || options.json) return rootDirs;

  const foldersResponse = await inquirer.prompt({
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
    choices: rootDirs.map(d => ({ 
      name: d, 
      checked: true // Include all in structure by default
    }))
  });

  return foldersResponse.selectedStructure;
}

/**
 * Prompt for copy folders (new template mode)
 */
export async function promptCopyFolders(
  selectedStructure: string[],
  defaultFolders: string[] | undefined,
  options: { yes?: boolean; json?: boolean }
): Promise<string[]> {
  if (selectedStructure.length === 0) return [];

  if (options.yes || options.json) {
    return selectedStructure.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p));
  }

  const copyFoldersResponse = await inquirer.prompt({
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
    choices: selectedStructure.map((d: string) => ({ 
      name: d, 
      checked: ['APP', 'scripts', 'bin'].some(p => d === p) 
    }))
  });

  return copyFoldersResponse.selectedFolders;
}

/**
 * Prompt for post-config tasks
 */
export async function promptPostConfigTasks(
  tasks: PostConfigTask[],
  options: { yes?: boolean; json?: boolean }
): Promise<string[]> {
  if (tasks.length === 0) return [];

  if (options.yes || options.json) {
    return tasks.map(t => t.command || t.script || '');
  }

  const choices: Array<{name: string; value: string; checked?: boolean}> = [];

  for (const t of tasks) {
    const cmd = t.command || t.script || '(no command)';
    const desc = t.description ? ` (${t.description})` : '';
    choices.push({
      name: `${cmd}${desc}`,
      value: cmd,
      checked: t.checked !== false
    });
  }

  const response = await inquirer.prompt({
    type: 'checkbox',
    name: 'selected',
    message: 'Select default post-config tasks to include in this template:',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices
  });

  return response.selected || [];
}