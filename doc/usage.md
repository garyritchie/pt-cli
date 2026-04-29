# Usage Guide

## Learn a template

```bash
# Learn a new template (auto-detects post-config tasks)
pt learn /path/to/project

# Update an existing template (use current directory if no path given)
pt update <template_name>
pt update <template_name> /path/to/project

# Ignore specific folders during learning
pt learn /path/to/project --ignore=DAILIES/*,PARKING_LOT/*,REFERENCE/*

# Ignore a folder name at any depth
pt learn /path/to/project --ignore=**/.godot/

# Non-interactive mode (useful for AI agents)
pt learn /path/to/project --name my_template --desc "My new template" --yes
```

## Initialize a project

```bash
# Initialize from a template (auto-suggests post-config tasks)
pt init <template_name> /path/to/new/project

# Skip post-config tasks
pt init <template_name> /path/to/new/project --skip-post-config

# Dry run (preview actions without execution)
pt init <template_name> /path/to/new/project --dry-run

# Non-interactive mode with variables (useful for AI agents)
pt init <template_name> /path/to/new/project --yes --vars project_name=foo,author=bar
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

Shows all templates, their `post_config` tasks (if any), source paths, and an example post-config block.
