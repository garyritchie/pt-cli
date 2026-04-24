# post-config Feature Plan

## Overview

After `pt init` creates the folder structure and files, run optional post-configuration tasks (git init, npm init, etc.). Tasks are defined in the template config and filtered by project type. Users opt in with a prompt.

---

## Goals

1. Run setup commands after project creation
2. Filter commands by project type
3. Cross-platform execution (macOS, Linux, Windows)
4. User-controlled (prompt before running, per-task confirmation)
5. Extensible for future task types

---

## Data Model

### Template Config Extension

Add to `TemplateConfig` in `src/config.ts`:

```typescript
export interface PostConfigTask {
  command?: string;       // shell command to run
  description: string;    // shown to user
  type?: string;          // only run for matching project type (optional)
  always_prompt?: boolean; // if true, ask per-task even if user says "yes"
  script?: string;        // path to script relative to template root
  cross_platform?: boolean; // if true, use platform-safe runner
}

export interface TemplateConfig {
  name: string;
  type: string;
  variables?: TemplateVariable[];
  folders: FolderNode[];
  exclude?: string[];
  copy_files?: CopyFileEntry[];
  post_config?: PostConfigTask[];  // NEW
}

export interface CopyFileEntry {
  src: string;       // relative to template root
  dest: string;      // relative to project root
  substitute_variables?: boolean;
  chmod?: string;    // e.g., "0755"
}
```

### Config File Format (YAML)

```yaml
# ~/.pt/config.yaml
templates:
  my_template:
    name: My Project
    type: documentation
    post_config:
      - command: "git init"
        description: "Initialize git repository"
        always_prompt: false
      - command: "git lfs install"
        description: "Install git-lfs hooks"
        always_prompt: false
      - command: "npm init -y"
        description: "Initialize npm project"
        type: "javascript"
    copy_files:
      - src: "templates/makerc.template"
        dest: "makerc"
        substitute_variables: true
```

---

## CLI Interface

### Command Line

```bash
pt init [type] [path] [--skip-post-config]
```

`--skip-post-config` flag bypasses the prompt entirely.

### Interactive Flow

1. User runs `pt init <type>`
2. Folder structure created ✓ (existing behavior)
3. **NEW**: Prompt: `Run post-config tasks? (y/N):`
   - If "N" → done
   - If "y" → show list and run:
     ```
     Post-config tasks for this template:

     [1/3] git init
           Initialize git repository
           (runs for all types)

     [2/3] git lfs install
           Install git-lfs hooks
           (runs for all types)

     [3/3] npm init -y
           Initialize npm project
           (only for type: javascript)
           -- skipped (type mismatch)

     Run the above tasks? (y/N):
     ```
4. If "y" → run each task, report success/failure
5. If "N" → skip, save to `~/.pt/config.yaml` under `defaults.skip_post_config = true` for this template (optional memory)

---

## Implementation Steps

### Step 1: Extend Config Types [DONE]

- Add `PostConfigTask` and `CopyFileEntry` interfaces to `src/config.ts` [DONE]
- Add `post_config?: PostConfigTask[]` and `copy_files?: CopyFileEntry[]` to `TemplateConfig` [DONE]
- Update `saveConfig` / `loadConfig` to handle new fields (already handled by YAML) [DONE]

### Step 2: Implement Variable Substitution [DONE]

- Create `src/substitute.ts` (or add to `init.ts`): [DONE]
  ```typescript
  export function substituteVariables(
    content: string,
    variables: Record<string, string>
  ): string {
    // Replace all {{var}} patterns with values
    return content.replace(/\{\{(\w+)\}\}/g, (_, varName) => {
      return variables[varName] ?? `{{${varName}}}`; // keep placeholder if missing
    });
  }
  ``` [DONE]
- Create a `CopyFile` function that: [DONE]
  1. Reads source file from template dir [DONE]
  2. If `substitute_variables`, runs substituteVariables [DONE]
  3. Writes to dest path (creates intermediate dirs) [DONE]
  4. If `chmod`, applies permissions (chmodSync for Unix, skip on Windows) [DONE]

### Step 3: Implement Copy File Logic [IN PROGRESS]

- Modify `init.ts` to process `copy_files` after `createStructure`: [IN PROGRESS]
  ```typescript
  // In init():
  const template = config.templates[typeName];
  
  // After createStructure() call:
  if (template.copy_files) {
    for (const copyFile of template.copy_files) {
      const srcPath = path.join(templateRoot, copyFile.src);
      const destPath = path.join(resolvedDest, copyFile.dest);
      
      if (!fs.existsSync(srcPath)) {
        console.warn(chalk.yellow(`Warning: ${copy.src} not found in template`));
        continue;
      }
      
      const content = fs.readFileSync(srcPath, 'utf-8');
      const finalContent = copyFile.substitute_variables && variables 
        ? substituteVariables(content, variables) 
        : content;
      
      fs.writeFileSync(destPath, finalContent);
      
      if (copyFile.chmod) {
        fs.chmodSync(destPath, parseInt(copyFile.chmod, 8));
      }
      
      console.log(chalk.green(`  ✓ ${copyFile.dest}`));
    }
  }
  ``` [IN PROGRESS]

### Step 4: Implement Post-Config Prompt & Runner [DONE]

