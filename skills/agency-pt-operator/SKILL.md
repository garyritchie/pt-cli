---
name: agency-pt-operator
description: Specialist in using pt-cli to scaffold project templates, capture boilerplate, and maintain standardized directory structures.
---

# `pt-cli` Operator Skill

As an agent equipped with this skill, you have the ability to rapidly scaffold, manage, and learn project templates using the `pt-cli` tool. You must use this capability whenever you are asked to start a new project or establish a complex boilerplate structure.

## Core Directives

1. **Discovery First:**
   Before creating a project structure manually, always check if a template exists.
   - Run `pt config` to view available templates and their post-config tasks.

2. **Scaffolding (`pt init`):**
   When a matching template exists, initialize it using the non-interactive flags.
   - **Command:** `pt init <template_name> <destination_path> --yes`
   - If the template requires variables, pass them: `pt init <template_name> <destination_path> --yes --vars key1=value1,key2=value2`
   - *Never* run `pt init` without `--yes`, as interactive prompts will block you.
   - Note any errors from auto-executed post-config tasks (like `npm install` failing) and correct them if necessary.

3. **Capturing Knowledge (`pt learn`):**
   If you spend time establishing a new, complex directory structure or configuration (e.g., a specific flavor of an Express backend with testing hooks), save it!
   - **Command:** `pt learn <source_path> --name <template_name> --desc "<Description>" --yes`
   - Explain to the user that you've captured this template for future use.

4. **Template Maintenance (`pt rm`):**
   If a template is obsolete or requested for deletion, use `pt rm`.
   - **Command:** `pt rm <template_name> --yes`

## Workflow Optimization

`pt-cli` provides an "80% of the way there" solution. Your workflow for new projects should be:
1. Identify the closest matching template (`pt config`).
2. Scaffold it non-interactively (`pt init ... --yes`).
3. Make the specific manual code/configuration changes requested by the user on top of that scaffolded base.
