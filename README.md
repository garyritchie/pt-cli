# pt - Project Template CLI

A CLI tool for learning directory structures as templates and initializing new projects from them.

## Features

- Learn any directory structure and save it as a reusable template
- Initialize new projects from learned templates
- Define template variables for customization
- Auto-detect and suggest post-config tasks during `pt learn`
- Baked-in defaults for common project types (javascript, python, godot, etc.)
- Copy additional files from template with variable substitution (`copy_files`)
- Auto-detect executable scripts for `post_copy` during `pt learn`
- Built-in file/folder exclusion patterns
- `--skip-post-config` flag to bypass post-config prompt
- Enhanced `pt config` output (shows templateRoot, post_config, post_copy)
- YAML-based configuration at `~/.pt/config.yaml`

## Installation

### Prerequisites

- Node.js 16+
- npm 8+

### Setup

```bash
cd pt-cli
npm install
npm run build
```

### Usage (global)

```bash
npm link
```

This makes `pt` available globally.

### Usage (local)

```bash
pt <command>
```

## Usage

### Learn a template

```bash
# Learn a new template (auto-detects post-config tasks)
pt learn /path/to/project

# Update an existing template (use current directory if no path given)
pt update <template_name>
pt update <template_name> /path/to/project

# Ignore specific folders during learning
pt learn /path/to/project --ignore=DAILIES/*,PARKING_LOT/*,REFERENCE/*
```

### Initialize a project

```bash
# Initialize from a template (auto-suggests post-config tasks)
pt init <template_name> /path/to/new/project

# Skip post-config tasks
pt init <template_name> /path/to/new/project --skip-post-config
```

### Show config and templates

```bash
pt config
```

Shows all templates, their `post_config` tasks (if any), source paths, and an example post-config block.

## Configuration

Config is stored at `~/.pt/config.yaml` and contains:

- `version`: Config version
- `templates`: Dictionary of learned templates with folder structure, `templateRoot`, `copy_files`, `post_copy`, and `post_config`

### Template Variables

When learning a template, you can define variables that will be prompted during initialization:

```bash
# Learn with variables
pt learn /path/to/project
# When prompted: Define template variables? (y/n)
# Enter variables as comma-separated names: client_name,project_name
```

These variables are then used during `copy_files` operations to replace `{{variable_name}}` placeholders in copied files.

### Post-Config Tasks

Post-config tasks are optional commands that run after a project is initialized. They can be defined in a template or auto-detected from the source directory.

**Auto-detection** (`pt learn`):

When learning a template, `pt` scans the source directory for common patterns and suggests post-config tasks:

| Pattern                        | Auto-detected task                | Type filter |
| ------------------------------ | --------------------------------- | ----------- |
| `.git/`                        | `git init`                        | all         |
| `package.json`                 | `npm install`                     | javascript  |
| `requirements.txt`             | `pip install -r requirements.txt` | python      |
| `setup.py` or `pyproject.toml` | `pip install -e .`                | python      |
| `Makefile`                     | `make init`                       | all         |

**Baked-in defaults** (by project type):

If a template has no `post_config` defined, `pt init` auto-suggests defaults:

```
javascript:  [git init, npm install]
python:      [git init, python -m venv .venv, pip install -r requirements.txt]
godot:       [git init, git lfs install]
blender:     [git init, git lfs install]
documentation: [git init]
default:     [git init]
```

**Manual definition** in `config.yaml`:

```yaml
templates:
  my_template:
    name: My Project
    type: javascript
    post_config:
      - command: "git init"
        description: "Initialize git repository"
      - command: "npm install"
        description: "Install npm dependencies"
        type: "javascript"
      - command: "git lfs install"
        description: "Install git-lfs hooks"
        always_prompt: true
      - script: "bin/setup.sh"
        description: "Run custom setup script"
```

Each task supports:

| Field            | Description                                                                      |
| ---------------- | -------------------------------------------------------------------------------- |
| `command`        | Shell command to run (auto-selected shell: `cmd /c` on Windows, `sh -c` on Unix) |
| `description`    | Shown to user during prompt                                                      |
| `type`           | Filter by project type (e.g., `javascript`)                                      |
| `always_prompt`  | If `true`, ask per-task even if user says "yes"                                  |
| `script`         | Path to script relative to template root                                         |
| `cross_platform` | If `true`, use platform-safe runner                                              |

**Interaction flow** during `pt init`:

1. Folder structure created
2. If template has `post_config`:
   - Filter tasks by project type
   - Show list: `[1/3] git init` ...
   - Prompt: `Run post-config tasks? (y/N)`
   - If yes: run each task, show ✓/✗ per task
3. If no `post_config`, suggest baked-in defaults:
   - Prompt: `No post-config defined. Use suggested tasks?`
4. If `--skip-post-config` flag: skip entirely

**Error handling**:

- Missing template files: warn and skip
- Command not found: catch error, log `✗`, continue to next task
- Git already initialized: caught silently
- Permission errors: caught and logged
- If all tasks fail: warn but don't block project creation

### Copy Files

Copy additional files from the template source directory with optional variable substitution and chmod:

