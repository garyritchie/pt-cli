# Configuration

Config is stored at `~/.pt/config.yaml` and contains:

- `version`: Config version
- `templates`: Dictionary of learned templates with folder structure, `templateRoot`, `copy_files`, `post_copy`, and `post_config`
- `default_post_config`: Array of default post-config tasks to suggest when learning a template
- `ignore`: Global folder ignore patterns for `pt learn`
- `variables`: Global variable suggestions for `pt learn` (name, prompt, default, required)

## Security Policy

Please see [[security]].

## Template Variables

When learning a template, you can define variables that will be prompted during initialization:

```bash
# Learn with variables
pt learn /path/to/project
# When prompted: Define template variables? (y/n)
# Enter variables as comma-separated names: client_name,project_name
```

**Automatic Detection:**
Instead of manual definition, `pt learn` and `pt update` automatically scan for placeholders like `{{ variable_name }}` in text files (root and 1st-level subdirectories). If found, they are automatically added to the `variables` list. This is the recommended way to manage variables for most templates.

These variables are then used during `copy_files` operations to replace `{{variable_name}}` placeholders in copied files.

### Nested Variable Expansion (v0.36.0+)

Starting with v0.36.0, `pt` supports **nested variable expansion** — variables can contain other variable placeholders that are resolved iteratively. This enables powerful configuration patterns like:

```bash
# In ~/.env or parent directory .env file:
prefix='rst_{{ project }}'
project=MyProject
```

During initialization, the system will:
1. Load `prefix='rst_{{ project }}'` from `.env`
2. Detect that `prefix` contains a `{{ project }}` placeholder
3. Resolve `{{ project }}` to `MyProject`
4. Set `prefix` to `rst_MyProject`

This is particularly useful for:
- **Project naming conventions**: `prefix='app_{{ env }}'` + `env=prod` → `app_prod`
- **Path templates**: `template_path='docs/{{ project }}'` + `project=wiki` → `docs/wiki`
- **Multi-level configurations**: Combine multiple `.env` files with nested references

**How it works:**
- Variables are expanded iteratively (up to 10 passes) to prevent infinite loops
- Circular references are detected and stopped gracefully
- Missing nested variables remain as `{{ variable }}` placeholders
- Whitespace is preserved: `{{ unknown }}` stays as `{{ unknown }}` (not `{{unknown}}`)

### Parent Directory `.env` File Scanning

`pt` automatically scans parent directories for `.env` files and uses their values as defaults during initialization. This enables:

- **Project-wide defaults**: Store common values in a parent `.env` file
- **Environment-specific configurations**: Use different `.env` files for dev/staging/prod
- **Team collaboration**: Share common variable values across team projects

**Example:**
```bash
# Project structure:
my-project/
├── .env          # Contains: prefix='rst_'
├── sub-project/  # Initialize here
│   └── ...
```

When you run `pt init my-template sub-project`, the `prefix` variable will be pre-filled with `rst_` from the parent `.env` file.

**Behavior:**
- Scans from the current directory up to 3 parent levels
- Uses values from `.env` as defaults (still prompts if not in `.env`)
- `--vars` CLI option overrides `.env` values
- `.env` files are not committed to version control (use `.gitignore`)

## Post-Config Tasks

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

Additionally, if `pt learn` finds a `post_config.sh` or `post_config.bat` file at the root of the directory, it will parse the scripts and automatically load the tasks into the `post_config` array.

