---
name: agency-pt-operator
description: Specialist in using pt-cli to scaffold project templates, capture boilerplate, and maintain standardized directory structures. Includes knowledge of default_post_config, global variables, automatic variable detection, JSON template configs, and portable template workflows.
---

# `pt-cli` Operator Skill

As an agent equipped with this skill, you have the ability to rapidly scaffold, manage, and learn project templates using the `pt-cli` tool. You must use this capability whenever you are asked to start a new project or establish a complex boilerplate structure.

## Core Directives

1. **Discovery First:**
   Before creating a project structure manually, always check if a template exists.
   - Run `pt config` to view available templates, their post-config tasks, and default post-config tasks.

2. **Scaffolding (`pt init`):**
   When a matching template exists, initialize it using the non-interactive flags. URL targets (GitHub, Gitea, etc.) are automatically translated to tarball downloads.
   - **Command:** `pt init <template_name> <destination_path> --yes`
   - If the template requires variables, pass them: `pt init <template_name> <destination_path> --yes --vars key1=value1,key2=value2`
   - **Direct JSON scaffolding:** To scaffold from a JSON template file without registering it in `config.yaml`:
     `pt init <destination_path> --file <json_path> --yes`
   - *Never* run `pt init` without `--yes`, as interactive prompts will block you.
   - **Dry-run:** Preview what would be created without making changes: `pt init <template_name> <destination_path> --yes --dry-run`
   - **Skip post-config:** Skip running post-config tasks: `pt init <template_name> <destination_path> --yes --skip-post-config`
   - Note any errors from auto-executed post-config tasks (like `npm install` failing) and correct them if necessary.

3. **Capturing Knowledge (`pt learn`):**
   If you spend time establishing a new, complex directory structure or configuration (e.g., a specific flavor of an Express backend with testing hooks), save it! Remote URLs (GitHub, Gitea, etc.) are automatically translated to tarball downloads.
   - **Command:** `pt learn <source_path> --name <template_name> --desc "<Description>" --yes`
   - **Update existing template:** Update an existing template with new structure/files: `pt update <template_name> <source_path> --yes`
   - **Remote Templates:** Learn from a remote Git repository or archive URL directly! Pass the HTTP/HTTPS URL as the `<source_path>`:
     `pt learn https://github.com/username/my-template --name my_template --desc "Description" --yes`
   - Explain to the user that you've captured this template for future use.
   - **Automatic Variable Detection:** `pt learn` and `pt update` automatically scan text files (at root and one level deep) for `{{ variable_name }}` placeholders. You can add these to files (e.g., `README.md`, `.makerc`) and run `pt update <template> . --yes` to have them registered as template variables without manual configuration.
   - **JSON Template Config:** If the source directory contains a `.pt-template.json` or `template.json` file, `pt learn` will auto-detect name, description, variables, folders, copy_files, post_config, and post_copy from it — skipping the corresponding interactive prompts. JSON config takes precedence over `.info.md` and shell scripts.
   - **JSON Output:** Output template structure as JSON for sharing instead of saving: `pt learn <source_path> --json`

4. **Template Maintenance (`pt rm`):**
   If a template is obsolete or requested for deletion, use `pt rm`.
   - **Command:** `pt rm <template_name> --yes` or `pt remove <template_name> --yes`

## Template Sharing & Portability

Templates are designed to be fully portable. There are two approaches to sharing:

### 1. Directory-based Sharing (recommended for complete templates)

Place a `.pt-template.json` or `template.json` at the root of your template directory. This file can include all template metadata:

```json
{
  "name": "my-template",
  "description": "Description of the template",
  "variables": [
    { "name": "project_name", "prompt": "Project name:", "default": "my-app", "required": true }
  ],
  "post_config": [
    { "command": "git init", "description": "Initialize git" }
  ]
}
```

When someone runs `pt learn /path/to/shared-dir --yes`, all metadata is auto-detected from this file. The priority order is: `.pt-template.json` > `template.json` > `.info.md` > `post_config.sh`/`.bat`.

JSON config files also take precedence over shell scripts for post_config tasks.

### 2. JSON Export/Import (for config-only sharing)

