# Usage Guide

## Learn a template

```bash
# Learn a new template (auto-detects post-config tasks)
pt learn /path/to/PROJECT

# Update an existing template (use current directory if no path given)
pt update <template_name>
pt update <template_name> /path/to/PROJECT

# Ignore specific folders during learning
pt learn /path/to/PROJECT --ignore=DAILIES/*,PARKING_LOT/*,REFERENCE/*

# Ignore a folder name at any depth
pt learn /path/to/PROJECT --ignore=**/.godot/

# Non-interactive mode (useful for AI agents)
pt learn /path/to/PROJECT --name my_template --desc "My new template" --yes
```

### Remote Template Learning

`pt learn` supports learning templates directly from a remote Git repository or tarball archive by passing an `http://` or `https://` URL:

```bash
# Learn a template directly from a GitHub repository
pt learn https://github.com/username/my-template

# Learn a template from a Gitea repository
pt learn https://gitea.example.com/username/my-template
```

#### How it works:
1. **URL Translation:** If a GitHub or Gitea URL is provided, `pt` automatically translates the repository URL to its corresponding tarball download endpoint (e.g., `/archive/refs/heads/main.tar.gz`).
2. **Download & Extraction:** The tool downloads the archive into a secure temporary folder and extracts it.
3. **Template Discovery:** The extracted directory is scanned for metadata (`.pt-template.json`, `template.json`, `.info.md`, `post_config.sh`, `post_config.bat`) and variable placeholders (`{{ var }}`), matching local learn functionality exactly.
4. **Save Config:** The template config (skeleton structure, files, variables) is saved to the local configuration, pointing to the temporary folder as the `templateRoot`.


### Automatic Variable Detection

During `pt learn` or `pt update`, the tool automatically scans text files at the root and in the first-level subdirectories for variable placeholders using the `{{ variable_name }}` syntax. 

- **Detection Range:** Root files and 1st-level subfolder files (e.g., `README.md`, `.makerc`, `DOC/closedown.md`).
- **Registration:** Any detected variables are automatically added to the template's configuration with default prompts (e.g., `Enter variable_name:`).
- **Global Suggestions:** Your global variables (defined in `~/.pt/config.yaml`) are automatically injected as additional suggestions during the learn process.
- **Updating:** You can add new placeholders to a project folder and run `pt update <template_name>` to automatically register them in your existing template.

## Initialize a project

```bash
# Initialize from a template (auto-suggests post-config tasks)
pt init <template_name> /path/to/new/PROJECT

# Skip post-config tasks
pt init <template_name> /path/to/new/PROJECT --skip-post-config

# Dry run (preview actions without execution)
pt init <template_name> /path/to/new/PROJECT --dry-run

# Non-interactive mode with variables (useful for an API or AI agents)
pt init <template_name> /path/to/new/PROJECT --yes --vars project_name=foo,author=bar

# Initialize directly from a JSON template file (no config.yaml registration)
pt init /path/to/new/PROJECT --file my-template.json --yes
```

### Direct JSON Scaffolding (`--file`)

The `--file` option allows you to scaffold a project directly from a JSON template file **without** registering it in your local `~/.pt/config.yaml`. This is ideal for:

- One-off project creation from a shared template
- CI/CD pipelines where you don't want to modify the user's config
- Receiving a template JSON from a colleague and using it immediately

```bash
# The template name is read from the JSON's "name" field
pt init ./new-project --file template.json --yes

# With variable overrides
pt init ./new-project --file template.json --yes --vars client=Acme,author=Jane
```

## Remove a template

```bash
# Remove a learned template (asks for confirmation)
pt remove <template_name>

# Short alias
pt rm <template_name>
```

## Show config and templates

```bash
pt config
```

Shows all templates, their `post_config` tasks (if any), source paths, global post-config tasks, ignore patterns, global variables, and an example post-config block.

## Manage Global Variables

Global variables serve as boilerplate suggestions during the `pt learn` process.

```bash
# List global variables
pt variables

# Set/Update global variables (comma-separated pairs)
pt variables --set AUTHOR="Gary Ritchie",LICENSE="MIT"

# Delete a global variable
pt variables --delete LICENSE
```

For more details on how these are used, see the [Configuration Guide](configuration.md).

## Template Sharing & JSON

### File-based Sharing

You can share your templates with others simply by sharing a directory (or a ZIP of it). When someone else runs `pt learn` on it, `pt` will automatically detect the following files at the root:

- `.pt-template.json` or `template.json`: **Full template configuration** — name, description, variables (with prompts, defaults, required flags), folders, copy_files, post_config, and post_copy. This is the most complete and portable way to share templates.
- `.info.md`: Used to automatically set the template's name (from the first `# Heading`) and description.
- `post_config.sh` or `post_config.bat`: Parsed to automatically populate the `post_config` actions in the user's `config.yaml`.

**Priority order:** `.pt-template.json` > `template.json` > `.info.md` > `post_config.sh`/`.bat`. JSON config files take precedence over `.info.md` for name/description and over shell scripts for post_config tasks.

These files are also automatically generated at the root of a new project whenever you run `pt init`, making it trivial to initialize a project, zip it up, and share it with teammates as a fully-featured template!

### JSON Template Config File (`.pt-template.json`)

The JSON template config file is the recommended way to make a template directory fully self-describing and portable. Place it at the root of your template directory:

```json
{
  "name": "my-web-app",
  "description": "A Node.js web application with Express",
  "variables": [
    { "name": "project_name", "prompt": "Project name:", "default": "my-app", "required": true },
    { "name": "author", "prompt": "Author name:", "default": "" }
  ],
  "folders": [
    { "name": "src", "children": [] },
    { "name": "tests", "children": [] }
  ],
  "copy_files": [
    { "src": "package.json", "dest": "package.json", "substitute_variables": true },
    { "src": "README.md", "dest": "README.md", "substitute_variables": true }
  ],
  "post_config": [
    { "command": "git init", "description": "Initialize git repository" },
    { "command": "npm install", "description": "Install dependencies" }
  ],
  "post_copy": [
    { "src": "bin/start.sh", "dest": "bin/start.sh" }
  ]
}
```

When `pt learn` encounters this file, **all fields are used as pre-configured defaults**, skipping the corresponding interactive prompts. Any fields not specified in the JSON file will fall back to normal auto-detection (file scanning, executable detection, etc.).

### Portable Template Round-Trip Workflow

The complete workflow for sharing a fully portable template:

```bash
# 1. Export an existing template to JSON
pt config my-template --json > .pt-template.json

# 2. Place the JSON file at the root of your template directory
cp .pt-template.json /path/to/template-dir/

# 3. Share the directory (zip, git, etc.)

# 4. Recipient learns the template — all metadata auto-detected
pt learn /path/to/template-dir --yes

# 5. Or scaffold directly without registering in config
pt init ./new-project --file .pt-template.json --yes
```

### JSON Export & Import

For a more portable, text-based approach, you can export and import templates as JSON strings or files.

#### Exporting a Template to JSON
To export an existing template from your configuration as JSON:
```bash
pt config <template_name> --json > my_template.json
```

#### Importing a Template from JSON
To add a template from a JSON file:
```bash
pt add <template_name> --file my_template.json
```

Or from a JSON string:
```bash
pt add <template_name> '{"description":"My Template","files":{...}}'
```

#### Direct JSON Scaffolding (no config registration)
To scaffold a project directly from a JSON file without adding the template to your config:
```bash
pt init ./destination --file my_template.json --yes
```

#### Exporting Full Config
To see your entire configuration (including all templates) in JSON format:
```bash
pt config --json
```