- Create `src/postconfig.ts`: [DONE]
  ```typescript
  export async function runPostConfig(
    destPath: string,
    tasks: PostConfigTask[],
    projectType: string,
    skipPostConfig: boolean = false  // NOTE: added skip flag
  ): Promise<void> {
    // 1. Filter tasks by type
    const applicableTasks = tasks.filter(t => !t.type || t.type === projectType);
    
    if (applicableTasks.length === 0) {
      return; // nothing to do
    }
    
    // 2. Ask user
    const { run } = await inquirer.prompt({
      type: 'confirm',
      name: 'run',
      message: 'Run post-config tasks?',
      default: false
    });
    
    if (!run) return;
    
    // 3. Show and run each task
    for (let i = 0; i < applicableTasks.length; i++) {
      const task = applicableTasks[i];
      const progress = `[${i + 1}/${applicableTasks.length}]`;
      
      // For command tasks:
      if (task.command) {
        // Cross-platform shell execution
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd' : 'sh';
        const flag = isWindows ? '/c' : '-c';
        
        // Actually run:
        try {
          execSync(`${shell} ${flag} "${task.command}"`, {
            cwd: destPath,
            stdio: 'inherit'
          });
          console.log(chalk.green('✓'));
        } catch (err) {
          console.log(chalk.red('✗'));
        }
      }
      
      // For script tasks:
      if (task.script) {
        // Detect language from extension
        // node, python, bash, etc.
        // Run with appropriate runner
        console.log(chalk.yellow('(not yet implemented)'));
      }
    }
  }
  ``` [DONE]

### Step 5: Wire Into `init.ts` [DONE — partially in index.ts]

- In `init()`, after `createStructure`: [DONE]
  1. If `template.post_config` exists, call `runPostConfig(resolvedDest, template.post_config, template.type, skipPostConfig)` [DONE]
  2. Support `--skip-post-config` via Commander option [TODO — NOT YET DONE]
     - Current state: `init()` function accepts `skipPostConfig` param ✓
     - Current state: `init.ts` wires it through ✓
     - Current state: `index.ts` does NOT have `--skip-post-config` flag ✗ (calls `await init(typeName, destPath)` with 2 args only)
     - **Next**: Add `.option('--skip-post-config')` to the `init` command in `index.ts`

### Step 6: Cross-Platform Shims [PENDING]

- Create `src/platform.ts`: [PENDING]
  ```typescript
  // For tasks that need platform awareness:
  export function getShell(): { name: string; flag: string } {
    if (process.platform === 'win32') {
      // Try cmd first, fall back to git-bash, wsl
      return { name: 'cmd', flag: '/c' };
    }
    return { name: 'sh', flag: '-c' };
  }
  ``` [PENDING]
- For Windows, wrap commands in `sh -c` if git-bash or WSL detected. [PENDING]

### Step 7: Error Handling & Recovery [PENDING]

- Per-task: catch errors, log red ✗, continue to next task [PENDING]
- Per-task: optionally allow retry [PENDING]
- At end: summary of success/failure counts [PENDING]
- If all tasks fail, warn user but don't block project creation (creation already done) [PENDING]

---

## File Structure Changes

```
pt-cli/src/
├── config.ts       # DONE: Add PostConfigTask, CopyFileEntry types
├── init.ts         # DONE: Wire in post_config runner; copy_files is commented-out (pending templateRoot)
├── postconfig.ts   # DONE: post-config runner logic
├── substitute.ts   # DONE: variable substitution + processCopyFiles
├── platform.ts     # TODO: cross-platform shell detection (not yet created)
├── learn.ts        # TODO: needs update to store templateRoot in config
└── index.ts        # TODO: add --skip-post-config option
```

---

## Testing Strategy

1. **Unit test `substituteVariables`** — verify `{{var}}` replacement, missing vars handled
2. **Unit test `runPostConfig`** — mock execSync, verify calls
3. **Integration test** — `pt init` with a test template, verify files created and tasks run
4. **Cross-platform test** — verify shell detection on macOS/Linux/Windows

---

## Edge Cases

1. **Template root resolution** — `copy_files` cannot work without knowing where template source files live.
   - **Decision**: Store `templateRoot` in the template config entry during `learn`.
   - **Status**: NOT YET IMPLEMENTED. `learn.ts` must be updated to store `sourcePath` in the template config.
   - `TemplateConfig` needs a new field: `templateRoot?: string`.
   - `learn.ts` must add: `templateConfig.templateRoot = resolvedPath;` before saving.

2. **Missing template files** — warn and skip, don't block ✓ (implemented in `processCopyFiles`)

3. **Command not found** — catch execSync error, log red ✗, continue ✓ (implemented)

4. **Permission errors** — catch and log, warn user ✓ (chmod error handling in `processCopyFiles`)

5. **Git already initialized** — git init will error, catch silently or warn ✓ (caught by try/catch)

6. **Windows compatibility** — shell detection implemented ✓; chmod skip on Windows ✓; `platform.ts` shims for advanced cases pending.

7. **`--skip-post-config` CLI flag** — function signature supports it ✓; `index.ts` CLI option NOT yet added ✗.

---

## Implementation Order (Recommended)

1. ~~`substitute.ts`~~ ✓ DONE
2. ~~Extend `config.ts` types~~ ✓ DONE
3. **Store `templateRoot` in `learn.ts`** (add to `TemplateConfig` interface + save in `learn()`)
4. **Wire `copy_files` into `init.ts`** (activate the commented-out call, use `templateRoot` from config)
5. ~~`postconfig.ts` + prompt flow~~ ✓ DONE
6. **Add `--skip-post-config` to `index.ts`** (Commander `.option()`)
7. `platform.ts` cross-platform shims (if/when needed for Windows)
8. End-to-end test with a real template that has `post_config` and `copy_files`
9. Update README/ROADMAP