```bash
# Export a template to JSON
pt config my-template --json > my-template.json

# Import into another user's config
pt add my-template --file my-template.json

# Or scaffold directly without importing
pt init ./new-project --file my-template.json --yes
```

### Round-trip Workflow

The complete portable template workflow, perfect for sharing:

1. **Create template:** `pt init <template> <dest> --yes --skip-post-config` — creates structure without auto-executing post-config tasks (e.g., `git init`)
2. **Export config:** `pt config <template> --json > <dest>/.pt-template.json` — exports portable JSON config, required to include variables
3. **Share directory/JSON:** Share the directory or JSON file
4. **Recipient:** `pt learn <path> --name <template> --yes` — imports the template
5. **Or scaffold directly:** `pt init ./new-project --file .pt-template.json --yes`

### JSON Output for Sharing

You can output a template as JSON for sharing without saving it: `pt learn <source_path> --json`

### Important Notes

- **Never use manual `mkdir`/`cp` steps** — `pt init` already scaffolds directory structures, and manual file copying bypasses template registration
- **`--skip-post-config` flag** prevents premature task execution during template creation
- **JSON export captures all template metadata**, variables, and post-config tasks for maximum portability
- The workflow ensures portability by bundling metadata and files together, allowing recipients to import via `pt learn` without manual directory manipulation

## Default Post-Config

Default post-config tasks are stored in `~/.pt/config.yaml` under `default_post_config`. They are used as suggestions during `pt learn` to apply to the newly created template. Each task supports:

- `command` — shell command to run
- `description` — shown to user
- `checked` — default checkbox state (defaults to `true` if omitted)
- `type` — filter by project type (e.g., `"javascript"`); if set, the task only applies when that template's name matches the type filter

Tasks with `checked: false` stay unchecked by default in interactive mode. In `pt learn --yes` mode, **all applicable** default tasks are included.

Use `pt config` to view currently configured default tasks. To update default tasks, you can use `pt default-post-config --set --json '...'` to apply a new JSON array of tasks. Alternatively, you can edit `~/.pt/config.yaml` directly.

## Global Variables

Global variables are defined in `~/.pt/config.yaml` under `variables`. They act as **suggestions** during the `pt learn` or `pt update` process.

- **Purpose:** They ensure that common metadata fields (like `author`, `license`, `project_version`) are consistently offered for inclusion in every new template you create.
- **Inheritance:** When you `learn` a new project structure, these global variables are automatically merged with any detected variables (`{{ var }}`) and offered as part of the new template's variable list.
- **Localization:** Once a template is saved, its variables are "stamped" in. Subsequent changes to global variables in the config will **not** retroactively affect old templates, ensuring stability and portability.
- **Management:** Use `pt variables --set key=value` to update your global defaults. For bulk updates, use `pt variables --set --json '...'`. To delete a global variable, use `pt variables --delete key`.

## Workflow Optimization

`pt-cli` provides an "80% of the way there" solution. Your workflow for new projects should be:
1. Identify the closest matching template (`pt config`).
2. Scaffold it non-interactively (`pt init ... --yes`).
3. Make the specific manual code/configuration changes requested by the user on top of that scaffolded base.
4. If the scaffold is close but needs updates, use `pt update <template_name> . --yes` to update the saved template with your changes.

## Additional Notes

- JSON variables take precedence over other variable sources during `pt update`.
- Optional whitespace is allowed around template variables in the substitute function.
- Trailing `.git` is automatically stripped from repository URLs.
- Atomic saves, backups, and safe initialization logic prevent data loss.
- Platform-specific post-config scripts (`.sh`/`.bat`) are executed automatically based on the OS.

## CLI Reference

| Command | Description |
|---------|-------------|
| `pt learn <path>` | Learn a project structure from an existing directory |
| `pt update <template> [path]` | Update an existing template with new structure/files |
| `pt init [template] [dest]` | Initialize a new project from a learned template |
| `pt config [template]` | Show current config location and list templates, or export a specific template |
| `pt variables [pairs]` | View or set global variables (comma-separated key=value) |
| `pt default-post-config` | View or set default post-config tasks |
| `pt add <name> [json]` | Import/add a template from a JSON string or file |
| `pt remove <template>` / `pt rm <template>` | Remove a learned template from the config |
