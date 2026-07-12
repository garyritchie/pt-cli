import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames, shouldExclude, shouldIgnore, shouldExcludeFile, TemplateVariable, CopyFileEntry, PostConfigTask, getDefaultPostConfig } from '../config.js';
import chalk from 'chalk';
import { downloadAndExtract } from '../remote.js';

export interface UpdateOptions {
  ignore?: string;
  yes?: boolean;
  desc?: string;
  json?: boolean;
  allowUntrusted?: boolean;
  noDiff?: boolean;
}

// Additive mode functions - only add new items, never remove existing
interface NewStructure {
  added: FolderNode[];
}

interface NewFiles {
  newFiles: string[];
}

interface NewVariables {
  newVariables: TemplateVariable[];
}

function getNewFolders(storedStructure: FolderNode[], targetPath: string, ignorePatterns: string[]): NewStructure {
  const added: FolderNode[] = [];
  
  const getStructureMap = (nodes: FolderNode[]): Map<string, FolderNode> => {
    const map = new Map<string, FolderNode>();
    for (const node of nodes) {
      map.set(node.name, node);
    }
    return map;
  };
  
  const storedMap = getStructureMap(storedStructure);
  const targetStructure = extractStructure(targetPath, targetPath, ignorePatterns);
  const targetMap = getStructureMap(targetStructure);
  
  // Find only new folders
  for (const [name, targetNode] of targetMap) {
    if (!storedMap.has(name)) {
      added.push(targetNode);
    }
  }
  
  return { added };
}

function getNewFiles(storedTemplate: TemplateConfig, targetPath: string): NewFiles {
  const newFiles: string[] = [];
  
  // Get current files in target
  const currentFiles = fs.readdirSync(targetPath, { withFileTypes: true })
    .filter(e => e.isFile())
    .map(e => e.name);
  
  // Get files from stored template
  const storedFiles = storedTemplate.copy_files?.map(f => f.src) || [];
  
  // Find only new files
  for (const file of currentFiles) {
    if (!storedFiles.includes(file)) {
      newFiles.push(file);
    }
  }
  
  return { newFiles };
}

function getNewVariables(storedVariables: TemplateVariable[], targetPath: string): NewVariables {
  const newVariables: TemplateVariable[] = [];
  
  // Get variables from target directory
  const targetVars = findVariablesInFiles(targetPath, targetPath);
  const storedVarMap = new Set(storedVariables.map(v => v.name));
  
  // Find only new variables
  for (const varName of targetVars) {
    if (!storedVarMap.has(varName)) {
      newVariables.push({
        name: varName,
        prompt: `Enter ${varName}:`,
        required: true
      });
    }
  }
  
  return { newVariables };
}

