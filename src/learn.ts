import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames, shouldExclude, shouldIgnore, shouldExcludeFile, PostCopyFile } from './config.js';
import chalk from 'chalk';

export interface TemplateVariable {
  name: string;
  prompt: string;
  default?: string;
  required?: boolean;
}

export async function learn(sourcePath: string, updateTemplate: string | null = null, ignoreArgs?: string): Promise<void> {
  const resolvedPath = path.resolve(sourcePath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`Error: Path "${sourcePath}" does not exist.`));
    process.exit(1);
  }

  const isUpdate = !!updateTemplate;
  const config = loadConfig();
  const existingNames = getTemplateNames(config);
  
  let targetName: string = updateTemplate || '';
  
  if (isUpdate) {
    if (!targetName || !config.templates[targetName]) {
      console.error(chalk.red(`Template "${targetName}" not found.`));
      process.exit(1);
    }
  } else {
    const { newName } = await inquirer.prompt({
      type: 'input',
      name: 'newName',
      message: 'Name this template:',
      default: path.basename(resolvedPath)
    });
    targetName = newName;
  }

  let type = '';
  if (isUpdate) {
    const currentType = config.templates[updateTemplate].type;
    const { changeType } = await inquirer.prompt({
      type: 'confirm',
      name: 'changeType',
      message: `Change type from "${currentType}"?`,
      default: false
    });
    
    if (!changeType) {
      type = currentType;
    } else {
      const existingTypes = Array.from(new Set(Object.values(config.templates || {}).filter(t => t && t.type).map(t => t.type)));
      const typeChoice = await inquirer.prompt({
        type: 'list',
        name: 'type',
        message: 'Select Project Type:',
        loop: false,
        theme: {
          icon: {
            cursor: chalk.green('[x] ')
          }
        },
        choices: [
          ...existingTypes.map(t => ({ name: `Use existing: ${t}`, value: t })),
          { name: '(Create new type)', value: '__NEW__' }
        ]
      });
      type = typeChoice.type;
      if (type === '__NEW__') {
        const { newTypeName } = await inquirer.prompt({
          type: 'input',
          name: 'newTypeName',
          message: 'New type name:'
        });
        type = newTypeName;
      }
    }
  } else {
    const existingTypes = Array.from(new Set(Object.values(config.templates || {}).filter(t => t && t.type).map(t => t.type)));
    const typeChoice = await inquirer.prompt({
      type: 'list',
      name: 'type',
      message: 'Select Project Type:',
      loop: false,
      theme: {
        icon: {
          cursor: chalk.green('[x] ')
        }
      },
      choices: [
        ...existingTypes.map(t => ({ name: `Use existing: ${t}`, value: t })),
        { name: '(Create new type)', value: '__NEW__' }
      ]
    });

    type = typeChoice.type;
    if (type === '__NEW__') {
      const { newTypeName } = await inquirer.prompt({
        type: 'input',
        name: 'newTypeName',
        message: 'New type name:'
      });
      type = newTypeName;
    }
  }

  const cliIgnore = ignoreArgs ? ignoreArgs.split(',').map(s => s.trim()).filter(Boolean) : [];
  const ignorePatterns = [...(config.ignore || []), ...cliIgnore];

  const { hasVariables } = await inquirer.prompt({
    type: 'confirm',
    name: 'hasVariables',
    message: 'Define template variables (e.g., client_name, project_type)?',
    default: false
  });

  let variables: TemplateVariable[] = [];
  if (hasVariables) {
    const { variableDefs } = await inquirer.prompt({
      type: 'input',
      name: 'variableDefs',
      message: 'Define variables as comma-separated names:',
      default: 'client_name,project_name'
    });
    variables = variableDefs.split(',').map((v: string) => ({
      name: v.trim(),
      prompt: `Enter ${v.trim()}:`,
      required: true
    }));
  }

  // 1. Structure (skeleton)
  const folders = extractStructure(resolvedPath, resolvedPath, ignorePatterns);

  // 2. Content Selection (Root only)
  const rootEntries = fs.readdirSync(resolvedPath, { withFileTypes: true })
    .filter(e => !shouldExclude(resolvedPath, path.join(resolvedPath, e.name), ignorePatterns))
    .filter(e => !shouldIgnore(e.name, e.name, ignorePatterns));

  const rootFiles = rootEntries.filter(e => e.isFile()).map(e => e.name);
  const rootDirs = rootEntries.filter(e => e.isDirectory()).map(e => e.name);

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
    choices: rootFiles.map(f => ({ 
      name: f, 
      checked: ['.makerc', 'readme.md', 'README.md', '.gitattributes', '.gitignore', 'Makefile', 'makefile', 'package.json'].some(p => f.toLowerCase() === p.toLowerCase()) 
    }))
  });

  const { selectedFolders } = await inquirer.prompt({
    type: 'checkbox',
    name: 'selectedFolders',
    message: 'Select folders to copy recursively as boilerplate:',
    loop: false,
    theme: {
      icon: {
        checked: chalk.green('[x] '),
        unchecked: '[ ] ',
      }
    },
    choices: rootDirs.map(d => ({ 
      name: d, 
      checked: ['APP', 'scripts', 'bin'].some(p => d === p) 
    }))
  });

  const copy_files: any[] = [];
  for (const f of selectedFiles) {
    copy_files.push({ src: f, dest: f, substitute_variables: true });
  }
  for (const d of selectedFolders) {
    copy_files.push({ src: d, dest: d, substitute_variables: true });
  }

  const templateConfig: TemplateConfig = {
    name: path.basename(resolvedPath),
    type: type,
    templateRoot: resolvedPath,
    folders: folders,
    copy_files: copy_files,
    variables: variables.length > 0 ? variables : undefined
  };

  // 3. Detect executables at root
  const detectedExecutables: string[] = [];
  for (const file of rootFiles) {
    const fullPath = path.join(resolvedPath, file);
    if (isExecutable(fullPath, file)) {
      detectedExecutables.push(file);
    }
  }

  if (detectedExecutables.length > 0) {
    console.log(chalk.cyan("\nAuto-detected " + detectedExecutables.length + " executable file(s) at root:"));
    for (const file of detectedExecutables) {
      console.log(chalk.gray("  - " + file));
    }
    const { addPostCopy } = await inquirer.prompt({
      type: 'confirm',
      name: 'addPostCopy',
      message: 'Add these to post_copy (auto-chmod)?',
      default: true
    });
    if (addPostCopy) {
      templateConfig.post_copy = detectedExecutables.map(f => ({ src: f, dest: f }));
      templateConfig.copy_files = templateConfig.copy_files?.filter(cf => !detectedExecutables.includes(cf.src));
    }
  }

  config.templates[targetName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n✓ Template saved as "${targetName}"`));
}

function isExecutable(fullPath: string, fileName: string): boolean {
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

function extractStructure(dirPath: string, rootPath: string, ignorePatterns?: string[]): FolderNode[] {
  let nodes: FolderNode[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);
      if (entry.isDirectory() && shouldIgnore(entry.name, relativePath, ignorePatterns)) continue;
      if (shouldExclude(dirPath, fullPath)) continue;
      if (entry.isDirectory()) {
        const children = extractStructure(fullPath, rootPath, ignorePatterns);
        let info = "";
        const gitkeepPath = path.join(fullPath, '.gitkeep.md');
        const infoPath = path.join(fullPath, '.info.md');
        if (fs.existsSync(gitkeepPath)) info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
        else if (fs.existsSync(infoPath)) info = fs.readFileSync(infoPath, 'utf-8').trim();
        nodes.push({ name: entry.name, info: info, children: children });
      }
    }
  } catch (e) {}
  return nodes;
}
