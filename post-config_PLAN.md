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

### Step 1: Extend Config Types

- Add `PostConfigTask` and `CopyFileEntry` interfaces to `src/config.ts`
- Add `post_config?: PostConfigTask[]` and `copy_files?: CopyFileEntry[]` to `TemplateConfig`
- Update `saveConfig` / `loadConfig` to handle new fields (already handled by YAML)

### Step 2: Implement Variable Substitution

- Create `src/substitute.ts` (or add to `init.ts`):
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
  ```
- Create a `CopyFile` function that:
  1. Reads source file from template dir
  2. If `substitute_variables`, runs substituteVariables
  3. Writes to dest path (creates intermediate dirs)
  4. If `chmod`, applies permissions (chmodSync for Unix, skip on Windows)

### Step 3: Implement Copy File Logic

- Modify `init.ts` to process `copy_files` after `createStructure`:
  ```typescript
  // In init():
  const template = config.templates[typeName];
  
  // After createStructure() call:
  if (template.copy_files) {
    for (const copyFile of template.copy_files) {
      const srcPath = path.join(templateRoot, copyFile.src);
      const destPath = path.join(resolvedDest, copyFile.dest);
      
      if (!fs.existsSync(srcPath)) {
        console.warn(chalk.yellow(`Warning: ${copyFile.src} not found in template`));
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
  ```

### Step 4: Implement Post-Config Prompt & Runner

- Create `src/postconfig.ts`:
  ```typescript
  export async function runPostConfig(
    destPath: string,
    tasks: PostConfigTask[],
    projectType: string
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
      
      // For command tasks:
      if (task.command) {
        // Cross-platform shell execution
        const isWindows = process.platform === 'win32';
        const shell = isWindows ? 'cmd' : 'sh';
        const flag = isWindows ? '/c' : '-c';
        
        // Actually run:
        const { execSync } = require('child_process');
        try {
          execSync(`${shell} ${flag} "${task.command}"`, {
            cwd: destPath,
            stdio: 'inherit'
          });
          console.log(chalk.green(`  ✓ ${task.command}`));
        } catch (err) {
          console.error(chalk.red(`  ✗ ${task.command} failed`));
        }
      }
      
      // For script tasks:
      if (task.script) {
        // Detect language from extension
        // node, python, bash, etc.
        // Run with appropriate runner
      }
    }
  }
  ```

### Step 5: Wire Into `init.ts`

- In `init()`, after `createStructure`:
  1. If `template.post_config` exists, call `runPostConfig(resolvedDest, template.post_config, template.type)`
  2. Support `--skip-post-config` via inquirer prompt or Commander option

### Step 6: Cross-Platform Shims

- Create `src/platform.ts`:
  ```typescript
  // For tasks that need platform awareness:
  export function getShell(): { name: string; flag: string } {
    if (process.platform === 'win32') {
      // Try cmd first, fall back to git-bash, wsl
      return { name: 'cmd', flag: '/c' };
    }
    return { name: 'sh', flag: '-c' };
  }
  ```
- For Windows, wrap commands in `sh -c` if git-bash or WSL detected.

### Step 7: Error Handling & Recovery

- Per-task: catch errors, log red ✗, continue to next task
- Per-task: optionally allow retry
- At end: summary of success/failure counts
- If all tasks fail, warn user but don't block project creation (creation already done)

---

## File Structure Changes

```
pt-cli/src/
├── config.ts       # Add PostConfigTask, CopyFileEntry types
├── init.ts         # Wire in post-config + copy_files
├── postconfig.ts   # NEW: post-config runner logic
├── substitute.ts   # NEW: variable substitution function
├── platform.ts     # NEW: cross-platform shell detection
├── learn.ts        # No changes needed (variables already stored)
└── index.ts        # Add --skip-post-config option
```

---

## Testing Strategy

1. **Unit test `substituteVariables`** — verify `{{var}}` replacement, missing vars handled
2. **Unit test `runPostConfig`** — mock execSync, verify calls
3. **Integration test** — `pt init` with a test template, verify files created and tasks run
4. **Cross-platform test** — verify shell detection on macOS/Linux/Windows

---

## Edge Cases

1. **Template root resolution** — need to know where the template files live. Options:
   - Store `templateRoot` path in config alongside each template
   - Use the `sourcePath` from `pt learn` (already available)
   - Let user specify template root at init time
   **Decision**: Store `templateRoot` in the template config entry during `learn`, or use the source directory of the last `learn` for that template.

2. **Missing template files** — warn and skip, don't block

3. **Command not found** — catch execSync error, log red ✗, continue

4. **Permission errors** — catch and log, warn user

5. **Git already initialized** — git init will error, catch silently or warn

6. **Windows compatibility** — shell detection, chmod skip on Windows

---

## Implementation Order (Recommended)

1. `substitute.ts` + unit test
2. Extend `config.ts` types
3. `copy_files` logic in `init.ts`
4. `postconfig.ts` + prompt flow
5. `platform.ts` cross-platform shims
6. Wire everything into `init.ts`
7. End-to-end test
8. Update README/ROADMAP
