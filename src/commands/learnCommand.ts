import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames, shouldExclude, shouldIgnore, shouldExcludeFile, PostCopyFile, TemplateVariable, CopyFileEntry, PostConfigTask, getDefaultPostConfig } from '../config.js';
import chalk from 'chalk';
import { downloadAndExtract } from '../remote.js';

export interface LearnOptions {
  ignore?: string;
  yes?: boolean;
  name?: string;
  desc?: string;
  json?: boolean;
  allowUntrusted?: boolean;
}


export async function learn(sourcePath: string, updateTemplate: string | null = null, options: LearnOptions = {}): Promise<void> {
  let resolvedPath: string;

  // Phase 1: Remote Check
  if (sourcePath.startsWith('http')) {
    console.log(chalk.cyan(`Downloading remote template from: ${sourcePath}...`));
    try {
      resolvedPath = await downloadAndExtract(sourcePath, options.json || false, options.allowUntrusted || false);
    } catch (err) {
      if ((err as Error).message === 'Download cancelled by user due to untrusted source') {
        console.log(chalk.yellow('Download cancelled. Exiting.'));
        process.exit(0);
      }
      throw err;
    }
  } else {
    resolvedPath = path.resolve(sourcePath);
  }
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`Error: Path "${resolvedPath}" does not exist.`));
    process.exit(1);
  }

  const isUpdate = !!updateTemplate;
  const config = loadConfig();
  const existingNames = getTemplateNames(config);

  // Check for template configuration JSON file (.pt-template.json or template.json)
  let fileTemplateConfig: Partial<TemplateConfig> & { name?: string } = {};
  const jsonConfigPaths = [
    path.join(resolvedPath, '.pt-template.json'),
    path.join(resolvedPath, 'template.json')
  ];
  for (const jPath of jsonConfigPaths) {
    if (fs.existsSync(jPath)) {
      try {
        const fileContent = fs.readFileSync(jPath, 'utf-8');
        fileTemplateConfig = JSON.parse(fileContent);
        if (!options.json) console.log(chalk.cyan(`Auto-detected template configurations from ${path.basename(jPath)}`));
        break;
      } catch (e) {
        console.warn(chalk.yellow(`Warning: Failed to parse ${path.basename(jPath)}: ${(e as Error).message}`));
      }
    }
  }

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
    // Track whether name came from .info.md or JSON (not user-provided)
    const nameFromSource = !options.name && (fileTemplateConfig.name || infoName);
    
    if (options.name) {
      targetName = options.name;
    } else if (fileTemplateConfig.name) {
      targetName = fileTemplateConfig.name;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template name from JSON: ${targetName}`));
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
    
    // If name came from .info.md or JSON, prompt to confirm/edit
    // This prevents accidental overwrites when creating new templates based on existing ones
    if (nameFromSource && !options.json) {
      if (options.yes) {
        // In --yes mode, keep the auto-detected name but warn
        const existingNames = getTemplateNames(config);
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
    // Track whether description came from .info.md or JSON (not user-provided)
    const descFromSource = !options.desc && (fileTemplateConfig.description || infoDesc);
    
    if (fileTemplateConfig.description) {
      description = fileTemplateConfig.description;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template description from JSON: ${description}`));
    } else if (infoDesc) {
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
    
    // If description came from .info.md or JSON, prompt to confirm/edit
    // This prevents accidental overwrites when creating new templates based on existing ones
    if (descFromSource && !options.json) {
      if (options.yes) {
        // In --yes mode, keep the auto-detected description but warn
        const existingNames = getTemplateNames(config);
        if (existingNames.includes(targetName)) {
          console.warn(chalk.yellow(`⚠ Warning: "${targetName}" already exists. Using this name will overwrite the existing template.`));
        }
      } else {
        const { confirmDesc } = await inquirer.prompt({
          type: 'confirm',
          name: 'confirmDesc',
          message: `Use "${description}" as the template description?`,
          default: true
        });
        if (!confirmDesc) {
          const { newDesc } = await inquirer.prompt({
            type: 'input',
            name: 'newDesc',
            message: 'Purpose/Description of this template:',
            default: description
          });
          description = newDesc;
        }
      }
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
  
  // During updates, merge existing template variables with JSON file variables
  if (isUpdate) {
    // Start with existing template variables
    if (config.templates[updateTemplate].variables) {
      variables = [...config.templates[updateTemplate].variables];
    }
    // Then add JSON variables (overwrite/update existing ones with same name)
    if (fileTemplateConfig.variables && Array.isArray(fileTemplateConfig.variables)) {
      for (const v of fileTemplateConfig.variables) {
        const existingIndex = variables.findIndex(existing => existing.name === v.name);
        if (existingIndex !== -1) {
          // Update existing variable with JSON values (but preserve other fields)
          variables[existingIndex] = { ...variables[existingIndex], ...v };
        } else {
          // Add new variable
          variables.push({ ...v });
        }
      }
    }
  } else {
    // For new templates, use JSON variables if available
    if (fileTemplateConfig.variables && Array.isArray(fileTemplateConfig.variables)) {
      variables = [...fileTemplateConfig.variables];
    }
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

  // Include global variables as suggestions
  if (config.variables && Array.isArray(config.variables)) {
    for (const v of config.variables) {
      if (!variables.some(existing => existing.name === v.name)) {
        variables.push({ ...v });
      }
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
      const additionalVars = (variableDefs as string).split(',').map((v: string) => v.trim()).filter(Boolean);
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
  const folders = fileTemplateConfig.folders && Array.isArray(fileTemplateConfig.folders)
    ? fileTemplateConfig.folders
    : extractStructure(resolvedPath, resolvedPath, ignorePatterns);

  // 2. Content Selection (Root only)
  const rootEntries = fs.readdirSync(resolvedPath, { withFileTypes: true })
    .filter(e => !shouldExclude(resolvedPath, path.join(resolvedPath, e.name), ignorePatterns))
    .filter(e => !shouldIgnore(e.name, e.name, ignorePatterns));

  const rootFiles = rootEntries.filter(e => e.isFile()).map(e => e.name);
  const rootDirs = rootEntries.filter(e => e.isDirectory()).map(e => e.name);

  let selectedFiles: string[] = [];
  let selectedFolders: string[] = [];
  let selectedStructure: string[] = [];
  
  if (options.yes || options.json) {
    // If --yes, auto-select the defaults
    selectedFiles = rootFiles.filter(f => ['.makerc', 'readme.md', 'README.md', '.gitattributes', '.gitignore', 'Makefile', 'makefile', 'package.json'].some(p => f.toLowerCase() === p.toLowerCase()));
    selectedStructure = rootDirs; // Include all folders in structure
    selectedFolders = rootDirs.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p)); // Only copy specific ones recursively
  } else {
    if (rootFiles.length > 0) {
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
    } else {
      selectedFiles = [];
    }

    if (rootDirs.length > 0) {
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
      selectedStructure = foldersResponse.selectedStructure;
    } else {
      selectedStructure = [];
    }

    if (selectedStructure.length > 0) {
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
      selectedFolders = copyFoldersResponse.selectedFolders;
    } else {
      selectedFolders = [];
    }
  }

  const copy_files: CopyFileEntry[] = [];
  if (fileTemplateConfig.copy_files && Array.isArray(fileTemplateConfig.copy_files)) {
    copy_files.push(...fileTemplateConfig.copy_files);
  } else {
    for (const f of selectedFiles) {
      copy_files.push({ src: f, dest: f, substitute_variables: true });
    }
    for (const d of selectedFolders) {
      copy_files.push({ src: d, dest: d, substitute_variables: true });
    }
  }

  const templateConfig: TemplateConfig = {
    description: description,
    templateRoot: resolvedPath,
    folders: fileTemplateConfig.folders ? folders : folders.filter(f => selectedStructure.includes(f.name)),
    copy_files: copy_files,
    variables: variables.length > 0 ? variables : undefined
  };

  // Check for post_config scripts
  let postConfigTasks: PostConfigTask[] = [];
  if (fileTemplateConfig.post_config && Array.isArray(fileTemplateConfig.post_config)) {
    postConfigTasks = [...fileTemplateConfig.post_config];
  } else {
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
  }
  if (postConfigTasks.length > 0) {
    templateConfig.post_config = postConfigTasks;
    if (!options.json && !fileTemplateConfig.post_config) console.log(chalk.cyan(`Auto-detected ${postConfigTasks.length} post_config action(s) from script.`));
  }

  // Handle default_post_config tasks
  const defaultPostConfig = getDefaultPostConfig(config);
  const defaultApplicableTasks = defaultPostConfig.filter(t => !t.type || t.type === targetName);

  if (defaultApplicableTasks.length > 0) {
    let selectedTaskNames: string[] = [];
    if (options.yes || options.json) {
      selectedTaskNames = defaultApplicableTasks.map(t => t.command || t.script || '');
    } else {
      const choices: Array<{name: string; value: string; checked?: boolean}> = [];
      for (const t of defaultApplicableTasks) {
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
      selectedTaskNames = response.selected || [];
    }

    if (selectedTaskNames.length > 0) {
      if (!templateConfig.post_config) templateConfig.post_config = [];
      for (const t of defaultApplicableTasks) {
        const cmd = t.command || t.script || '';
        if (selectedTaskNames.includes(cmd)) {
          const alreadyExists = templateConfig.post_config.some(existing => existing.command === t.command && existing.script === t.script);
          if (!alreadyExists) {
             templateConfig.post_config.push(t);
          }
        }
      }
    }
  }

  // 3. Detect executables at root
  const detectedExecutables: string[] = [];
  for (const file of rootFiles) {
    const fullPath = path.join(resolvedPath, file);
    if (isExecutable(fullPath, file)) {
      detectedExecutables.push(file);
    }
  }

  if (fileTemplateConfig.post_copy && Array.isArray(fileTemplateConfig.post_copy)) {
    templateConfig.post_copy = fileTemplateConfig.post_copy;
    const postCopySrcs = fileTemplateConfig.post_copy.map(f => f.src);
    templateConfig.copy_files = templateConfig.copy_files?.filter(cf => !postCopySrcs.includes(cf.src));
  } else if (detectedExecutables.length > 0) {
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
      
      // Only include directories in the structure skeleton
      const isDirectory = entry.isDirectory() || (entry.isSymbolicLink() && fs.existsSync(fullPath) && fs.statSync(fullPath).isDirectory());
      if (!isDirectory) continue;

      if (shouldIgnore(entry.name, relativePath, ignorePatterns)) continue;
      if (shouldExclude(dirPath, fullPath)) continue;

      const children = extractStructure(fullPath, rootPath, ignorePatterns);
      let info = "";
      const gitkeepPath = path.join(fullPath, '.gitkeep.md');
      const infoPath = path.join(fullPath, '.info.md');
      if (fs.existsSync(gitkeepPath)) info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
      else if (fs.existsSync(infoPath)) info = fs.readFileSync(infoPath, 'utf-8').trim();
      nodes.push({ name: entry.name, info: info, children: children });
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