```yaml
templates:
  my_template:
    name: My Project
    type: javascript
    copy_files:
      - src: "templates/config.template"
        dest: "config.json"
        substitute_variables: true
      - src: "scripts/setup.sh"
        dest: "bin/setup.sh"
        chmod: "0755"
```

Each entry supports:

| Field                  | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `src`                  | Path relative to template root (source directory from `pt learn`) |
| `dest`                 | Path relative to project root                                     |
| `substitute_variables` | If `true`, replace `{{variable_name}}` placeholders               |
| `chmod`                | Octal permission string (e.g., `"0755"`) — skipped on Windows     |

**How it works**:

1. Read file from `templateRoot/src`
2. If `substitute_variables`: replace `{{var}}` patterns with user-provided values
3. Write to `projectRoot/dest` (creates intermediate directories)
4. Apply `chmod` on Unix systems

**Edge cases**:

- Missing source file: warn and skip
- Template root not set: skip silently (learn stores this)
- Permission errors: caught and logged

### Post-Copy

Auto-detect executable scripts during `pt learn` and copy them to the new project:

**Auto-detection** (`pt learn`):

When learning a template, `pt` scans the source directory root for executable files:

| Pattern                | Description                                         |
| ---------------------- | --------------------------------------------------- |
| `*.sh`                 | Shell scripts                                       |
| `*.py`                 | Python scripts                                      |
| `*.bat` / `*.cmd`      | Batch files                                         |
| `Makefile`             | Makefiles                                           |
| `*.mk`                 | Makefile includes                                   |
| (no ext, has exec bit) | Any executable file (checks execute permission bit) |

The detected files are presented to the user for confirmation:

```
Auto-detected executable files:
  - bin/deploy.sh (shell script)
  - scripts/lint.py (Python script)
  - Makefile (makefile)

Add to post_copy? (y/N):
```

**Manual definition** in `config.yaml`:

```yaml
templates:
  my_template:
    name: My Project
    post_copy:
      - src: "bin/deploy.sh"
        dest: "bin/deploy.sh"
      - src: "scripts/lint.py"
        dest: "scripts/lint.py"
```

Each entry supports:

| Field  | Description                                                       |
| ------ | ----------------------------------------------------------------- |
| `src`  | Path relative to template root (source directory from `pt learn`) |
| `dest` | Path relative to project root (defaults to `src` if omitted)      |

**How it works**:

1. During `pt init`, copies each `post_copy` file from `templateRoot/src` to `projectRoot/dest`
2. Auto-applies `0755` chmod for `.sh`, `.py`, `.bash`, `.bat` files
3. Missing files: warn and skip, don't block project creation

**vs copy_files**: `post_copy` is a simplified variant specifically for executables/scripts, auto-detected by `pt learn`. `copy_files` is for arbitrary template files with variable substitution support.

### Order of Operations

During `pt init`:

1. **Create folder structure** — folders and `.info.md` files
2. **Copy `copy_files`** — with optional variable substitution and chmod
3. **Copy `post_copy`** — executable scripts (auto-detected or manual)
4. **Execute post-config tasks** — shell commands

## Development

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run watch
```

### Lint

```bash
npm run lint
```

## Project Structure

```
pt-cli/
├── bin/          # CLI entry point
├── src/          # TypeScript source
│   ├── config.ts       # Config management, exclusion logic, type definitions
│   ├── learn.ts        # Template learning logic + templateRoot storage + executable auto-detection
│   ├── init.ts         # Project initialization + copy_files/post_copy/post_config wiring
│   ├── postconfig.ts   # Post-config runner + baked-in defaults
│   ├── substitute.ts   # Variable substitution + processCopyFiles
│   ├── platform.ts     # Cross-platform shell detection
│   └── index.ts        # CLI command definitions
├── dist/         # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── post-config_PLAN.md # Feature plan and implementation tracking
└── ROADMAP.md      # Project roadmap
```

## Exclusions

The following are excluded by default when learning templates:

- `.git`, `node_modules`, `dist`, `build`
- `.DS_Store`, `.pytest_cache`, `__pycache__`
- `.vscode`, `.idea`
- Various editor/IDE files (`.bak`, `.swp`, etc.)
- Compiled files (`.pyc`, `.so`, `.dll`, etc.)
- `.gitkeep.md`, `.info.md`, `.vale.ini`, `.gitattributes`

### Ignore Patterns

Use the top-level `ignore` key in `~/.pt/config.yaml` or the `--ignore` flag to exclude folders:

```yaml
ignore:
  - DAILIES/*
  - PARKING_LOT/*
  - REFERENCE/*
```

Patterns use wildcards for clarity:

| Pattern      | Effect                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| `DAILIES/*`  | Ignore all contents of DAILIES (DAILIES itself is kept as a template folder) |
| `DAILIES/**` | Same as `DAILIES/*` (deep match)                                             |
| `NODE`       | Ignore this specific folder only (no wildcard = exact match)                 |

The CLI flag `--ignore=DAILIES/*,PARKING_LOT/*` merges with the config patterns (one-shot, not persistent).

### Custom exclusions

Additional patterns can be added to `DEFAULT_EXCLUDES` in `src/config.ts`.
