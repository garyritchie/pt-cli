import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { loadConfig, saveConfig, FolderNode, TemplateConfig, getTemplateNames } from './config.js';
import chalk from 'chalk';

export async function learn(sourcePath: string) {
  const resolvedPath = path.resolve(sourcePath);
  
  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`Error: Path "${sourcePath}" does not exist.`));
    process.exit(1);
  }

  console.log(chalk.cyan(`\nScanning structure: ${resolvedPath}`));
  
  // 1. Extract structure
  const folders = extractStructure(resolvedPath, resolvedPath);
  
  if (folders.length === 0) {
    console.log(chalk.yellow("No folders found (excluding .git, node_modules, etc)."));
    return;
  }

  // 2. Get template name/type
  const config = loadConfig();
  const existingNames = getTemplateNames(config);
  
  const { newName } = await inquirer.prompt({
    type: 'input',
    name: 'newName',
    message: 'Name this template:',
    default: path.basename(resolvedPath)
  });

  const typeChoice = await inquirer.prompt({
    type: 'list',
    name: 'type',
    message: 'Select Project Type:',
    choices: [
      ...existingNames.map(n => ({ name: `Use existing: ${n}`, value: n })),
      { name: '(Create new type)', value: '__NEW__' }
    ]
  });

  let type = typeChoice.type;
  if (type === '__NEW__') {
    const { newTypeName } = await inquirer.prompt({
      type: 'input',
      name: 'newTypeName',
      message: 'New type name:'
    });
    type = newTypeName;
  }

  // 3. Update config
  const templateConfig: TemplateConfig = {
    name: newName,
    type: type,
    folders: folders
  };

  config.templates[newName] = templateConfig;
  saveConfig(config);

  console.log(chalk.green(`\n✓ Template "${newName}" learned and saved to ~/.pt/config.yaml`));
  console.log(chalk.gray(`  Type: ${type}`));
  console.log(chalk.gray(`  Folders: ${folders.length}`));
}

function extractStructure(dirPath: string, rootPath: string): FolderNode[] {
  let nodes: FolderNode[] = [];
  
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    
    // Filter out noisy directories/files
    const ignoreList = ['.git', 'node_modules', 'dist', 'build', '.DS_Store'];
    
    for (const entry of entries) {
      if (ignoreList.includes(entry.name)) continue;
      if (entry.name.startsWith('.')) continue; // Hidden files generally
      
      const fullPath = path.join(dirPath, entry.name);
      const relPath = path.relative(rootPath, fullPath);
      
      if (entry.isDirectory()) {
        // Recurse
        const children = extractStructure(fullPath, rootPath);
        let info = "";
        
        // Check for .gitkeep.md
        const gitkeepPath = path.join(fullPath, '.gitkeep.md');
        if (fs.existsSync(gitkeepPath)) {
          info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
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
