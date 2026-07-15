import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames, shouldExclude, shouldIgnore, shouldExcludeFile, PostCopyFile, TemplateVariable, CopyFileEntry, PostConfigTask, getDefaultPostConfig } from '../config.js';
import chalk from 'chalk';
import { downloadAndExtract } from '../remote.js';
import {
  extractStructure,
  findVariablesInFiles,
  isExecutable,
  parseInfoFile,
  loadJsonTemplateConfig,
  getRootEntries,
  parsePostConfigScript,
  mergePostConfigTasks,
  mergePostCopyFiles,
  buildCopyFiles,
  promptTemplateName,
  promptDescription,
  promptAdditionalVariables,
  promptNewVariables,
  promptGlobalVariables,
  printNoNewVariables,
  promptNewFolders,
  printNoNewFolders,
  printNewFiles,
  promptNewFiles,
  promptRootFiles,
  promptStructureFolders,
  promptCopyFolders,
  promptPostConfigTasks
} from './template-utils.js';

export interface LearnOptions {
  ignore?: string;
  yes?: boolean;
  name?: string;
  desc?: string;
  json?: boolean;
  allowUntrusted?: boolean;
  noDiff?: boolean;
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

  // Check for template configuration JSON file
  const fileTemplateConfig = loadJsonTemplateConfig(resolvedPath);
  if (fileTemplateConfig && !options.json) {
    // Find which file was loaded
    const jsonConfigPaths = [
      path.join(resolvedPath, '.pt-template.json'),
      path.join(resolvedPath, 'template.json')
    ];
    for (const jPath of jsonConfigPaths) {
      if (fs.existsSync(jPath)) {
        console.log(chalk.cyan(`Auto-detected template configurations from ${path.basename(jPath)}`));
        break;
      }
    }
  }

  // Check for .info.md
  const { name: infoName, description: infoDesc } = parseInfoFile(path.join(resolvedPath, '.info.md'));
  
  // --- NAME ---
  let targetName = updateTemplate || '';
  