export async function update(sourcePath: string, templateName: string, options: UpdateOptions = {}): Promise<void> {
  // Determine if additive mode is disabled
  const isFullMode = options.noDiff;
  
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

  const config = loadConfig();
  if (!config.templates[templateName]) {
    console.error(chalk.red(`Template "${templateName}" not found.`));
    process.exit(1);
  }

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

  let description = config.templates[templateName].description || '';
  let templateRoot = config.templates[templateName].templateRoot || resolvedPath;

  if (!options.yes && !options.json) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Template description:',
        default: description
      },
      {
        type: 'input',
        name: 'templateRoot',
        message: 'Template root folder:',
        default: templateRoot
      }
    ]);
    description = answers.description;
    templateRoot = answers.templateRoot;
    if (!fs.existsSync(templateRoot)) {
      console.error(chalk.red(`Error: Template root path "${templateRoot}" does not exist.`));
      process.exit(1);
    }
  } else {
    if (options.desc) {
      description = options.desc;
    } else if (fileTemplateConfig.description) {
      description = fileTemplateConfig.description;
    } else if (infoDesc) {
      description = infoDesc;
    }
    templateRoot = resolvedPath;
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
  if (config.templates[templateName].variables) {
    variables = [...config.templates[templateName].variables];
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

  // Variable handling - additive mode
  if (!isFullMode) {
    // Additive mode: only present new variables for selection
    const variableDiff = getNewVariables(config.templates[templateName].variables || [], resolvedPath);
    
    // Also include default/global variables that are not already in the template
    const globalVarsToPrompt: TemplateVariable[] = [];
    if (config.variables && Array.isArray(config.variables)) {
      for (const v of config.variables) {
        if (!variables.some(existing => existing.name === v.name) &&
            !variableDiff.newVariables.some(existing => existing.name === v.name)) {
          globalVarsToPrompt.push({ ...v });
        }
      }
    }
    
    const combinedNewVars = [...variableDiff.newVariables, ...globalVarsToPrompt];
    
    if (combinedNewVars.length > 0) {
      console.log(chalk.cyan(`\n📊 New Variables:`));
      console.log(chalk.green(`  + ${combinedNewVars.length} new variable(s): ${combinedNewVars.map(v => v.name).join(', ')}`));
      
      // Show interactive checkbox for new variables
      if (!options.yes && !options.json) {
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
          choices: combinedNewVars.map(v => ({ 
            name: v.name, 
            checked: true // Auto-select by default
          }))
        });
        // Only add selected variables
        variables.push(...combinedNewVars.filter(v => selectedVars.includes(v.name)));
      } else {
        // In --yes or --json mode, auto-add all
        variables.push(...combinedNewVars);
      }
    } else {
      console.log(chalk.cyan("No new variables detected"));
    }
  } else {
    // Full mode: original behavior with optional default/global variables prompt
    const globalVarsToPrompt: TemplateVariable[] = [];
    if (config.variables && Array.isArray(config.variables)) {
      for (const v of config.variables) {
        if (!variables.some(existing => existing.name === v.name)) {
          globalVarsToPrompt.push({ ...v });
        }
      }
    }

    if (globalVarsToPrompt.length > 0) {
      if (!options.yes && !options.json) {
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
          choices: globalVarsToPrompt.map(v => ({ name: v.name, checked: true }))
        });
        variables.push(...globalVarsToPrompt.filter(v => selectedGlobals.includes(v.name)));
      } else {
        variables.push(...globalVarsToPrompt);
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
  }

  // 1. Structure (skeleton) - Additive mode
  let folders: FolderNode[] = [];
  if (!isFullMode) {
    // Additive mode: only add new folders
    const structureDiff = getNewFolders(config.templates[templateName].folders, resolvedPath, ignorePatterns);
    
    if (structureDiff.added.length > 0) {
      console.log(chalk.cyan(`\n📊 New Folders:`));
      console.log(chalk.green(`  + ${structureDiff.added.length} new folder(s): ${structureDiff.added.map(f => f.name).join(', ')}`));
      
      // Show interactive checkbox for new folders
      if (!options.yes && !options.json) {
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
          choices: structureDiff.added.map(f => ({ 
            name: f.name, 
            checked: true // Auto-select by default
          }))
        });
        // Only add selected folders
        folders = [...config.templates[templateName].folders, ...structureDiff.added.filter(f => selectedFolders.includes(f.name))];
      } else {
        // In --yes or --json mode, auto-add all
        folders = [...config.templates[templateName].folders, ...structureDiff.added];
      }
    } else {
      console.log(chalk.cyan("No new folders detected"));
      folders = config.templates[templateName].folders;
    }
  } else {
    // Full mode: original behavior
    folders = fileTemplateConfig.folders && Array.isArray(fileTemplateConfig.folders)
      ? fileTemplateConfig.folders
      : extractStructure(resolvedPath, resolvedPath, ignorePatterns);
  }

  // 2. Content Selection (Root only) - Additive mode
   const rootEntries = fs.readdirSync(resolvedPath, { withFileTypes: true })
     .filter(e => !shouldExclude(resolvedPath, path.join(resolvedPath, e.name), ignorePatterns))
     .filter(e => !shouldIgnore(e.name, e.name, ignorePatterns));

   const rootFiles = rootEntries.filter(e => e.isFile()).map(e => e.name);
   const rootDirs = rootEntries.filter(e => e.isDirectory()).map(e => e.name);

   let selectedFiles: string[] = [];
   let selectedFolders: string[] = [];
   let selectedStructure: string[] = [];
  
   if (!isFullMode) {
     // Additive mode for files and folders
     // Start with existing files and folders, preserving their substitute_variables settings
     const existingCopyFiles = config.templates[templateName].copy_files || [];
     selectedFiles = existingCopyFiles.map(f => f.src);
    
     const fileDiff = getNewFiles(config.templates[templateName], resolvedPath);
    
     if (fileDiff.newFiles.length > 0) {
       console.log(chalk.cyan(`\n📊 New Files:`));
       console.log(chalk.green(`  + ${fileDiff.newFiles.length} new file(s): ${fileDiff.newFiles.join(', ')}`));
      
       // Show interactive checkbox for new files
       if (!options.yes && !options.json) {
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
           choices: fileDiff.newFiles.map(f => ({ 
             name: f, 
             checked: true // Auto-select by default
           }))
         });
         // Only add selected files
         selectedFiles.push(...fileDiff.newFiles.filter(f => selectedFileChoices.includes(f)));
       } else {
         // In --yes or --json mode, auto-add all
         selectedFiles.push(...fileDiff.newFiles);
       }
     } else {
       console.log(chalk.cyan("No new files detected"));
     }
    
    // For folders, use additive mode logic
    // Always preserve existing folders first
    selectedStructure = config.templates[templateName].folders?.map(f => f.name) || [];
    selectedFolders = selectedStructure.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p));
    
    if (rootDirs.length > 0) {
      const structureDiff = getNewFolders(config.templates[templateName].folders, resolvedPath, ignorePatterns);
      
      if (structureDiff.added.length > 0) {
        // Auto-select added folders for structure
        selectedStructure = [...new Set([...selectedStructure, ...structureDiff.added.map(f => f.name)])];
        // Auto-select for recursive copy if they're in the standard list
        selectedFolders = selectedStructure.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p));
      } else {
        // Keep existing folders
        selectedFolders = selectedStructure.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p));
      }
    } else {
      // Keep existing folders
      selectedFolders = selectedStructure.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p));
    }
  } else {
    // Full mode: original behavior
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
  }

  const copy_files: CopyFileEntry[] = [];
  if (fileTemplateConfig.copy_files && Array.isArray(fileTemplateConfig.copy_files)) {
    copy_files.push(...fileTemplateConfig.copy_files);
  } else {
    const existingCopyFiles = config.templates[templateName].copy_files || [];
    const existingMap = new Map<string, CopyFileEntry>();
    for (const entry of existingCopyFiles) {
      existingMap.set(entry.src, entry);
    }
    const addedSrcs = new Set<string>();

    for (const f of selectedFiles) {
      if (addedSrcs.has(f)) continue;
      addedSrcs.add(f);
      if (existingMap.has(f)) {
        copy_files.push(existingMap.get(f)!);
      } else {
        copy_files.push({ src: f, dest: f, substitute_variables: true });
      }
    }
    for (const d of selectedFolders) {
      if (addedSrcs.has(d)) continue;
      addedSrcs.add(d);
      if (existingMap.has(d)) {
        copy_files.push(existingMap.get(d)!);
      } else {
        copy_files.push({ src: d, dest: d, substitute_variables: true });
      }
    }
  }

  const templateConfig: TemplateConfig = {
    description: description,
    templateRoot: templateRoot,
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
  const defaultApplicableTasks = defaultPostConfig.filter(t => !t.type || t.type === templateName);

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

  const existingPostCopy = config.templates[templateName].post_copy || [];
  let post_copy = [...existingPostCopy];

  if (fileTemplateConfig.post_copy && Array.isArray(fileTemplateConfig.post_copy)) {
    for (const pc of fileTemplateConfig.post_copy) {
      if (!post_copy.some(existing => existing.src === pc.src)) {
        post_copy.push(pc);
      }
    }
  }

  const newExecutables = detectedExecutables.filter(file => !post_copy.some(existing => existing.src === file));

  if (newExecutables.length > 0) {
    if (!options.json) {
      console.log(chalk.cyan("\nAuto-detected " + newExecutables.length + " new executable file(s) at root:"));
      for (const file of newExecutables) {
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
      for (const file of newExecutables) {
        post_copy.push({ src: file, dest: file });
      }
    }
  }

  if (post_copy.length > 0) {
    templateConfig.post_copy = post_copy;
    const postCopySrcs = post_copy.map(f => f.src);
    templateConfig.copy_files = templateConfig.copy_files?.filter(cf => !postCopySrcs.includes(cf.src));
  }

  if (options.json) {
  const output = {
    name: templateName,
    ...templateConfig
  };
  
    // Force the application to wait until every single byte of this JSON string 
    // safely clears the operating system's pipe buffer before letting the process die.
    process.stdout.write(JSON.stringify(output, null, 2) + '\n', () => {
      process.exit(0);
    });
    return;
  }

  config.templates[templateName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n✓ Template saved as "${templateName}"`));
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
      if (fs.existsSync(infoPath)) info = fs.readFileSync(infoPath, 'utf-8').trim();
      else if (fs.existsSync(gitkeepPath)) info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
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