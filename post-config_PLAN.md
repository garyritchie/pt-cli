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

## Clarification: Copy Files vs Post-Copy

**`copy_files`** — General-purpose file copying from `templateRoot` (the directory scanned during `pt learn`). Supports variable substitution and chmod. Used for arbitrary template files (config templates, `.info.md`, etc.).

**`post_copy`** — Simplified variant specifically for executables/scripts. Stores filenames (relative to `templateRoot`) that should be copied during `pt init`. Auto-detected by `pt learn` from the source directory.

**The folder structure already exists** before any file copying — `createStructure()` writes `.info.md` from `folder.info` during structure creation. No separate `.info.md` copy step is needed.

---

## Data Model

### Config File Format (YAML)

```yaml
# ~/.pt/config.yaml
templates:
  my_template:
    name: My Project
    type: javascript
    templateRoot: /path/to/source/directory  # set by `pt learn`
    copy_files:
      - src: "templates/makerc.template"
        dest: "makerc"
        substitute_variables: true
      - src: "scripts/setup.sh"
        dest: "bin/setup.sh"
        chmod: "0755"
    post_copy:
      - src: "bin/deploy.sh"
        dest: "bin/deploy.sh"
      - src: "scripts/lint.py"
        dest: "scripts/lint.py"
      - src: "Makefile"
        dest: "Makefile"
    post_config:
      - command: "git init"
        description: "Initialize git repository"
      - command: "npm install"
        description: "Install npm dependencies"
        type: "javascript"
```

### TypeScript Interfaces