If the directory contains a `.pt-template.json` or `template.json` file with a `post_config` array, those tasks take precedence over shell script parsing. See [Usage Guide — JSON Template Config](usage.md#json-template-config-file-pt-templatejson) for the full JSON config format.

### The 80% Philosophy

`pt` is designed to get you **80% of the way there** automatically. For complex templates, you are encouraged to:

1. Use `pt learn` to capture the basic structure and key boilerplate.
2. Manually edit `~/.pt/config.yaml` to refine `copy_files`, `post_config` commands, or add specific `chmod` requirements.
3. Alternatively, initialize a temporary project from your learned template (`pt init`), refine it manually, and then use `pt update` from that directory to "re-learn" the refined state.

**Security Note:** All post-config commands are subject to security validation:
- Dangerous commands (e.g., `curl`, `python`, `chmod`) trigger warnings with 5-second cancellation
- Absolute blocks (e.g., `sudo`, `rm -rf`, `dd`) are never allowed
- Rate limiting prevents runaway execution (50 commands per run)
- Execution timeout (30 seconds) prevents hung processes
- All events are logged to `~/.pt/security-audit.log`

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

## Default Post-Config

Default post-config tasks are defined at the top level of `~/.pt/config.yaml` under `default_post_config`. They serve as suggestions when creating or updating templates via `pt learn`. 

Unlike previous versions, default tasks are **not** automatically applied during `pt init`. Instead, you select which ones to include when learning a template, and those selections are baked into the template's `post_config` list. This eliminates the need to repeat boilerplate setup (e.g. `git init`) across templates while keeping each template fully self-contained.

### Configuration

```yaml
default_post_config:
  - command: "git init"
    description: "Initialize git repository"
  - command: "git add -A && git commit -m 'Initial commit'"
    description: "Initial git commit"
    checked: false  # default on, but user must manually check
  - command: "git lfs install"
    description: "Install git-lfs hooks"
    type: "godot"  # only applies to godot projects
```

### Fields

Each default task supports the same fields as template post-config:

| Field         | Description                                                                      |
| ------------- | -------------------------------------------------------------------------------- |
| `command`     | Shell command to run                                                             |
| `description` | Shown to user during interactive selection                                       |
| `checked`     | Default checkbox state (`true` by default); set `false` to require manual opt-in |
| `type`        | Filter by project type (e.g. `"javascript"`); if set, task only applies when template type matches |

### Behavior

- **`pt learn --yes`**: all applicable default tasks are added automatically to the new template's `post_config`.
- **Interactive mode (`pt learn`)**: applicable default tasks are shown in a checkbox group. Default tasks default to checked; `checked: false` overrides this.

### Management

You can view current default tasks using `pt config` or `pt default-post-config`.
To update default tasks programmatically or via CLI, use the `pt default-post-config` command:
- `pt default-post-config`: List current default post-config tasks.
- `pt default-post-config --set --json '...'`: Replace the default post-config tasks list via a JSON string or file.

Alternatively, you can edit `~/.pt/config.yaml` directly.

## Global Variables

Global variables are defined at the root of `~/.pt/config.yaml`. They serve as **suggestions** when creating or updating templates via `pt learn`.

Unlike default post-config tasks, global variables are also **not** automatically applied during `pt init`. Instead, they are "stamped" into individual templates during the learning process. This allows you to maintain a consistent set of metadata (like `author`, `license`, or `version`) across all your project types without forcing those values onto old templates or external configurations.

### Configuration

```yaml
variables:
  - name: "author"
    prompt: "Who is the author?"
    default: "Gary Ritchie"
  - name: "license"
    prompt: "Choose a license:"
    default: "MIT"
    required: true
```

### Behavior

1. **`pt learn`**: When scanning a project to create a new template, `pt` will:
   - Detect variables from text files using `{{ name }}` syntax.
   - Inject the **Global Variables** as additional suggestions.
   - Prompt for each variable definition unless `--yes` is used.

2. **`pt init`**: Project initialization uses only the variables explicitly saved in the chosen template. This ensures that templates are self-contained and portable.

3. **`pt variables`**: Use this command to manage your global variables:
   - `pt variables`: List current global variables.
   - `pt variables --set KEY=VAL`: Set/update a global variable's default value.
   - `pt variables --delete KEY`: Remove a global variable.
   - `pt variables --set --json '...'`: Bulk update via JSON.

## Copy Files

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

### Example: Variable Substitution

A plausible scenario for customizing a new project's `package.json` and `README.md`:

**1. Define in `config.yaml`**:
```yaml
templates:
  node_web_app:
    description: "A standard Node.js web application"
    variables:
      - name: "project_name"
        prompt: "What is the project name?"
        default: "my-app"
      - name: "author_name"
        prompt: "Who is the author?"
        required: true
    copy_files:
      - src: "templates/package.json.tmpl"
        dest: "package.json"
        substitute_variables: true
```

**2. Template source (`templates/package.json.tmpl`)**:
```json
{
  "name": "{{project_name}}",
  "author": "{{author_name}}",
  "version": "1.0.0"
}
```

**3. Resulting project file**:
If the user enters `my-service` and `Jane Doe`, the file `package.json` will be created with:
```json
{
  "name": "my-service",
  "author": "Jane Doe",
  "version": "1.0.0"
}
```

## Post-Copy

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

## Order of Operations

During `pt init`:

1. **Create folder structure** — folders and `.info.md` inside directories
2. **Copy `copy_files`** — with optional variable substitution and chmod
3. **Copy `post_copy`** — executable scripts (auto-detected or manual)
4. **Generate sharing metadata** — root `.info.md` and `post_config.sh`/`post_config.bat` are created so the result can be easily shared as a template
5. **Merge post-config tasks** — evaluate the template's `post_config` tasks; filter by project type
6. **Execute post-config tasks** — shell commands (interactive prompt, `--yes` for all, or `--skip-post-config` to omit)
