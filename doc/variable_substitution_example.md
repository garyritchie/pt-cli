# Variable Substitution Example

This example demonstrates how to define variables in your template and use them to customize files during project initialization.

## 1. Define Variables in `config.yaml`

In your `~/.pt/config.yaml`, add a `variables` section to your template and set `substitute_variables: true` in the `copy_files` entries.

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
      - src: "templates/README.md.tmpl"
        dest: "README.md"
        substitute_variables: true
```

> [!TIP]
> **New in v0.16.0:** You no longer need to manually define the `variables` section. During `pt learn` or `pt update`, the tool will automatically detect `{{ variable_name }}` placeholders in your files and add them to the configuration for you.

## 2. Create Template Files

Create the source files in your template directory using `{{variable_name}}` placeholders.

**`templates/package.json.tmpl`**:
```json
{
  "name": "{{project_name}}",
  "version": "1.0.0",
  "description": "Project created by pt-cli",
  "author": "{{author_name}}",
  "license": "MIT"
}
```

**`templates/README.md.tmpl`**:
```markdown
# {{project_name}}

Created by {{author_name}} using the Node Web App template.

## Getting Started

1. npm install
2. npm run dev
```

## 3. Usage

When you run `pt init node_web_app my-new-project`, the CLI will prompt you:

```text
? What is the project name? (my-app) my-awesome-service
? Who is the author? Gary Ritchie
```

The resulting `package.json` in `my-new-project/` will be:

```json
{
  "name": "my-awesome-service",
  "version": "1.0.0",
  "description": "Project created by pt-cli",
  "author": "Gary Ritchie",
  "license": "MIT"
}
```