```typescript
export interface PostConfigTask {
  command?: string;
  description: string;
  type?: string;
  always_prompt?: boolean;
  script?: string;
  cross_platform?: boolean;
}

export interface PostCopyFile {
  src: string;       // relative to templateRoot
  dest?: string;     // relative to project root (defaults to src)
}

export interface CopyFileEntry {
  src: string;       // relative to templateRoot
  dest: string;      // relative to project root
  substitute_variables?: boolean;
  chmod?: string;
}

export interface TemplateConfig {
  name: string;
  type: string;
  templateRoot?: string;      // absolute path set by `pt learn`
  variables?: TemplateVariable[];
  folders: FolderNode[];
  exclude?: string[];
  copy_files?: CopyFileEntry[];
  post_copy?: PostCopyFile[];  // auto-detected executables/scripts
  post_config?: PostConfigTask[];
}
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
2. Folder structure created ✓ (existing behavior, `.info.md` written from `folder.info`)
3. **NEW**: Prompt: `Run post-config tasks? (y/N):`
   - If "N" → done
   - If "y" → show list and run:
     ```
     Post-config tasks for this template:

     [1/3] git init
           Initialize git repository
           (runs for all types)

     [2/3] npm install
           Install npm dependencies
           (only for type: javascript)
           -- skipped (type mismatch)

     Run the above tasks? (y/N):
     ```
4. If "y" → run each task, report success/failure

---

## Order of Operations

This is critical — the folder structure must exist before any file copying:

1. **Create folder structure** — `createStructure()` creates all folders, writes `.info.md` from `folder.info`
2. **Copy `copy_files`** — copy from `templateRoot` to project root (with optional variable substitution and chmod)
3. **Copy `post_copy`** — copy executable scripts from `templateRoot` to project root
4. **Execute post-config tasks** — run shell commands in the project root

---

## Implementation Steps

### Step 1: Extend Config Types [DONE]

- Add `PostConfigTask`, `CopyFileEntry`, `PostCopyFile` interfaces to `src/config.ts` [DONE]
- Add `post_config?: PostConfigTask[]` and `copy_files?: CopyFileEntry[]` to `TemplateConfig` [DONE]
- Add `post_copy?: PostCopyFile[]` to `TemplateConfig` [TODO — needs update]
- Update `saveConfig` / `loadConfig` to handle new fields (already handled by YAML) [DONE]

### Step 2: Implement Variable Substitution [DONE]

- Create `src/substitute.ts` [DONE]
  - `substituteVariables()` — replace `{{var}}` patterns
  - `processCopyFiles()` — reads source, substitutes, writes with chmod

### Step 3: Wire `copy_files` Into `init.ts` [TODO]

- Current state: `copy_files` call is commented out because `templateRoot` isn't set
- `init.ts` line 59-61: `await processCopyFiles('', resolvedDest, template, {});`
- Once `templateRoot` is set by `learn.ts`, uncomment and use `template.templateRoot`
- **Status**: NOT YET IMPLEMENTED — depends on `learn.ts` storing `templateRoot`

### Step 4: Implement Post-Config Prompt & Runner [DONE]

- Create `src/postconfig.ts` [DONE]
  - `runPostConfig()` — filter by type, prompt, execute each task
  - Cross-platform shell detection (cmd on Windows, sh on Unix)
  - Per-task error handling (catch, log red ✗, continue)

### Step 5: Wire Into `init.ts` [DONE]

- In `init()`, after `createStructure()`: [DONE]
  1. If `template.post_config` exists, call `runPostConfig(resolvedDest, template.post_config, template.type, skipPostConfig)` [DONE]
  2. Support `--skip-post-config` via Commander option [DONE — added to `index.ts`]

### Step 6: `learn.ts` — Store `templateRoot` [TODO]

- **Status**: NOT YET IMPLEMENTED. `learn.ts` must be updated to store `resolvedPath` as `templateRoot` in the template config before saving.
- `TemplateConfig` already has `templateRoot?: string` field ✓
- `learn.ts` must add: `templateConfig.templateRoot = resolvedPath;` before saving
- This is the critical fix that unblocks `copy_files`

### Step 7: `learn.ts` — Auto-Detect Executables for `post_copy` [TODO]

- After extracting folder structure, scan root for executable files:
  - `.sh` (shell scripts)
  - `.bat` / `.cmd` (batch files)
  - `.py` (Python scripts)
  - `Makefile` / `*.mk` (makefiles)
- Present detected files to user:
  ```
  Auto-detected executable files:
    - bin/deploy.sh
    - scripts/lint.py
    - Makefile

  Add to post_copy? (y/N):
  ```
- If user says "N", allow manual entry or skip
- If "Y", set `templateConfig.post_copy` with detected files

### Step 8: `init.ts` — Process `post_copy` [TODO]

- After `copy_files`, process `post_copy`:
  ```typescript
  if (template.post_copy && template.templateRoot) {
    for (const file of template.post_copy) {
      const srcPath = path.join(template.templateRoot, file.src);
      const destPath = path.join(resolvedDest, file.dest || file.src);
      
      if (fs.existsSync(srcPath)) {
        const content = fs.readFileSync(srcPath, 'utf-8');
        fs.writeFileSync(destPath, content);
        if (file.src.endsWith('.sh') || file.src.endsWith('.py') || file.src.endsWith('.bash')) {
          fs.chmodSync(destPath, 0o755);
        }
        console.log(chalk.green(`  ✓ ${file.dest || file.src}`));
      } else {
        console.warn(chalk.yellow(`  ! ${file.src} not found, skipping`));
      }
    }
  }
  ```

### Step 9: Cross-Platform Shims [TODO]

- For now, use simple `cmd /c` on Windows, `sh -c` on Unix
- If git-bash or WSL detected on Windows, prefer `sh -c`
- chmod is skipped on Windows

### Step 10: Error Handling & Recovery

- Per-task: catch errors, log red ✗, continue to next task [DONE]
- Per-task: optionally allow retry [TODO]
- At end: summary of success/failure counts [TODO]
- If all tasks fail: warn but don't block project creation [DONE — creation already done]
- Missing template files: warn and skip, don't block

---

## File Structure Changes

```
pt-cli/src/
├── config.ts       # DONE: Add PostConfigTask, CopyFileEntry types + templateRoot
├── init.ts         # DONE: Wire post_config + copy_files placeholder
├── postconfig.ts   # DONE: Post-config runner logic
├── substitute.ts   # DONE: Variable substitution + processCopyFiles
├── platform.ts     # TODO: cross-platform shell detection
├── learn.ts        # TODO: Store templateRoot + auto-detect post_copy
└── index.ts        # DONE: Add --skip-post-config option
```

---

## Testing Strategy

1. **Unit test `substituteVariables`** — verify `{{var}}` replacement, missing vars handled
2. **Unit test `runPostConfig`** — mock execSync, verify calls
3. **Integration test** — `pt init` with a test template, verify files created and tasks run
4. **Cross-platform test** — verify shell detection on macOS/Linux/Windows

---

## Edge Cases

1. **Template root resolution** — `copy_files` and `post_copy` both need `templateRoot` to know where template source files live.
   - **Decision**: Store `templateRoot` in the template config entry during `learn`.
   - **Status**: NOT YET IMPLEMENTED. `learn.ts` must be updated to store `resolvedPath` in the template config.
   - `TemplateConfig` already has `templateRoot?: string` ✓
   - `learn.ts` must add: `templateConfig.templateRoot = resolvedPath;` before saving. ✗

2. **Missing template files** — warn and skip, don't block [TODO — needs implementation]

3. **Command not found** — catch execSync error, log red ✗, continue [DONE]

4. **Permission errors** — catch and log, warn user [TODO — needs implementation]

5. **Git already initialized** — git init will error, caught silently [DONE — try/catch]

6. **Windows compatibility** — shell detection [DONE — cmd /c]; chmod skip on Windows [TODO]; `platform.ts` shims for advanced cases [TODO]

7. **`--skip-post-config` CLI flag** — function signature supports it [DONE]; `index.ts` CLI option [DONE]

---

## Implementation Order (Recommended)

1. ~~`substitute.ts`~~ ✓ DONE
2. ~~Extend `config.ts` types~~ ✓ DONE
3. **`learn.ts` — Store `templateRoot`** [PRIORITY — unblocks copy_files]
4. **`learn.ts` — Auto-detect `post_copy`** [PRIORITY]
5. ~~Wire `copy_files` into `init.ts`~~ (unblocks once `templateRoot` is stored)
6. **Process `post_copy` in `init.ts`** [PRIORITY]
7. ~~Post-config runner~~ ✓ DONE
8. ~~`--skip-post-config` CLI flag~~ ✓ DONE
9. ~~Error handling~~ (per-task error handling mostly done; summary counts TBD)
10. `platform.ts` cross-platform shims (if/when needed for Windows)
11. End-to-end test
12. Update README/ROADMAP
