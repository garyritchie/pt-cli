import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { loadConfig, FolderNode, sanitizePath, TemplateConfig, TemplateVariable, PostConfigTask, PtConfig } from '../config.js';
import chalk from 'chalk';
import { processCopyFiles, substituteVariables } from '../substitute.js';
import { execSync } from 'child_process';

export interface InitOptions {
  skipPostConfig?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  vars?: string;
  file?: string;
  collision?: 'overwrite' | 'newest';
  json?: boolean;
}

interface LoadedTemplate {
  name: string;
  template: TemplateConfig;
  sourceFile?: string;
}

/**
 * Recursively merges two arrays of FolderNodes, deduplicating matching folder names.
 * Sub-children are recursively merged, and later nodes take precedence for info/is_file.
 */
export function mergeFolderNodes(nodesA: FolderNode[], nodesB: FolderNode[]): FolderNode[] {
  const map = new Map<string, FolderNode>();

  function cloneNode(node: FolderNode): FolderNode {
    return {
      name: node.name,
      info: node.info,
      is_file: node.is_file,
      children: node.children ? node.children.map(cloneNode) : undefined
    };
  }

  for (const node of nodesA) {
    map.set(node.name, cloneNode(node));
  }

  for (const node of nodesB) {
    if (map.has(node.name)) {
      const existing = map.get(node.name)!;
      if (node.info) {
        existing.info = node.info;
      }
      if (node.is_file !== undefined) {
        existing.is_file = node.is_file;
      }
      if (node.children && node.children.length > 0) {
        existing.children = mergeFolderNodes(existing.children || [], node.children);
      }
    } else {
      map.set(node.name, cloneNode(node));
    }
  }

  return Array.from(map.values());
}

/**
 * Merges variables across multiple templates.
 * Variables with the same name are deduplicated; later templates override default values.
 */
export function mergeVariables(templates: LoadedTemplate[]): TemplateVariable[] {
  const varMap = new Map<string, TemplateVariable>();
  for (const { template } of templates) {
    if (!template.variables) continue;
    for (const v of template.variables) {
      if (varMap.has(v.name)) {
        const existing = varMap.get(v.name)!;
        varMap.set(v.name, {
          name: v.name,
          prompt: v.prompt || existing.prompt,
          default: v.default !== undefined ? v.default : existing.default,
          required: v.required !== undefined ? v.required : existing.required
        });
      } else {
        varMap.set(v.name, { ...v });
      }
    }
  }
  return Array.from(varMap.values());
}

/**
 * Checks if a given destination path corresponds to a root-level readme.md file.
 */
export function isRootReadme(filePath: string): boolean {
  const norm = sanitizePath(filePath).replace(/\\/g, '/');
  const parts = norm.split('/').filter(Boolean);
  return parts.length === 1 && /^readme\.md$/i.test(parts[0]);
}

/**
 * Scan parent directories for .env files and parse their variables.
 */
function scanEnvForVariables(targetPath: string): Record<string, string> {
  const envVars: Record<string, string> = {};
  let currentDir = path.resolve(targetPath);
  const maxDepth = 5;

  for (let depth = 0; depth < maxDepth; depth++) {
    const envPath = path.join(currentDir, '.env');

    if (fs.existsSync(envPath)) {
      try {
        const content = fs.readFileSync(envPath, 'utf-8');
        const lines = content.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) {
            continue;
          }

          const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
          if (match) {
            const key = match[1];
            let value = match[2];

            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }

            envVars[key] = value;
          }
        }
      } catch (err) {
        continue;
      }
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  return envVars;
}

