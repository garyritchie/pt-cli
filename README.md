# pt - Project Template CLI

A CLI tool for learning directory structures as templates and initializing new projects from them.

## Features

- Learn any directory structure and save it as a reusable template
- Initialize new projects from learned templates
- Define template variables for customization
- Built-in file/folder exclusion patterns
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
npx pt <command>
```

## Usage

### Learn a template

```bash
# Learn a new template
pt learn /path/to/project

# Update an existing template
pt update <template_name>
```

### Initialize a project

```bash
# Initialize from a template
pt init <template_name> /path/to/new/project
```

### Show config and templates

```bash
pt config
```

## Configuration

Config is stored at `~/.pt/config.yaml` and contains:

- `version`: Config version
- `templates`: Dictionary of learned templates with folder structure

### Template Variables

When learning a template, you can define variables that will be prompted during initialization:

```bash
# Learn with variables
pt learn /path/to/project
# When prompted: Define template variables? (y/n)
# Enter variables as comma-separated names: client_name,project_name
```

These variables are then prompted when initializing a project from the template.

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
│   ├── config.ts # Config management and exclusion logic
│   ├── learn.ts  # Template learning logic
│   ├── init.ts   # Project initialization logic
│   └── index.ts  # CLI command definitions
├── dist/         # Compiled JavaScript (generated)
├── package.json
└── tsconfig.json
```

## Exclusions

The following are excluded by default when learning templates:

- `.git`, `node_modules`, `dist`, `build`
- `.DS_Store`, `.pytest_cache`, `__pycache__`
- `.vscode`, `.idea`
- Various editor/IDE files (`.bak`, `.swp`, etc.)
- Compiled files (`.pyc`, `.so`, `.dll`, etc.)

Custom exclusions can be added in `src/config.ts`.
