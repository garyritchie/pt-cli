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

export interface UpdateOptions {
  ignore?: string;
  yes?: boolean;
  desc?: string;
  json?: boolean;
  allowUntrusted?: boolean;
  noDiff?: boolean;
}

export async function update(sourcePath: string, templateName: string, options: UpdateOptions = {}): Promise<void> {
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
  const existingNames = getTemplateNames(config);

  if (!config.templates[templateName]) {
    console.error(chalk.red(`Template "${templateName}" not found.`));
    process.exit(1);
  }

  // Check for template configuration JSON file
  const fileTemplateConfig = loadJsonTemplateConfig(resolvedPath);
  if (fileTemplateConfig && !options.json) {
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
        variables[existingIndex] = { ...variables[existingIndex], ...v };
      } else {
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
    const existingVarNames = new Set(config.templates[templateName].variables?.map(v => v.name) || []);
    const newVars = variables.filter(v => !existingVarNames.has(v.name));
    
    if (newVars.length > 0) {
      console.log(chalk.cyan(`\n📊 New Variables:`));
      console.log(chalk.green(`  + ${newVars.length} new variable(s): ${newVars.map(v => v.name).join(', ')}`));
      
      const selectedNewVars = await promptNewVariables(newVars, options);
      variables.push(...selectedNewVars);
    } else {
      printNoNewVariables();
    }
    
    // Also include default/global variables that are not already in the template
    const globalVarsToPrompt: TemplateVariable[] = [];
    if (config.variables && Array.isArray(config.variables)) {
      for (const v of config.variables) {
        if (!variables.some(existing => existing.name === v.name)) {
          globalVarsToPrompt.push({ ...v });
        }
      }
    }
    
    if (globalVarsToPrompt.length > 0) {
      const selectedGlobals = await promptGlobalVariables(globalVarsToPrompt, options);
      variables.push(...selectedGlobals);
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
      const selectedGlobals = await promptGlobalVariables(globalVarsToPrompt, options);
      variables.push(...selectedGlobals);
    }

    const additionalVars = await promptAdditionalVariables(variables, options);
    variables.push(...additionalVars);
  }

  // 1. Structure (skeleton) - Additive mode
  let folders: FolderNode[] = [];
  if (!isFullMode) {
    // Additive mode: only add new folders
    const detectedFolders = fileTemplateConfig.folders && Array.isArray(fileTemplateConfig.folders)
      ? fileTemplateConfig.folders
      : extractStructure(resolvedPath, resolvedPath, ignorePatterns);

    const existingFolders = config.templates[templateName].folders || [];
    const newFolders = detectedFolders.filter(f => !existingFolders.some(ef => ef.name === f.name));
    
    if (newFolders.length > 0) {
      console.log(chalk.cyan(`\n📊 New Folders:`));
      console.log(chalk.green(`  + ${newFolders.length} new folder(s): ${newFolders.map(f => f.name).join(', ')}`));
      
      const addedFolders = await promptNewFolders(newFolders, options);
      folders = [...existingFolders, ...addedFolders];
    } else {
      printNoNewFolders();
      folders = existingFolders;
    }
  } else {
    // Full mode: original behavior
    folders = fileTemplateConfig.folders && Array.isArray(fileTemplateConfig.folders)
      ? fileTemplateConfig.folders
      : extractStructure(resolvedPath, resolvedPath, ignorePatterns);
  }

  // 2. Content Selection (Root only)
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
    const existingCopyFiles = config.templates[templateName].copy_files || [];
    
    // New files
    const newFiles = rootFiles.filter(f => !existingCopyFiles.some(cf => cf.src === f));
    printNewFiles(newFiles.length, newFiles);
    const addedFiles = await promptNewFiles(newFiles, options);
    selectedFiles = [...existingCopyFiles.filter(cf => !rootDirs.includes(cf.src)).map(cf => cf.src), ...addedFiles];

    // Structure
    selectedStructure = config.templates[templateName].folders?.map(f => f.name) || [];
    // Seed selectedFolders from existing copy_files directory entries
    selectedFolders = existingCopyFiles
      .filter(f => rootDirs.includes(f.src))
      .map(f => f.src);

    if (rootDirs.length > 0) {
      const detectedFolders = fileTemplateConfig.folders && Array.isArray(fileTemplateConfig.folders)
        ? fileTemplateConfig.folders
        : extractStructure(resolvedPath, resolvedPath, ignorePatterns);
      const newFolders = detectedFolders.filter(f => !config.templates[templateName].folders?.some(ef => ef.name === f.name));
      
      const addedDirs = newFolders
        .filter(f => ['APP', 'scripts', 'bin'].some(p => f.name === p))
        .map(f => f.name);
      selectedStructure = [...new Set([...selectedStructure, ...addedDirs])];
      selectedFolders = [...new Set([...selectedFolders, ...addedDirs])];
    }
  } else {
    // Full mode: original behavior
    if (options.yes || options.json) {
      selectedFiles = rootFiles.filter(f => ['.makerc', 'readme.md', 'README.md', '.gitattributes', '.gitignore', 'Makefile', 'makefile', 'package.json'].some(p => f.toLowerCase() === p.toLowerCase()));
      selectedStructure = rootDirs;
      selectedFolders = rootDirs.filter(d => ['APP', 'scripts', 'bin'].some(p => d === p));
    } else {
      selectedFiles = await promptRootFiles(rootFiles, undefined, options);
      selectedStructure = await promptStructureFolders(rootDirs, options);
      selectedFolders = await promptCopyFolders(selectedStructure, undefined, options);
    }
  }

  const copy_files: CopyFileEntry[] = [];
  if (fileTemplateConfig.copy_files && Array.isArray(fileTemplateConfig.copy_files)) {
    copy_files.push(...fileTemplateConfig.copy_files);
  } else if (!isFullMode) {
    const existingCopyFiles = config.templates[templateName].copy_files || [];
    const existingSrcs = new Set(existingCopyFiles.map(e => e.src));

    copy_files.push(...existingCopyFiles);

    for (const f of selectedFiles) {
      if (existingSrcs.has(f)) continue;
      copy_files.push({ src: f, dest: f, substitute_variables: true });
    }
    for (const d of selectedFolders) {
      if (existingSrcs.has(d)) continue;
      copy_files.push({ src: d, dest: d, substitute_variables: true });
    }
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
    templateRoot: templateRoot,
    folders: fileTemplateConfig.folders ? folders : folders.filter(f => selectedStructure.includes(f.name)),
    copy_files: copy_files,
    variables: variables.length > 0 ? variables : undefined
  };

  // Check for post_config scripts
  const shPath = path.join(resolvedPath, 'post_config.sh');
  const batPath = path.join(resolvedPath, 'post_config.bat');
  const detectedTasks = parsePostConfigScript(shPath, batPath);

  let postConfigTasks: PostConfigTask[] = config.templates[templateName].post_config || [];
  postConfigTasks = mergePostConfigTasks(postConfigTasks, fileTemplateConfig.post_config, detectedTasks);

  if (postConfigTasks.length > 0) {
    templateConfig.post_config = postConfigTasks;
    if (!options.json && !fileTemplateConfig.post_config) console.log(chalk.cyan(`Auto-detected ${postConfigTasks.length} post_config action(s) from script.`));
  }

  // Handle default_post_config tasks
  const defaultPostConfig = getDefaultPostConfig(config);
  const defaultApplicableTasks = defaultPostConfig.filter(t => !t.type || t.type === templateName);

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

  // 3. Detect executables at root
  const detectedExecutables = rootFiles
    .filter(file => isExecutable(path.join(resolvedPath, file), file))
    .filter(file => !shouldExcludeFile(file));

  const existingPostCopy = config.templates[templateName].post_copy || [];
  const post_copy = mergePostCopyFiles(existingPostCopy, fileTemplateConfig.post_copy, detectedExecutables);

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

    process.stdout.write(JSON.stringify(output, null, 2) + '\n', () => {
      process.exit(0);
    });
    return;
  }

  config.templates[templateName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n✓ Template saved as "${templateName}"`));
}