export async function init(
  targetOrArgs?: string | string[] | undefined,
  destPathOrOptions?: string | InitOptions,
  optionsOrUndefined?: InitOptions
) {
  const config = loadConfig();

  let rawTemplates: string[] = [];
  let dest: string | undefined;
  let options: InitOptions = {};

  if (Array.isArray(targetOrArgs)) {
    options = (destPathOrOptions as InitOptions) || {};
    if (targetOrArgs.length === 0) {
      rawTemplates = [];
      dest = undefined;
    } else if (targetOrArgs.length === 1) {
      if (options.file) {
        rawTemplates = [options.file];
        dest = targetOrArgs[0];
      } else {
        rawTemplates = [targetOrArgs[0]];
        dest = undefined;
      }
    } else {
      if (options.file) {
        rawTemplates = [options.file, ...targetOrArgs.slice(0, -1)];
      } else {
        rawTemplates = targetOrArgs.slice(0, -1);
      }
      dest = targetOrArgs[targetOrArgs.length - 1];
    }
  } else if (typeof targetOrArgs === 'string') {
    if (typeof destPathOrOptions === 'string') {
      dest = destPathOrOptions;
      options = optionsOrUndefined || {};
    } else if (destPathOrOptions !== undefined) {
      dest = undefined;
      options = (destPathOrOptions as InitOptions) || {};
    } else {
      dest = undefined;
      options = optionsOrUndefined || {};
    }
    if (options.file && !dest) {
      dest = targetOrArgs;
      rawTemplates = [options.file];
    } else {
      rawTemplates = options.file ? [options.file, targetOrArgs] : [targetOrArgs];
    }
  } else {
    // targetOrArgs is undefined
    if (typeof destPathOrOptions === 'string') {
      dest = destPathOrOptions;
      options = optionsOrUndefined || {};
    } else if (destPathOrOptions !== undefined) {
      dest = undefined;
      options = (destPathOrOptions as InitOptions) || {};
    } else {
      dest = undefined;
      options = optionsOrUndefined || {};
    }
    if (options.file) {
      rawTemplates = [options.file];
    }
  }

  // Interactive selection if no templates specified
  if (rawTemplates.length === 0) {
    const names = Object.keys(config.templates);
    if (names.length === 0) {
      const msg = "No templates found. Run 'pt learn <path>' first.";
      if (options.json) {
        console.error(JSON.stringify({ status: 'error', message: msg }));
      } else {
        console.log(chalk.red(msg));
      }
      process.exit(1);
    }

    if (options.yes) {
      const msg = "No project type specified and running in non-interactive mode.";
      if (options.json) {
        console.error(JSON.stringify({ status: 'error', message: msg }));
      } else {
        console.error(chalk.red(msg));
      }
      process.exit(1);
    }

    const { selected } = await inquirer.prompt({
      type: 'checkbox',
      name: 'selected',
      message: 'Select Project Type(s):',
      loop: false,
      validate: (answer) => (answer.length < 1 ? 'You must choose at least one template.' : true),
      theme: {
        icon: {
          checked: chalk.green('[x] '),
          unchecked: '[ ] '
        }
      },
      choices: names.map(n => ({ name: n, value: n }))
    });
    rawTemplates = selected;
  }

  // Load each template configuration
  const loadedTemplates: LoadedTemplate[] = [];
  for (const item of rawTemplates) {
    // Check if item is a local json file path or exists on disk
    if (item.endsWith('.json') || fs.existsSync(item)) {
      try {
        const resolvedPath = path.resolve(item);
        const fileContent = fs.readFileSync(resolvedPath, 'utf-8');
        const parsed = JSON.parse(fileContent);
        const name = parsed.name || path.basename(item, path.extname(item));

        if (parsed.templateRoot && !path.isAbsolute(parsed.templateRoot)) {
          parsed.templateRoot = path.resolve(path.dirname(resolvedPath), parsed.templateRoot);
        } else if (!parsed.templateRoot) {
          parsed.templateRoot = path.dirname(resolvedPath);
        }

        loadedTemplates.push({
          name,
          template: parsed,
          sourceFile: resolvedPath
        });
      } catch (e: any) {
        const msg = `Failed to read/parse template file "${item}": ${e.message}`;
        if (options.json) {
          console.error(JSON.stringify({ status: 'error', message: msg }));
        } else {
          console.error(chalk.red(`Error: ${msg}`));
        }
        process.exit(1);
      }
    } else {
      const template = config.templates[item];
      if (!template) {
        const msg = `Template "${item}" not found.`;
        if (options.json) {
          console.error(JSON.stringify({ status: 'error', message: msg }));
        } else {
          console.error(chalk.red(msg));
        }
        process.exit(1);
      }
      loadedTemplates.push({
        name: item,
        template: JSON.parse(JSON.stringify(template)) // Clone to prevent mutating config
      });
    }
  }

  // Prompt for destination if not provided
  if (!dest) {
    if (options.yes) {
      const msg = "No destination path specified and running in non-interactive mode.";
      if (options.json) {
        console.error(JSON.stringify({ status: 'error', message: msg }));
      } else {
        console.error(chalk.red(msg));
      }
      process.exit(1);
    }
    const { name } = await inquirer.prompt({
      type: 'input',
      name: 'name',
      message: 'Project path/folder name:'
    });
    dest = name;
  }

  const resolvedDest = path.resolve(dest!);

  if (fs.existsSync(resolvedDest) && !options.dryRun) {
    const msg = `Destination "${resolvedDest}" already exists.`;
    if (options.json) {
      console.error(JSON.stringify({ status: 'error', message: msg }));
    } else {
      console.error(chalk.red(`Error: ${msg}`));
    }
    process.exit(1);
  }

  const templateNames = loadedTemplates.map(l => l.name);
  const compositeDescription = loadedTemplates.length === 1
    ? (loadedTemplates[0].template.description || '')
    : loadedTemplates.map(l => `${l.name}: ${l.template.description || ''}`).join('; ');

  if (!options.json) {
    if (options.dryRun) {
      console.log(chalk.yellow(`\n[DRY RUN] Initializing project "${compositeDescription}" at: ${resolvedDest}`));
    } else {
      console.log(chalk.cyan(`\nInitializing project "${compositeDescription}" at: ${resolvedDest}`));
    }
  }

  // Merge Variables
  const mergedVarsDef = mergeVariables(loadedTemplates);
  let variables: Record<string, string> = {};

  if (mergedVarsDef.length > 0) {
    // Scan parent directories for .env files and pre-fill variables
    const envVars = scanEnvForVariables(resolvedDest);
    if (Object.keys(envVars).length > 0) {
      for (const [key, value] of Object.entries(envVars)) {
        if (!variables[key]) {
          variables[key] = value;
        }
      }
    }

    if (options.vars) {
      const pairs = options.vars.split(',').map((p: string) => p.trim());
      for (const pair of pairs) {
        const [k, ...v] = pair.split('=');
        if (k && v.length > 0) {
          variables[k.trim()] = v.join('=').trim();
        }
      }
    }

    if (!options.yes) {
      for (const v of mergedVarsDef) {
        if (!variables[v.name]) {
          const answer = await inquirer.prompt({
            type: 'input',
            name: v.name,
            message: v.prompt || `Enter ${v.name}:`,
            default: v.default || ''
          });
          variables[v.name] = answer[v.name];
        }
      }
    } else {
      for (const v of mergedVarsDef) {
        if (!variables[v.name]) {
          if (v.required) {
            const msg = `Variable "${v.name}" is required but was not provided in non-interactive mode. Use --vars ${v.name}=value`;
            if (options.json) {
              console.error(JSON.stringify({ status: 'error', message: msg }));
            } else {
              console.error(chalk.red(`Error: ${msg}`));
            }
            process.exit(1);
          } else {
            variables[v.name] = v.default || '';
          }
        }
      }
    }
  }

  // 1. Create structure (deep merge folders across all templates)
  let mergedFolders: FolderNode[] = [];
  for (const { template } of loadedTemplates) {
    if (template.folders) {
      mergedFolders = mergeFolderNodes(mergedFolders, template.folders);
    }
  }
  createStructure(resolvedDest, mergedFolders, options.dryRun, options.json);

  // 2. Readme renaming logic
  const templatesWithReadme: LoadedTemplate[] = [];
  for (const lt of loadedTemplates) {
    const hasReadme = (lt.template.copy_files || []).some(cf => isRootReadme(cf.dest || cf.src));
    if (hasReadme) {
      templatesWithReadme.push(lt);
    }
  }

  const createdReadmes: string[] = [];
  if (templatesWithReadme.length > 1) {
    // Multiple templates have a root readme -> rename based on origin template name while preserving case
    for (const lt of templatesWithReadme) {
      for (const cf of lt.template.copy_files || []) {
        const targetDest = cf.dest || cf.src;
        if (isRootReadme(targetDest)) {
          const baseName = path.basename(targetDest);
          const match = baseName.match(/^(readme)(.*)(\.md)$/i);
          let newDest: string;
          if (match) {
            newDest = `${match[1]}${match[2]}_${lt.name}${match[3]}`;
          } else {
            newDest = `readme_${lt.name}.md`;
          }
          cf.dest = newDest;
          createdReadmes.push(newDest);
        }
      }
    }
  } else if (templatesWithReadme.length === 1) {
    // Exactly one template has a root readme -> keep standard name
    for (const cf of templatesWithReadme[0].template.copy_files || []) {
      const targetDest = cf.dest || cf.src;
      if (isRootReadme(targetDest)) {
        createdReadmes.push(targetDest);
      }
    }
  }

  // 3. Process copy_files for each template
  const collisionMode = options.collision || 'overwrite';
  for (const lt of loadedTemplates) {
    const template = lt.template;
    const templateRootExists = template.templateRoot && fs.existsSync(template.templateRoot);
    if (template.templateRoot && !templateRootExists) {
      if (!options.json) {
        console.warn(chalk.yellow(`\nWarning: Template source directory not found: ${template.templateRoot}`));
        console.warn(chalk.gray("Folder structure created, but files/boilerplate will be skipped."));
      }
    }

    if (template.copy_files && templateRootExists) {
      if (!options.json) {
        if (options.dryRun) console.log(chalk.yellow(`[DRY RUN] Processing copy_files for ${lt.name}...`));
        else console.log(chalk.cyan(`Processing copy_files for ${lt.name}...`));
      }
      await processCopyFiles(
        template.templateRoot!,
        resolvedDest,
        template,
        variables,
        options.dryRun,
        collisionMode,
        options.json
      );
    }

    // 4. Process post_copy (executable scripts)
    if (template.post_copy && templateRootExists) {
      if (!options.json) {
        if (options.dryRun) console.log(chalk.yellow(`[DRY RUN] Processing post_copy for ${lt.name}...`));
        else console.log(chalk.cyan(`Processing post_copy for ${lt.name}...`));
      }

      for (const file of template.post_copy) {
        const srcPath = path.join(template.templateRoot!, file.src);
        const destPath = path.join(resolvedDest, sanitizePath(file.dest || file.src));

        if (fs.existsSync(srcPath)) {
          if (options.dryRun) {
            if (!options.json) {
              console.log(chalk.gray(`  [DRY RUN] Would copy ${file.src} → ${file.dest || file.src}`));
              console.log(chalk.gray(`  [DRY RUN] Would chmod +x ${file.dest || file.src}`));
            }
            continue;
          }

          if (collisionMode === 'newest' && fs.existsSync(destPath)) {
            const destStat = fs.statSync(destPath);
            const srcStat = fs.statSync(srcPath);
            if (destStat.mtimeMs > srcStat.mtimeMs) {
              if (!options.json) {
                console.log(chalk.yellow(`  [COLLISION] Destination is newer, keeping ${file.dest || file.src}`));
              }
              continue;
            }
          }

          let fileContent = fs.readFileSync(srcPath, 'utf-8');
          if (mergedVarsDef.length > 0) {
            fileContent = substituteVariables(fileContent, variables);
          }

          const destDir = path.dirname(destPath);
          fs.mkdirSync(destDir, { recursive: true });
          fs.writeFileSync(destPath, fileContent);

          try {
            const srcStat = fs.statSync(srcPath);
            fs.chmodSync(destPath, srcStat.mode & 0o111 ? srcStat.mode : 0o755);
          } catch (e) {}

          if (!options.json) console.log(chalk.green("  ✓ " + (file.dest || file.src)));
        } else if (!options.json) {
          console.warn(chalk.yellow("  ! " + file.src + " not found, skipping"));
        }
      }
    }
  }

  // 5. Write .info.md
  if (!options.dryRun) {
    let infoContent = '';
    if (loadedTemplates.length === 1) {
      infoContent = `# ${loadedTemplates[0].name}\n\n${loadedTemplates[0].template.description || ''}\n`;
    } else {
      infoContent = `# ${templateNames.join(', ')}\n\n`;
      for (const lt of loadedTemplates) {
        infoContent += `## ${lt.name}\n${lt.template.description || ''}\n\n`;
      }
    }
    fs.writeFileSync(path.join(resolvedDest, '.info.md'), infoContent);
  } else if (!options.json) {
    console.log(chalk.gray(`  [DRY RUN] Would create .info.md`));
  }

  // 6. Collect and deduplicate post_config tasks from all templates
  // Key: command|description -> { task, templates: string[], _id: string }
  const taskMap = new Map<string, PostConfigTask & { templates: string[]; _id: string }>();
  let taskIdCounter = 0;
  
  for (const lt of loadedTemplates) {
    if (lt.template.post_config) {
      for (const t of lt.template.post_config) {
        if (!t.type || t.type === lt.name) {
          const key = `${t.command || t.script || ''}|${t.description || ''}`;
          if (taskMap.has(key)) {
            taskMap.get(key)!.templates.push(lt.name);
          } else {
            taskMap.set(key, { 
              ...t, 
              templates: [lt.name], 
              _id: `task_${taskIdCounter++}` 
            });
          }
        }
      }
    }
  }
  
  const allTasks = Array.from(taskMap.values());

  if (allTasks.length > 0 && !options.skipPostConfig) {
    // SECURITY CHECK: Validate template safety (aggregate across all templates)
    const { validateTemplateSecurity } = await import('../safety.js');
    
    // Collect all errors and warnings from all templates first
    const allErrors: Array<{ template: string; error: string }> = [];
    const allWarnings: Array<{ template: string; warning: string }> = [];
    
    for (const lt of loadedTemplates) {
      const { valid, errors, warnings } = validateTemplateSecurity(lt.template);
      
      for (const err of errors) {
        allErrors.push({ template: lt.name, error: err });
      }
      for (const warn of warnings) {
        allWarnings.push({ template: lt.name, warning: warn });
      }
    }
    
    // Handle errors - any blocked command aborts everything
    if (allErrors.length > 0) {
      if (!options.json) {
        console.error(chalk.red(`\n❌ SECURITY ERROR: Aborting post_config execution due to blocked commands:`));
        for (const { template, error } of allErrors) {
          console.error(chalk.red(`   [${template}] ${error}`));
        }
      }
      process.exit(1);
    }
    
    // Handle warnings - single aggregated prompt for all templates
    if (allWarnings.length > 0) {
      if (!options.json) {
        console.warn(chalk.yellow(`\n⚠️  SECURITY WARNING: Post-config tasks contain dangerous commands:`));
        for (const { template, warning } of allWarnings) {
          console.warn(chalk.yellow(`   [${template}] ${warning}`));
        }
      }
      
      if (!options.yes) {
        const { proceed } = await inquirer.prompt({
          type: 'confirm',
          name: 'proceed',
          message: chalk.red(`Security warnings found in ${new Set(allWarnings.map(w => w.template)).size} template(s). Run post-config tasks anyway?`),
          default: false
        });
        if (!proceed) {
          if (!options.json) console.log(chalk.yellow("Post-config tasks aborted by user."));
          return;
        }
      } else if (!options.json) {
        console.warn(chalk.yellow("Proceeding anyway (non-interactive mode with auto-confirm enabled)."));
      }
    }

    let selectedTaskIds: string[] = [];

    if (options.dryRun) {
      selectedTaskIds = allTasks.map(t => t._id);
      if (!options.json) {
        console.log(chalk.yellow(`\n[DRY RUN] Applicable post-config tasks:`));
        for (const t of allTasks) {
          const desc = t.description ? ` (${t.description})` : '';
          const templatesNote = t.templates.length > 1 ? ` [${t.templates.join(', ')}]` : ` [${t.templates[0]}]`;
          console.log(chalk.gray(`  ${t.command || `./${t.script}`}${desc}${templatesNote}`));
        }
      }
    } else if (options.yes) {
      selectedTaskIds = allTasks.map(t => t._id);
    } else {
      const choices: Array<{name: string; value: string; checked?: boolean}> = [];

      for (const t of allTasks) {
        const cmd = t.command || `./${t.script}` || '(no command)';
        const desc = t.description ? ` (${t.description})` : '';
        const templatesNote = t.templates.length > 1 ? ` [${t.templates.join(', ')}]` : ` [${t.templates[0]}]`;
        choices.push({
          name: `${cmd}${desc}${templatesNote}`,
          value: t._id,
          checked: true
        });
      }

      const response = await inquirer.prompt({
        type: 'checkbox',
        name: 'selected',
        message: 'Select post-config tasks to run:',
        loop: false,
        theme: {
          icon: {
            checked: chalk.green('[x] '),
            unchecked: '[ ] ',
          }
        },
        choices
      });
      selectedTaskIds = response.selected || [];
    }

    if (selectedTaskIds.length > 0 && !options.dryRun) {
      let bashContent = '#!/bin/bash\n# Auto-generated post_config script\n\n';
      let batContent = '@echo off\n:: Auto-generated post_config script\n\n';
      for (const t of allTasks) {
        let cmd = '';
        if (t.command) {
          cmd = t.command;
        } else if (t.script) {
          cmd = `./${t.script}`;
        }
        if (selectedTaskIds.includes(t._id)) {
          if (cmd) {
            bashContent += `echo "Running: ${t.description || cmd}"\n${cmd}\n`;
            batContent += `echo Running: ${t.description || cmd}\n${cmd}\n`;
          }
        }
      }
      fs.writeFileSync(path.join(resolvedDest, 'post_config.sh'), bashContent);
      try { fs.chmodSync(path.join(resolvedDest, 'post_config.sh'), 0o755); } catch(e) {}
      fs.writeFileSync(path.join(resolvedDest, 'post_config.bat'), batContent);

      if (!options.json) console.log(chalk.cyan("\nExecuting post-config tasks..."));
      try {
        const scriptCmd = process.platform === 'win32' ? 'post_config.bat' : './post_config.sh';
        execSync(scriptCmd, {
          cwd: resolvedDest,
          stdio: options.json ? 'ignore' : 'inherit'
        });
      } catch (e) {
        if (!options.json) console.error(chalk.red("\nError: Some post-config tasks failed. Check the output above."));
      }
    }
  }

  if (options.json) {
    const result = {
      status: 'success',
      dryRun: !!options.dryRun,
      dest: resolvedDest,
      templates: templateNames,
      variables,
      readmes: createdReadmes
    };
    console.log(JSON.stringify(result, null, 2));
  } else if (options.dryRun) {
    console.log(chalk.yellow(`\n[DRY RUN] Project initialization preview complete.`));
  } else {
    console.log(chalk.green(`\n✓ Project created successfully.`));
  }
}

function createStructure(dirPath: string, folders: FolderNode[], dryRun: boolean = false, silent: boolean = false) {
  for (const folder of folders) {
    const fullDirPath = path.join(dirPath, sanitizePath(folder.name));

    if (dryRun) {
      if (!silent) console.log(chalk.gray(`  [DRY RUN] Would create directory: ${fullDirPath}`));
    } else {
      fs.mkdirSync(fullDirPath, { recursive: true });
    }

    if (folder.info) {
      const infoPath = path.join(fullDirPath, '.info.md');
      if (dryRun) {
        if (!silent) console.log(chalk.gray(`  [DRY RUN] Would create info file: ${infoPath}`));
      } else {
        fs.writeFileSync(infoPath, folder.info);
      }
    }

    if (folder.children && folder.children.length > 0) {
      createStructure(fullDirPath, folder.children, dryRun, silent);
    }
  }
}