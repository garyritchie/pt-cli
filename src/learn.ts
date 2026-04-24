import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames, shouldExclude, shouldExcludeFile } from './config.js';
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
    folders: folders,
    variables: variables.length > 0 ? variables : undefined
  };

  config.templates[targetName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n${isUpdate ? '✓ Template updated' : '✓ Template learned'} "${targetName}" and saved to ~/.pt/config.yaml`));
  console.log(chalk.gray(`  Type: ${type}`));
  console.log(chalk.gray(`  Folders: ${folders.length}`));
  if (variables.length > 0) {
    console.log(chalk.gray(`  Variables: ${variables.map(v => v.name).join(', ')}`));
  }
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
