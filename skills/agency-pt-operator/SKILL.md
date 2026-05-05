---
name: agency-pt-operator
description: Specialist in using pt-cli to scaffold project templates, capture boilerplate, and maintain standardized directory structures. Includes knowledge of global_post_config, global variables, and automatic variable detection.
---

# `pt-cli` Operator Skill

As an agent equipped with this skill, you have the ability to rapidly scaffold, manage, and learn project templates using the `pt-cli` tool. You must use this capability whenever you are asked to start a new project or establish a complex boilerplate structure.

## Core Directives

1. **Discovery First:**
   Before creating a project structure manually, always check if a template exists.
   - Run `pt config` to view available templates, their post-config tasks, and global post-config tasks.

2. **Scaffolding (`pt init`):**
   When a matching template exists, initialize it using the non-interactive flags.
   - **Command:** `pt init <template_name> <destination_path> --yes`
   - If the template requires variables, pass them: `pt init <template_name> <destination_path> --yes --vars key1=value1,key2=value2`
   - *Never* run `pt init` without `--yes`, as interactive prompts will block you.
   - Note any errors from auto-executed post-config tasks (like `npm install` failing) and correct them if necessary.
   - Global post-config tasks (configured in `~/.pt/config.yaml` under `global_post_config`) are **always applied** in `--yes` mode, regardless of the template. These include boilerplate like `git init`, `git add -A && git commit -m "Initial commit"`, etc. They appear alongside template-specific tasks as a merged, checkbox-selectable list in interactive mode.

3. **Capturing Knowledge (`pt learn`):**
   If you spend time establishing a new, complex directory structure or configuration (e.g., a specific flavor of an Express backend with testing hooks), save it!
   - **Command:** `pt learn <source_path> --name <template_name> --desc "<Description>" --yes`
   - Explain to the user that you've captured this template for future use.
   - **Automatic Variable Detection:** `pt learn` and `pt update` automatically scan text files (at root and one level deep) for `{{ variable_name }}` placeholders. You can add these to files (e.g., `README.md`, `.makerc`) and run `pt update <template> . --yes` to have them registered as template variables without manual configuration.

4. **Template Maintenance (`pt rm`):**
   If a template is obsolete or requested for deletion, use `pt rm`.
   - **Command:** `pt rm <template_name> --yes`

## Global Post-Config

Global post-config tasks are stored in `~/.pt/config.yaml` under `global_post_config`. They are applied to **every** project type, regardless of template. Each task supports:

- `command` — shell command to run
- `description` — shown to user
- `checked` — default checkbox state (defaults to `true` if omitted)
- `type` — filter by project type (e.g., `"javascript"`); if set, the task only applies when that template's name matches the type filter

Tasks with `checked: false` stay unchecked by default in interactive mode. In `--yes` mode, **all** global tasks are applied. In `--skip-post-config` mode, **none** are applied.

Use `pt config` to view currently configured global tasks. To add global tasks, edit `~/.pt/config.yaml` directly or use `pt add` for template management (global config is YAML-only at this time).

## Global Variables

Global variables are defined in `~/.pt/config.yaml` under `variables`. They act as **suggestions** during the `pt learn` or `pt update` process.

- **Purpose:** They ensure that common metadata fields (like `author`, `license`, `project_version`) are consistently offered for inclusion in every new template you create.
- **Inheritance:** When you `learn` a new project structure, these global variables are automatically merged with any detected variables (`{{ var }}`) and offered as part of the new template's variable list.
- **Localization:** Once a template is saved, its variables are "stamped" in. Subsequent changes to global variables in the config will **not** retroactively affect old templates, ensuring stability and portability.
- **Management:** Use `pt variables --set key=value` to update your global defaults. For bulk updates, use `pt variables --set --json '...'`.

## Workflow Optimization

`pt-cli` provides an "80% of the way there" solution. Your workflow for new projects should be:
1. Identify the closest matching template (`pt config`).
2. Scaffold it non-interactively (`pt init ... --yes`).
3. Make the specific manual code/configuration changes requested by the user on top of that scaffolded base.
