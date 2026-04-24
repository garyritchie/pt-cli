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
    const { keepType } = await inquirer.prompt({
      type: 'confirm',
      name: 'keepType',
      message: `Change type from "${currentType}"?`,
      default: true
    });
    
    if (keepType) {
      type = currentType;
    } else {
      console.log(chalk.yellow('Available types (use existing or create new):'));
      for (const name of getTemplateNames(config)) {
        console.log(chalk.gray(`  - ${name}`));
      }
      const typeChoice = await inquirer.prompt({
        type: 'list',
        name: 'type',
        message: 'Select Project Type:',
        choices: [
          ...existingNames.map(n => ({ name: `Use existing: ${n}`, value: n })),
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
    const typeChoice = await inquirer.prompt({
      type: 'list',
      name: 'type',
      message: 'Select Project Type:',
      choices: [
        ...existingNames.map(n => ({ name: `Use existing: ${n}`, value: n })),
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

  // Merge CLI --ignore patterns with config's ignore list
  const cliIgnore = ignoreArgs ? ignoreArgs.split(',').map(s => s.trim()).filter(Boolean) : [];
  const ignorePatterns = [...(config.ignore || []), ...cliIgnore];
  if (ignorePatterns.length > 0 && !isUpdate) {
    console.log(chalk.cyan("\nIgnore patterns active:"));
    for (const p of ignorePatterns) {
      console.log(chalk.gray("  - " + p));
    }
  }

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
      message: 'Define variables as comma-separated names (e.g., client_name,project_type):',
      default: 'client_name,project_name'
    });
    variables = variableDefs.split(',').map((v: string) => ({
      name: v.trim(),
      prompt: `Enter ${v.trim()}:`,
      required: true
    }));
  }

  const folders = extractStructure(resolvedPath, resolvedPath, ignorePatterns);
  const allFiles = collectFiles(resolvedPath, resolvedPath, ignorePatterns);
  
  if (folders.length === 0 && allFiles.length === 0) {
    console.log(chalk.yellow("No folders or files found (excluding .git, node_modules, etc)."));
    return;
  }

  const templateConfig: TemplateConfig = {
    name: path.basename(resolvedPath),
    type: type,
    templateRoot: resolvedPath,    // absolute path to source directory
    folders: folders,
    copy_files: allFiles,
    variables: variables.length > 0 ? variables : undefined
  };


  // Auto-detect executable files at project root
  const detectedExecutables = detectExecutables(resolvedPath);
  let post_copy: PostCopyFile[] | undefined;
  
  if (detectedExecutables.length > 0) {
    console.log(chalk.cyan("\nAuto-detected " + detectedExecutables.length + " executable file(s) at project root:"));
    for (const file of detectedExecutables) {
      // find description
      let desc = '';
      const patterns = [
        { name: '*.sh', desc: 'shell script' },
        { name: '*.py', desc: 'Python script' },
        { name: '*.bat', desc: 'batch file' },
        { name: '*.cmd', desc: 'batch file' },
        { name: 'Makefile', desc: 'makefile' },
        { name: '*.mk', desc: 'makefile include' },
      ];
      for (const pat of patterns) {
        if (pat.name === 'Makefile') {
          if (file === 'Makefile') desc = pat.desc;
        } else if (pat.name === '*.mk') {
          if (file.endsWith('.mk')) desc = pat.desc;
        } else {
          if (path.extname(file) === pat.name.substring(1)) desc = pat.desc;
        }
        if (desc) break;
      }
      console.log(chalk.gray("  - " + file + " (" + desc + ")"));
    }
    
    const { addPostCopy } = await inquirer.prompt({
      type: 'confirm',
      name: 'addPostCopy',
      message: 'Add these to post_copy (copied during pt init)?',
      default: true
    });
    
    if (addPostCopy) {
      post_copy = detectedExecutables.map(f => ({ src: f, dest: f }));
      // Remove these from copy_files to avoid duplication
      if (templateConfig.copy_files) {
        templateConfig.copy_files = templateConfig.copy_files.filter(cf => !detectedExecutables.includes(cf.src));
      }
    }
  }
  if (post_copy) {
    templateConfig.post_copy = post_copy;
  }
  config.templates[targetName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n${isUpdate ? '✓ Template updated' : '✓ Template learned'} "${targetName}" and saved to ~/.pt/config.yaml`));
  console.log(chalk.gray(`  Type: ${type}`));
  console.log(chalk.gray(`  Folders: ${folders.length}`));
  if (variables.length > 0) {
    console.log(chalk.gray(`  Variables: ${variables.map(v => v.name).join(', ')}`));
  }
}


/**
 * Scan the root of the template directory for executable/script files.
 * Returns filenames relative to the project root.
 */
export function detectExecutables(sourcePath: string): string[] {
  const executablePatterns = [
    { name: '*.sh', desc: 'shell script' },
    { name: '*.py', desc: 'Python script' },
    { name: '*.bat', desc: 'batch file' },
    { name: '*.cmd', desc: 'batch file' },
    { name: 'Makefile', desc: 'makefile' },
    { name: 'makefile', desc: 'makefile' },
    { name: '*.mk', desc: 'makefile include' },
  ];
  
  let detected: string[] = [];
  
  try {
    const entries = fs.readdirSync(sourcePath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      
      // Skip files that should be excluded (common data/config/doc files)
      if (shouldExcludeFile(entry.name)) continue;
      if (shouldExclude(sourcePath, path.join(sourcePath, entry.name))) continue;
      
      // Also skip dotfiles unless they match a specific pattern (like .sh)
      if (entry.name.startsWith('.') && !entry.name.endsWith('.sh') && !entry.name.endsWith('.py')) {
        continue;
      }

      const fullPath = path.join(sourcePath, entry.name);
      let desc = '';
      let found = false;
      
      // Check by extension first
      for (const pat of executablePatterns) {
        if (pat.name === 'Makefile' || pat.name === 'makefile') {
          if (entry.name === pat.name) { desc = pat.desc; found = true; break; }
        } else if (pat.name === '*.mk') {
          if (entry.name.endsWith('.mk')) { desc = pat.desc; found = true; break; }
        } else {
          const ext = path.extname(entry.name);
          const expectedExt = pat.name.substring(1);
          if (ext === expectedExt) { desc = pat.desc; found = true; break; }
        }
      }
      
      // If no extension match, check if file has execute permission
      if (!found) {
        try {
          const stat = fs.statSync(fullPath);
          const mode = stat.mode;
          // Check if any execute bit is set (user, group, or other)
          if (mode & 0o111) {
            desc = 'executable';
            found = true;
          }
        } catch {
          // Skip files we can't stat
        }
      }
      
      if (found) {
        detected.push(entry.name);
      }
    }
  } catch (e) {
    // Skip permission errors
  }
  
  return detected;
}

function collectFiles(dirPath: string, rootPath: string, ignorePatterns?: string[]): any[] {
  let files: any[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);

      if (shouldExclude(dirPath, fullPath, ignorePatterns)) continue;
      if (shouldIgnore(entry.name, relativePath, ignorePatterns)) continue;

      if (entry.isDirectory()) {
        files = files.concat(collectFiles(fullPath, rootPath, ignorePatterns));
      } else if (entry.isFile()) {
        files.push({
          src: relativePath,
          dest: relativePath,
          substitute_variables: true
        });
      }
    }
  } catch (e) {}
  return files;
}

function extractStructure(dirPath: string, rootPath: string, ignorePatterns?: string[]): FolderNode[] {
  let nodes: FolderNode[] = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(rootPath, fullPath);
      
      // Check ignore patterns first
      if (entry.isDirectory() && shouldIgnore(entry.name, relativePath, ignorePatterns)) {
        continue;
      }
      
      // Use shouldExclude from config instead of hardcoded list
      if (shouldExclude(dirPath, fullPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const children = extractStructure(fullPath, rootPath, ignorePatterns);
        let info = "";
        
        const gitkeepPath = path.join(fullPath, '.gitkeep.md');
        const infoPath = path.join(fullPath, '.info.md');
        
        if (fs.existsSync(gitkeepPath)) {
          info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
        } else if (fs.existsSync(infoPath)) {
          info = fs.readFileSync(infoPath, 'utf-8').trim();
        }
        
        nodes.push({
          name: entry.name,
          info: info,
          children: children
        });
      }
    }
  } catch (e) {
    // Skip permission errors
  }
  
  return nodes;
}
