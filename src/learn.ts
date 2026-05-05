import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames, shouldExclude, shouldIgnore, shouldExcludeFile, PostCopyFile, TemplateVariable } from './config.js';
import chalk from 'chalk';

export async function learn(sourcePath: string, updateTemplate: string | null = null, options: any = {}): Promise<void> {
  const resolvedPath = path.resolve(sourcePath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`Error: Path "${sourcePath}" does not exist.`));
    process.exit(1);
  }

  const isUpdate = !!updateTemplate;
  const config = loadConfig();
  const existingNames = getTemplateNames(config);

  // Check for .info.md
  let infoName = '';
  let infoDesc = '';
  const infoPath = path.join(resolvedPath, '.info.md');
  if (fs.existsSync(infoPath)) {
    const infoContent = fs.readFileSync(infoPath, 'utf-8');
    const lines = infoContent.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        infoName = line.substring(2).trim();
      } else if (line.trim() !== '' && !infoDesc && !line.startsWith('#')) {
        infoDesc = line.trim();
      }
    }
  }
  
  let targetName: string = updateTemplate || '';
  
  if (isUpdate) {
    if (!targetName || !config.templates[targetName]) {
      console.error(chalk.red(`Template "${targetName}" not found.`));
      process.exit(1);
    }
  } else {
    if (options.name) {
      targetName = options.name;
    } else if (infoName) {
      targetName = infoName;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template name from .info.md: ${targetName}`));
    } else {
      if (options.yes || options.json) {
        targetName = path.basename(resolvedPath);
      } else {
        const { newName } = await inquirer.prompt({
          type: 'input',
          name: 'newName',
          message: 'Name this template:',
          default: path.basename(resolvedPath)
        });
        targetName = newName;
      }
    }
  }

  let description = '';
  if (options.desc) {
    description = options.desc;
  } else if (isUpdate) {
    const currentDesc = config.templates[updateTemplate].description || '';
    if (options.yes) {
      description = currentDesc;
    } else {
      const { changeDesc } = await inquirer.prompt({
        type: 'confirm',
        name: 'changeDesc',
        message: `Change description from "${currentDesc}"?`,
        default: false
      });
      
      if (!changeDesc) {
        description = currentDesc;
      } else {
        const { newDesc } = await inquirer.prompt({
          type: 'input',
          name: 'newDesc',
          message: 'Purpose/Description of this template:',
          default: currentDesc
        });
        description = newDesc;
      }
    }
  } else {
    if (infoDesc) {
      description = infoDesc;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template description from .info.md: ${description}`));
    } else if (options.yes || options.json) {
      description = infoDesc || '';
    } else {
      const { newDesc } = await inquirer.prompt({
        type: 'input',
        name: 'newDesc',
        message: 'Purpose/Description of this template:',
        default: targetName
      });
      description = newDesc;
    }
  }

  const cliIgnore = options.ignore ? options.ignore.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  const ignorePatterns = [...(config.ignore || []), ...cliIgnore];

  // Detect variables from files
  const detectedVars = findVariablesInFiles(resolvedPath, resolvedPath, ignorePatterns);
  if (detectedVars.length > 0 && !options.json) {
    console.log(chalk.cyan(`Auto-detected ${detectedVars.length} variable(s): ${detectedVars.join(', ')}`));
  }

  let variables: TemplateVariable[] = [];
  
  // Merge with existing variables if update
  if (isUpdate && config.templates[updateTemplate].variables) {
    variables = [...config.templates[updateTemplate].variables];
  }

  // Add detected variables if not already present
  for (const varName of detectedVars) {
    if (!variables.some(v => v.name === varName)) {
      variables.push({
        name: varName,
        prompt: `Enter ${varName}:`,
        required: true
      });
    }
  }

  let hasMoreVariables = false;
  if (!options.yes && !options.json) {
    const message = variables.length > 0 
      ? `Detected/Existing variables: ${variables.map(v => v.name).join(', ')}. Define more?`
      : 'Define template variables (e.g., client_name, project_type)?';
      
    const response = await inquirer.prompt({
      type: 'confirm',
      name: 'hasMoreVariables',
      message: message,
      default: false
    });
    hasMoreVariables = response.hasMoreVariables;
  }

  if (hasMoreVariables) {
    const { variableDefs } = await inquirer.prompt({
      type: 'input',
      name: 'variableDefs',
      message: 'Define additional variables as comma-separated names:',
    });
    if (variableDefs) {
      const additionalVars = variableDefs.split(',').map((v: string) => v.trim()).filter(Boolean);
      for (const v of additionalVars) {
        if (!variables.some(existing => existing.name === v)) {
          variables.push({
            name: v,
            prompt: `Enter ${v}:`,
            required: true
          });
        }
      }
    }
  }

  // 1. Structure (skeleton)
  const folders = extractStructure(resolvedPath, resolvedPath, ignorePatterns);

  // 2. Content Selection (Root only)
  const rootEntries = fs.readdirSync(resolvedPath, { withFileTypes: true })
    .filter(e => !shouldExclude(resolvedPath, path.join(resolvedPath, e.name), ignorePatterns))
    .filter(e => !shouldIgnore(e.name, e.name, ignorePatterns));

  const rootFiles = rootEntries.filter(e => e.isFile()).map(e => e.name);
  const rootDirs = rootEntries.filter(e => e.isDirectory()).map(e => e.name);

  let selectedFiles: string[] = [];
  let selectedFolders: string[] = [];
  
  if (options.yes || options.json) {
    // If --yes, auto-select the defaults
    selectedFiles = rootFiles.filter(f => ['.makerc', 'readme.md', 'README.md', '.gitattributes', '.gitignore', 'Makefile', 'makefile', 'package.json'].some(p => f.toLowerCase() === p.toLowerCase()));
    selectedFolders = rootDirs.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p));
  } else {
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
    selectedFiles = filesResponse.selectedFiles;

    const foldersResponse = await inquirer.prompt({
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
    selectedFolders = foldersResponse.selectedFolders;
  }

  const copy_files: any[] = [];
  for (const f of selectedFiles) {
    copy_files.push({ src: f, dest: f, substitute_variables: true });
  }
  for (const d of selectedFolders) {
    copy_files.push({ src: d, dest: d, substitute_variables: true });
  }

  const templateConfig: TemplateConfig = {
    description: description,
    templateRoot: resolvedPath,
    folders: folders,
    copy_files: copy_files,
    variables: variables.length > 0 ? variables : undefined
  };

  // Check for post_config scripts
  const postConfigTasks: any[] = [];
  const shPath = path.join(resolvedPath, 'post_config.sh');
  const batPath = path.join(resolvedPath, 'post_config.bat');
  if (fs.existsSync(shPath)) {
    const lines = fs.readFileSync(shPath, 'utf-8').split('\n');
    let currentDesc = '';
    for (const line of lines) {
      if (line.startsWith('echo "Running: ')) {
        currentDesc = line.substring(15, line.length - 1).replace(/"$/, '');
      } else if (line.trim() && !line.startsWith('#') && !line.startsWith('echo ')) {
        postConfigTasks.push({ command: line.trim(), description: currentDesc || line.trim() });
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
        postConfigTasks.push({ command: line.trim(), description: currentDesc || line.trim() });
        currentDesc = '';
      }
    }
  }
  if (postConfigTasks.length > 0) {
    templateConfig.post_config = postConfigTasks;
    if (!options.json) console.log(chalk.cyan(`Auto-detected ${postConfigTasks.length} post_config action(s) from script.`));
  }

  // 3. Detect executables at root
  const detectedExecutables: string[] = [];
  for (const file of rootFiles) {
    const fullPath = path.join(resolvedPath, file);
    if (isExecutable(fullPath, file)) {
      detectedExecutables.push(file);
    }
  }

  if (detectedExecutables.length > 0) {
    if (!options.json) {
      console.log(chalk.cyan("\nAuto-detected " + detectedExecutables.length + " executable file(s) at root:"));
      for (const file of detectedExecutables) {
        console.log(chalk.gray("  - " + file));
      }
    }
    let addPostCopy = true;
    if (!options.yes && !options.json) {
      const response = await inquirer.prompt({
        type: 'confirm',
        name: 'addPostCopy',
        message: 'Add these to post_copy (auto-chmod)?',
        default: true
      });
      addPostCopy = response.addPostCopy;
    }
    if (addPostCopy) {
      templateConfig.post_copy = detectedExecutables.map(f => ({ src: f, dest: f }));
      templateConfig.copy_files = templateConfig.copy_files?.filter(cf => !detectedExecutables.includes(cf.src));
    }
  }

  if (options.json) {
    const output = {
      name: targetName,
      ...templateConfig
    };
    console.log(JSON.stringify(output, null, 2));
    return;
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

/**
 * Scan text files in top-level and 1st-level subdirectories for {{ variable_name }} placeholders.
 */
function findVariablesInFiles(dirPath: string, rootPath: string, ignorePatterns?: string[]): string[] {
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