  if (isUpdate) {
    // When updating, use the provided template name directly
    // No auto-detection from files needed for updates
    if (!targetName || !config.templates[targetName]) {
      console.error(chalk.red(`Template "${targetName}" not found.`));
      process.exit(1);
    }
  } else {
    const nameFromSource = !options.name && (fileTemplateConfig.name || infoName);
    
    if (options.name) {
      targetName = options.name;
    } else if (fileTemplateConfig.name) {
      targetName = fileTemplateConfig.name;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template name from JSON: ${targetName}`));
    } else if (infoName) {
      targetName = infoName;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template name from .info.md: ${targetName}`));
    } else if (options.yes || options.json) {
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
    
    // Confirm name if auto-detected
    targetName = await promptTemplateName(targetName, existingNames, nameFromSource ? targetName : null, options);
  }

  // --- DESCRIPTION ---
  let description = '';
  const descFromSource = !options.desc && (fileTemplateConfig.description || infoDesc);
  
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
        description = await promptDescription(currentDesc, options);
      }
    }
  } else {
    if (fileTemplateConfig.description) {
      description = fileTemplateConfig.description;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template description from JSON: ${description}`));
    } else if (infoDesc) {
      description = infoDesc;
      if (!options.json) console.log(chalk.cyan(`Auto-detected template description from .info.md: ${description}`));
    } else {
      description = await promptDescription(infoDesc || targetName, options);
    }
    
    // Confirm description if auto-detected
    if (descFromSource && !options.json) {
      if (!options.yes) {
        const { confirmDesc } = await inquirer.prompt({
          type: 'confirm',
          name: 'confirmDesc',
          message: `Use "${description}" as the template description?`,
          default: true
        });
        if (!confirmDesc) {
          description = await promptDescription(description, options);
        }
      }
    }
  }

  // --- IGNORE PATTERNS ---
  const cliIgnore = options.ignore ? options.ignore.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
  const ignorePatterns = [...(config.ignore || []), ...cliIgnore];

  // --- VARIABLES ---
  const detectedVars = findVariablesInFiles(resolvedPath, resolvedPath, ignorePatterns);
  if (detectedVars.length > 0 && !options.json) {
    console.log(chalk.cyan(`Auto-detected ${detectedVars.length} variable(s): ${detectedVars.join(', ')}`));
  }

  let variables: TemplateVariable[] = [];

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
          variables[existingIndex] = { ...variables[existingIndex], ...v };
        } else {
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
      variables.push({ name: varName, prompt: `Enter ${varName}:`, required: true });
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

  // Variable prompting
  if (!isUpdate || options.noDiff === undefined) {
    // New template or full mode - prompt for additional variables
    const additionalVars = await promptAdditionalVariables(variables, options);
    variables.push(...additionalVars);
  } else {
    // Additive mode - only prompt for new variables
    const existingVarNames = new Set(config.templates[updateTemplate].variables?.map(v => v.name) || []);
    const newVars = variables.filter(v => !existingVarNames.has(v.name));
    if (newVars.length > 0) {
      const selectedNewVars = await promptNewVariables(newVars, options);
      variables.push(...selectedNewVars);
    } else {
      printNoNewVariables();
    }
    
    // Also prompt for global variables not already included
    const globalVarsToPrompt = (config.variables || []).filter(
      gv => !variables.some(v => v.name === gv.name)
    );
    if (globalVarsToPrompt.length > 0) {
      const selectedGlobals = await promptGlobalVariables(globalVarsToPrompt, options);
      variables.push(...selectedGlobals);
    }
  }

  // --- STRUCTURE ---
  const detectedFolders = fileTemplateConfig.folders && Array.isArray(fileTemplateConfig.folders)
    ? fileTemplateConfig.folders
    : extractStructure(resolvedPath, resolvedPath, ignorePatterns);

  // --- CONTENT SELECTION (Root only) ---
  const { files: rootFiles, dirs: rootDirs } = getRootEntries(resolvedPath, ignorePatterns);

  let selectedFiles: string[] = [];
  let selectedFolders: string[] = [];
  let selectedStructure: string[] = [];
  let folders: FolderNode[];

  if (isUpdate) {
    // Additive mode for updates
    const existingTemplate = config.templates[updateTemplate];
    
    // New folders
    const newFolders = detectedFolders.filter((f: FolderNode) => !existingTemplate.folders?.some((ef: FolderNode) => ef.name === f.name));
    if (newFolders.length > 0) {
      const addedFolders = await promptNewFolders(newFolders, options);
      // Create new folders array preserving existing
      folders = [...existingTemplate.folders, ...addedFolders];
    } else {
      printNoNewFolders();
      folders = existingTemplate.folders;
    }

    // New files
    const newFiles = rootFiles.filter((f: string) => !existingTemplate.copy_files?.some((cf: CopyFileEntry) => cf.src === f));
    printNewFiles(newFiles.length, newFiles);
    const addedFiles = await promptNewFiles(newFiles, options);
    selectedFiles = [...(existingTemplate.copy_files?.filter((cf: CopyFileEntry) => !rootDirs.includes(cf.src)).map((cf: CopyFileEntry) => cf.src) || []), ...addedFiles];

    // Structure
    selectedStructure = existingTemplate.folders?.map((f: FolderNode) => f.name) || [];
    // Seed selectedFolders from existing copy_files directory entries
    selectedFolders = (existingTemplate.copy_files || [])
      .filter((f: CopyFileEntry) => rootDirs.includes(f.src))
      .map((f: CopyFileEntry) => f.src);

    if (rootDirs.length > 0) {
      const addedDirs = newFolders
        .filter((f: FolderNode) => ['APP', 'scripts', 'bin'].some(p => f.name === p))
        .map((f: FolderNode) => f.name);
      selectedStructure = [...new Set([...selectedStructure, ...addedDirs])];
      selectedFolders = [...new Set([...selectedFolders, ...addedDirs])];
    }
  } else {
    // New template - original behavior
    selectedFiles = await promptRootFiles(rootFiles, undefined, options);
    selectedStructure = await promptStructureFolders(rootDirs, options);
    selectedFolders = await promptCopyFolders(selectedStructure, undefined, options);
    folders = detectedFolders;
  }

  // --- COPY FILES ---
  const existingCopyFiles = isUpdate ? config.templates[updateTemplate].copy_files || [] : [];
  const copy_files = buildCopyFiles(selectedFiles, selectedFolders, existingCopyFiles);

  const templateConfig: TemplateConfig = {
    description: description,
    templateRoot: resolvedPath,
    folders: fileTemplateConfig.folders ? folders : folders.filter(f => selectedStructure.includes(f.name)),
    copy_files: copy_files,
    variables: variables.length > 0 ? variables : undefined
  };

  // --- POST_CONFIG ---
  const shPath = path.join(resolvedPath, 'post_config.sh');
  const batPath = path.join(resolvedPath, 'post_config.bat');
  const detectedTasks = parsePostConfigScript(shPath, batPath);

  let postConfigTasks: PostConfigTask[] = isUpdate ? config.templates[updateTemplate].post_config || [] : [];
  postConfigTasks = mergePostConfigTasks(postConfigTasks, fileTemplateConfig.post_config, detectedTasks);

  if (postConfigTasks.length > 0) {
    templateConfig.post_config = postConfigTasks;
    if (!options.json && !fileTemplateConfig.post_config) console.log(chalk.cyan(`Auto-detected ${postConfigTasks.length} post_config action(s) from script.`));
  }

  // Handle default_post_config tasks
  const defaultPostConfig = getDefaultPostConfig(config);
  const defaultApplicableTasks = defaultPostConfig.filter(t => !t.type || t.type === targetName);

  if (defaultApplicableTasks.length > 0) {
    const selectedTaskNames = await promptPostConfigTasks(defaultApplicableTasks, options);

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

  // --- POST_COPY (executables) ---
  const detectedExecutables = rootFiles
    .filter(file => isExecutable(path.join(resolvedPath, file), file))
    .filter(file => !shouldExcludeFile(file));

  const existingPostCopy = isUpdate ? config.templates[updateTemplate].post_copy || [] : [];
  const post_copy = mergePostCopyFiles(existingPostCopy, fileTemplateConfig.post_copy, detectedExecutables);

  if (post_copy.length > 0) {
    templateConfig.post_copy = post_copy;
    const postCopySrcs = post_copy.map(f => f.src);
    templateConfig.copy_files = templateConfig.copy_files?.filter(cf => !postCopySrcs.includes(cf.src));
  }

  // --- OUTPUT ---
  if (options.json) {
    const output = { name: targetName, ...templateConfig };
    process.stdout.write(JSON.stringify(output, null, 2) + '\n', () => {
      process.exit(0);
    });
    return;
  }

  config.templates[targetName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n✓ Template saved as "${targetName}"`));
}