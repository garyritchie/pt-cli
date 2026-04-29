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

## Template Sharing

You can share your templates with others simply by sharing a directory (or a ZIP of it). When someone else runs `pt learn` on it, `pt` will automatically detect the following files at the root:

- `.info.md`: Used to automatically set the template's name (from the first `# Heading`) and description.
- `post_config.sh` or `post_config.bat`: Parsed to automatically populate the `post_config` actions in the user's `config.yaml`.

These files are also automatically generated at the root of a new project whenever you run `pt init`, making it trivial to initialize a project, zip it up, and share it with teammates as a fully-featured template!
