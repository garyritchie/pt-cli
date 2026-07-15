import fs from 'fs';
import path from 'path';
import { FolderNode, TemplateConfig, CopyFileEntry, PostConfigTask, PostCopyFile, shouldIgnore, shouldExclude, shouldExcludeFile } from '../config.js';

/**
 * Extract folder structure skeleton from a directory
 * Only includes directories, with optional .info.md content
 */
export function extractStructure(dirPath: string, rootPath: string, ignorePatterns?: string[]): FolderNode[] {
  const nodes: FolderNode[] = [];
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
      let info = '';
      const gitkeepPath = path.join(fullPath, '.gitkeep.md');
      const infoPath = path.join(fullPath, '.info.md');
      if (fs.existsSync(infoPath)) info = fs.readFileSync(infoPath, 'utf-8').trim();
      else if (fs.existsSync(gitkeepPath)) info = fs.readFileSync(gitkeepPath, 'utf-8').trim();
      nodes.push({ name: entry.name, info, children });
    }
  } catch (e) {
    // Ignore directory read errors
  }
  return nodes;
}

/**
 * Scan text files in top-level and 1st-level subdirectories for {{ variable_name }} placeholders.
 */
export function findVariablesInFiles(dirPath: string, rootPath: string, ignorePatterns?: string[]): string[] {
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

/**
 * Check if a file is executable (by extension or permissions)
 */
export function isExecutable(fullPath: string, fileName: string): boolean {
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

/**
 * Parse .info.md file for name and description
 */
export function parseInfoFile(infoPath: string): { name: string; description: string } {
  let name = '';
  let description = '';
  if (fs.existsSync(infoPath)) {
    const content = fs.readFileSync(infoPath, 'utf-8');
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('# ')) {
        name = line.substring(2).trim();
      } else if (line.trim() !== '' && !description && !line.startsWith('#')) {
        description = line.trim();
      }
    }
  }
  return { name, description };
}

/**
 * Load JSON template config from .pt-template.json or template.json
 */
export function loadJsonTemplateConfig(dirPath: string): Partial<TemplateConfig> & { name?: string } {
  const jsonConfigPaths = [
    path.join(dirPath, '.pt-template.json'),
    path.join(dirPath, 'template.json')
  ];
  for (const jPath of jsonConfigPaths) {
    if (fs.existsSync(jPath)) {
      try {
        const content = fs.readFileSync(jPath, 'utf-8');
        return JSON.parse(content);
      } catch (e) {
        console.warn(`Warning: Failed to parse ${path.basename(jPath)}: ${(e as Error).message}`);
      }
    }
  }
  return {};
}

/**
 * Get root-level files and directories (for copy_files selection)
 */
export function getRootEntries(dirPath: string, ignorePatterns?: string[]): { files: string[]; dirs: string[] } {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .filter(e => !shouldExclude(dirPath, path.join(dirPath, e.name), ignorePatterns))
    .filter(e => !shouldIgnore(e.name, e.name, ignorePatterns));

  const files = entries.filter(e => e.isFile()).map(e => e.name);
  const dirs = entries.filter(e => e.isDirectory()).map(e => e.name);
  return { files, dirs };
}

/**
 * Detect executable files at root level
 */
export function detectRootExecutables(dirPath: string, ignorePatterns?: string[]): string[] {
  const { files } = getRootEntries(dirPath, ignorePatterns);
  return files.filter(file => isExecutable(path.join(dirPath, file), file));
}

/**
 * Parse post_config.sh or post_config.bat for commands
 */
export function parsePostConfigScript(shPath: string, batPath: string): PostConfigTask[] {
  const tasks: PostConfigTask[] = [];
  
  if (fs.existsSync(shPath)) {
    const lines = fs.readFileSync(shPath, 'utf-8').split('\n');
    let currentDesc = '';
    for (const line of lines) {
      if (line.startsWith('echo "Running: ')) {
        currentDesc = line.substring(15, line.length - 1).replace(/"$/, '');
      } else if (line.trim() && !line.startsWith('#') && !line.startsWith('echo ')) {
        tasks.push({ command: line.trim(), description: currentDesc || line.trim() });
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
        tasks.push({ command: line.trim(), description: currentDesc || line.trim() });
        currentDesc = '';
      }
    }
  }
  return tasks;
}

/**
 * Build copy_files array from selected files and folders
 */
export function buildCopyFiles(
  selectedFiles: string[],
  selectedFolders: string[],
  existingCopyFiles: CopyFileEntry[] = []
): CopyFileEntry[] {
  const copyFiles: CopyFileEntry[] = [];
  const existingSrcs = new Set(existingCopyFiles.map(e => e.src));

  // Start with existing entries (preserves substitute_variables, chmod settings)
  copyFiles.push(...existingCopyFiles);

  // Add new files
  for (const f of selectedFiles) {
    if (existingSrcs.has(f)) continue;
    copyFiles.push({ src: f, dest: f, substitute_variables: true });
  }
  // Add new directories
  for (const d of selectedFolders) {
    if (existingSrcs.has(d)) continue;
    copyFiles.push({ src: d, dest: d, substitute_variables: true });
  }
  return copyFiles;
}

/**
 * Merge post_config tasks from JSON config and/or detected scripts
 */
export function mergePostConfigTasks(
  existingTasks: PostConfigTask[],
  jsonTasks: PostConfigTask[] | undefined,
  detectedTasks: PostConfigTask[]
): PostConfigTask[] {
  let tasks = [...existingTasks];
  
  // JSON config takes precedence (full replacement)
  if (jsonTasks && jsonTasks.length > 0) {
    tasks = [...jsonTasks];
  } else if (detectedTasks.length > 0) {
    // Add detected tasks that don't already exist
    for (const dt of detectedTasks) {
      const exists = tasks.some(t => t.command === dt.command || (t.script && t.script === dt.script));
      if (!exists) tasks.push(dt);
    }
  }
  return tasks;
}

/**
 * Merge post_copy files from JSON config and/or detected executables
 */
export function mergePostCopyFiles(
  existingFiles: PostCopyFile[],
  jsonFiles: PostCopyFile[] | undefined,
  detectedFiles: string[]
): PostCopyFile[] {
  let files = [...existingFiles];
  
  if (jsonFiles && jsonFiles.length > 0) {
    for (const jf of jsonFiles) {
      if (!files.some(ef => ef.src === jf.src)) files.push(jf);
    }
  }
  
  for (const df of detectedFiles) {
    if (!files.some(ef => ef.src === df)) {
      files.push({ src: df, dest: df });
    }
  }
  return files;
}