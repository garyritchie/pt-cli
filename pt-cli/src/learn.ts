import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames, shouldExclude, shouldExcludeFile, PostConfigTask } from './config.js';
import chalk from 'chalk';

export interface TemplateVariable {
  name: string;
  prompt: string;
  default?: string;
  required?: boolean;
}

export async function learn(sourcePath: string, updateTemplate: string | null = null): Promise<void> {
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
      message: `Keep current type "${currentType}"?`,
      default: true
    });
    
    if (keepType) {
      type = currentType;
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

  const folders = extractStructure(resolvedPath, resolvedPath);
  
  if (folders.length === 0) {
    console.log(chalk.yellow("No folders found (excluding .git, node_modules, etc)."));
    return;
  }

  const templateConfig: TemplateConfig = {
    name: path.basename(resolvedPath),
    type: type,
    templateRoot: resolvedPath,    // store source path for copy_files
    folders: folders,
    variables: variables.length > 0 ? variables : undefined
  };

  // Auto-detect post-config patterns from source directory
  const detectedTasks = detectPostConfigPatterns(resolvedPath);
  if (detectedTasks.length > 0) {
    const { addPostConfig } = await inquirer.prompt({
      type: 'confirm',
      name: 'addPostConfig',
      message: `Auto-detected ${detectedTasks.length} post-config tasks (git init, npm init, etc.). Add to template?`,
      default: true
    });
    if (addPostConfig) {
      templateConfig.post_config = detectedTasks;
    }
  }

  config.templates[targetName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n${isUpdate ? '✓ Template updated' : '✓ Template learned'} "${targetName}" and saved to ~/.pt/config.yaml`));
  console.log(chalk.gray(`  Type: ${type}`));
  console.log(chalk.gray(`  Folders: ${folders.length}`));
  console.log(chalk.gray(`  Source: ${resolvedPath}`));
  if (variables.length > 0) {
    console.log(chalk.gray(`  Variables: ${variables.map(v => v.name).join(', ')}`));
  }
  if (templateConfig.post_config) {
    console.log(chalk.cyan(`  Post-config tasks: ${templateConfig.post_config.map(t => t.command || t.script).join(', ')}`));
  }
}

/**
 * Detect common project patterns and suggest post-config tasks.
 */
export function detectPostConfigPatterns(sourcePath: string): PostConfigTask[] {
  const tasks: PostConfigTask[] = [];

  // Check for .git directory
  if (fs.existsSync(path.join(sourcePath, '.git'))) {
    tasks.push({
      command: 'git init',
      description: 'Initialize git repository',
      always_prompt: false
    });
    // Check for large file support patterns
    if (fs.existsSync(path.join(sourcePath, '.gitattributes')) ||
        fs.existsSync(path.join(sourcePath, 'lfs'))) {
      tasks.push({
        command: 'git lfs install',
        description: 'Install git-lfs hooks',
        always_prompt: false
      });
    }
  }

  // Check for package.json (Node.js)
  if (fs.existsSync(path.join(sourcePath, 'package.json'))) {
    tasks.push({
      command: 'npm install',
      description: 'Install npm dependencies',
      type: 'javascript',
      always_prompt: false
    });
  }

  // Check for requirements.txt (Python)
  if (fs.existsSync(path.join(sourcePath, 'requirements.txt'))) {
    tasks.push({
      command: 'pip install -r requirements.txt',
      description: 'Install Python dependencies',
      type: 'python',
      always_prompt: false
    });
  }

  // Check for setup.py or pyproject.toml
  if (fs.existsSync(path.join(sourcePath, 'setup.py')) ||
      fs.existsSync(path.join(sourcePath, 'pyproject.toml'))) {
    tasks.push({
      command: 'pip install -e .',
      description: 'Install package in editable mode',
      type: 'python',
      always_prompt: false
    });
  }

  // Check for Makefile (common for build tasks)
  if (fs.existsSync(path.join(sourcePath, 'Makefile'))) {
    tasks.push({
      command: 'make init',
      description: 'Run project makefile init target',
      always_prompt: true
    });
  }

  return tasks;
}

function extractStructure(dirPath: string, rootPath: string): FolderNode[] {
  let nodes: FolderNode[] = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Use shouldExclude from config instead of hardcoded list
      if (shouldExclude(dirPath, fullPath)) {
        continue;
      }
      
      if (entry.isDirectory()) {
        const children = extractStructure(fullPath, rootPath);
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
