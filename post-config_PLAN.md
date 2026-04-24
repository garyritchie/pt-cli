# post-config Feature Plan

## Overview

After `pt init` creates the folder structure and files, run optional post-configuration tasks (git init, npm init, etc.). Tasks are defined in the template config and filtered by project type. Users opt in with a prompt.

## Implementation Status

**COMPLETED** (April 24, 2026)

All steps implemented and tested:

- [x] `PostCopyFile` type + `post_copy` field in `TemplateConfig`
- [x] `detectExecutables()` in `learn.ts` — auto-detects `.sh`, `.py`, `.bat`, `Makefile`, `*.mk`
- [x] `templateRoot` storage during `pt learn`
- [x] `post_copy` prompt during `pt learn` (with user confirmation)
- [x] `copy_files` processing in `init.ts` (variable substitution + chmod)
- [x] `post_copy` processing in `init.ts` (with auto-chmod for executables)
- [x] `--skip-post-config` CLI flag in `index.ts`
- [x] `pt config` output shows `templateRoot`, `post_config`, and `post_copy`
- [x] Built-in defaults mapping (javascript, python, godot, blender, documentation)
- [x] Cross-platform shell detection

## Files Modified

| File | Changes |
|------|---------|
| `src/config.ts` | Added `PostCopyFile` interface, `post_copy` field |
| `src/learn.ts` | Added `detectExecutables()`, `templateRoot` storage, `post_copy` prompt |
| `src/init.ts` | Wired `copy_files`, added `post_copy` step before `post_config` |
| `src/index.ts` | Added `--skip-post-config` option, enhanced `pt config` output |
| `src/postconfig.ts` | Built-in defaults, baked-in defaults per type |
| `src/substitute.ts` | Variable substitution + `processCopyFiles()` |
| `src/platform.ts` | Cross-platform shell detection |

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

- Add `PostConfigTask`, `CopyFileEntry`, `PostCopyFile` interfaces to `src/config.ts` ✓
- Add `post_config?: PostConfigTask[]`, `copy_files?: CopyFileEntry[]`, `post_copy?: PostCopyFile[]` to `TemplateConfig` ✓
- Add `templateRoot?: string` to `TemplateConfig` (set by `pt learn`) ✓
- YAML handles all new fields automatically ✓

### Step 2: Implement Variable Substitution [DONE]

- `src/substitute.ts` — `substituteVariables()` replaces `{{var}}` patterns ✓
- `processCopyFiles()` — reads source, substitutes vars, writes with chmod ✓

### Step 3: Wire `copy_files` Into `init.ts` [DONE]

- Uncommented `processCopyFiles()` call ✓
- Uses `template.templateRoot` as source path ✓
- Conditional: only runs if `template.copy_files && template.templateRoot` ✓

### Step 4: Implement Post-Config Prompt & Runner [DONE]

- `src/postconfig.ts` — `runPostConfig()` filters by type, prompts, executes ✓
- Built-in defaults mapping per project type (javascript, python, godot, blender, documentation) ✓
- Cross-platform shell detection (cmd on Windows, sh on Unix) ✓
- Per-task error handling (catch, log red ✗, continue) ✓

### Step 5: Wire Into `init.ts` [DONE]

- After `createStructure()`: calls `runPostConfig()` if `template.post_config` exists ✓
- `--skip-post-config` CLI flag wired in `index.ts` ✓
- Passes `skipPostConfig` boolean through init flow ✓

### Step 6: `learn.ts` — Store `templateRoot` [DONE]

- `templateConfig.templateRoot = resolvedPath;` added before config save ✓
- Unblocks `copy_files` and `post_copy` source resolution ✓

### Step 7: `learn.ts` — Auto-Detect Executables for `post_copy` [DONE]

- `detectExecutables()` scans root for `.sh`, `.bat`, `.cmd`, `.py`, `Makefile`, `*.mk` ✓
- Presents detected files to user with prompt ✓
- User confirms via `Add to post_copy? (y/N):` ✓
- Sets `templateConfig.post_copy` on confirmation ✓

### Step 8: `init.ts` — Process `post_copy` [DONE]

- After `copy_files`, iterates `template.post_copy` ✓
- Copies each file from `templateRoot` to project root ✓
- Auto-applies `0o755` chmod for `.sh`, `.py`, `.bash`, `.bat` ✓
- Missing files: warn and skip, don't block ✓

### Step 9: Cross-Platform Shims [DONE]

- `cmd /c` on Windows, `sh -c` on Unix ✓
- chmod skipped on Windows (try/catch) ✓

### Step 10: Error Handling & Recovery [DONE]

- Per-task: catch errors, log red ✗, continue ✓
- If all tasks fail: warn but don't block project creation ✓
- Missing template files: warn and skip ✓

---

## File Structure Changes

```
pt-cli/src/
├── config.ts       # PostConfigTask, CopyFileEntry, PostCopyFile types + templateRoot
├── init.ts         # copy_files + post_copy + post_config wired
├── postconfig.ts   # Post-config runner + baked-in defaults
├── substitute.ts   # Variable substitution + processCopyFiles
├── platform.ts     # Cross-platform shell detection
├── learn.ts        # templateRoot storage + executable auto-detection
└── index.ts        # --skip-post-config option + enhanced pt config output
```

---

## Testing

1. **Integration test** — `pt init test_postcopy /tmp/pt-output` verified all three steps (copy_files, post_copy, post_config) ✓
2. **config.js** — variable substitution confirmed (`{{client_name}}` placeholder preserved) ✓
3. **deploy.sh** — auto-chmod (0755) confirmed ✓
4. **--skip-post-config** flag verified ✓
5. **pt config** output shows templateRoot, post_config, post_copy ✓

---

## Edge Cases

1. **Missing template files** — warn and skip, don't block ✓
2. **Command not found** — caught silently, logged as ✗ ✓
3. **Permission errors** — try/catch, logged ✓
4. **Git already initialized** — caught silently ✓
5. **Windows compatibility** — cmd /c shell; chmod skipped via try/catch ✓
6. **`--skip-post-config` flag** — bypasses entire prompt ✓
7. **post_copy with dest override** — supports `dest` field for renaming ✓

---

## Implementation Order (Recommended)

1. ✅ `substitute.ts`
2. ✅ Extend `config.ts` types
3. ✅ `learn.ts` — Store `templateRoot`
4. ✅ `learn.ts` — Auto-detect `post_copy`
5. ✅ Wire `copy_files` into `init.ts`
6. ✅ Process `post_copy` in `init.ts`
7. ✅ Post-config runner
8. ✅ `--skip-post-config` CLI flag
9. ✅ Error handling
10. ✅ End-to-end test
11. ✅ Update README/ROADMAP
