# Implementation Plan: Agentic `pt-cli` Integration

This plan outlines the steps to make `pt-cli` fully autonomous-agent-friendly and defines the structure of the agent skill that will leverage it.

## Phase 1: Non-Interactive CLI Flags

To allow AI agents to use `pt-cli` without getting blocked by interactive terminal prompts (like `inquirer`), we need to implement non-interactive flags across the core commands.

### 1. `pt init` Non-Interactive Support
Agents need to instantiate templates and pass variables without standard input.

**Proposed Flags:**
- `--yes` or `-y`: Automatically confirm all "Run post-config tasks?" and similar `y/N` prompts with "yes".
- `--vars <key=value,key2=value2>`: Pass template variables directly. If a required variable is missing and the CLI is in non-interactive mode (e.g., via `--yes`), the CLI should fail fast with a descriptive error rather than waiting for input.

**Implementation Steps:**
1. Update Commander.js definitions in `src/index.ts` for the `init` command.
2. In `src/init.ts`, parse the `--vars` string into a `Record<string, string>`.
3. Bypass `inquirer.prompt` for variables if `--vars` provides them (or if `--yes` is used, use defaults for missing non-required variables).
4. In `src/postconfig.ts`, bypass the interactive task selection if `--yes` is present, executing all standard post-config tasks automatically.

### 2. `pt learn` Non-Interactive Support
Agents should be able to capture directory structures autonomously.

**Proposed Flags:**
- `--yes` or `-y`: Automatically confirm adding auto-detected executable scripts to `post_copy`.
- `--name <template_name>`: Provide the template name directly.
- `--desc <description>`: Provide the description directly.

**Implementation Steps:**
1. Update `src/index.ts` for the `learn` command.
2. In `src/learn.ts`, bypass the `inquirer.prompt` for name/description if `--name` and `--desc` are provided.
3. If `--yes` is provided, automatically accept all detected executable files into the `post_copy` list without prompting.

### 3. `pt remove` Non-Interactive Support
**Proposed Flags:**
- `--yes` or `-y`: Bypass the "Are you sure?" deletion confirmation.

## Phase 2: The `agency-pt-operator` Skill

Once the CLI supports non-interactive execution, we will create a skill folder (e.g., `skills/agency-pt-operator/SKILL.md`) so any agent can natively understand how to use `pt-cli`.

### Skill Architecture (`SKILL.md`)

```yaml
---
name: agency-pt-operator
description: Specialist in using pt-cli to scaffold project templates, capture boilerplate, and maintain standardized directory structures.
---
```

**Core Directives for the Agent:**

1. **Discovery First:**
   - Before manually creating boilerplate for a new project, run `pt config` to view available templates.
   - If a matching template exists (e.g., `react-app`), use it to bootstrap the project instead of writing files from scratch.

2. **Scaffolding (`pt init`):**
   - **Always** use the non-interactive flags to prevent hanging.
   - Example: `pt init react-app ./my-new-app --yes --vars project_name=my-new-app,author=AI`
   - Read the output to confirm successful initialization and note any failed post-config tasks.

3. **Capturing Knowledge (`pt learn`):**
   - If you (the agent) and the user spend time perfecting a complex directory structure, architecture, or configuration setup, proactively offer to save it.
   - Example: Run `pt learn . --name standard-api --desc "Standard Express API with Jest and ESLint" --yes`
   - Remind the user they can manually refine `~/.pt/config.yaml` later to add specific variable substitutions.

4. **Workflow Optimization:**
   - Recognize that `pt-cli` gets you "80% of the way there." Run `pt init`, then make the specific modifications requested by the user.

## Phase 3: Rollout and Testing

1. **CLI Tests:** Verify that running `pt init my_template ./out --yes` does not hang or request stdin in a headless environment.
2. **Agent Verification:** Provide the skill to an agent, ask it to "create a new project using the X template," and ensure it successfully uses the `--yes` and `--vars` flags without getting stuck.
