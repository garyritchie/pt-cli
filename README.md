# pt - Project Template CLI

A CLI tool to record directory structures as templates and initialize new projects from them.

## The Pipeline Benefit

`pt-cli` is built to reduce boilerplate setup and ensure consistency across your workspaces. In a production pipeline, standardization is key to lowering the friction of cognitive load. `pt` helps by:

- **Instantly replicating proven architectures:** Stop recreating folder structures manually. `pt learn` saves the shape of any project.
- **Automating the setup grind:** With post-config tasks, `pt init` can automatically run `npm install`, `git init`, or setup python virtual environments for you.
- **Global post-config:** Configure shared tasks (e.g. `git init`, `git lfs install`) once in `~/.pt/config.yaml` and have them apply to every project type automatically.
- **Agentic automation:** Fully supports headless operation via non-interactive flags and includes a skill for integration with AI agents.
- **File copying & templating:** Beyond directories, it allows injecting variables into key files (`package.json`, `README.md`, etc.) and automatically ports over executable scripts.

## Features at a Glance

- Learn any directory structure and save it as a reusable template
- Initialize new projects from learned templates
- Define template variables for dynamic file customization
- Auto-detect and suggest post-config setup tasks
- **Automatic Variable Detection:** Scans text files for `{{ var }}` syntax during `learn`/`update`
- Configure global post-config tasks in `~/.pt/config.yaml` (apply to all projects)
- Baked-in defaults for common project types (javascript, python, godot, etc.)
- Easily package and share templates with auto-generated metadata files
- Fully supports non-interactive mode (`--yes`, `--vars`) for AI agent automation

## Quick Start

### Installation

```bash
# Clone and setup
cd pt-cli
npm install
npm run build

# Link for global use
npm link
```

### Basic Commands

```bash
# Learn an existing project structure
pt learn /path/to/project

# Scaffold a new project from a template
pt init <template_name> /path/to/new/project

# List available templates and configurations
pt config
```

## Documentation

For full details on usage, configurations, and exclusions, please refer to the documents in the `doc/` directory:

- [Detailed Usage](doc/usage.md) - Learn, Initialize, Update, and Remove commands.
- [Configuration Guide](doc/configuration.md) - Template variables, post-config tasks, file copying, and more.
- [Exclusions](doc/exclusions.md) - Learn about default ignored files and how to set custom patterns.
- [Development](doc/development.md) - How to build, lint, and understand the project structure.

## Agent Integration

`pt-cli` is compatible with AI agents. By utilizing the non-interactive flags (`--yes`, `--vars`, `--name`, `--desc`), agents can autonomously scaffold and learn projects without hanging on interactive terminal prompts.

An official agent skill is included in this repository: [`skills/agency-pt-operator/SKILL.md`](skills/agency-pt-operator/SKILL.md).

Equipping your agent with this skill allows it to automatically use `pt-cli` to lay down standardized boilerplate and capture new architectures you develop together.
