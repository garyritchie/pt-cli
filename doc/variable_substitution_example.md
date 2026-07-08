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

## 4. Nested Variable Expansion (v0.36.0+)

Starting with v0.36.0, you can use **nested variables** for more complex configurations. Create a `.env` file in your project directory or parent directory:

```bash
# .env file in parent directory
prefix='rst_'
project=MyProject
```

Then use these variables in your template files:

**`templates/README.md.tmpl`**:
```markdown
# {{prefix}}{{project}}

This is a nested variable example where:
- prefix = 'rst_'
- project = 'MyProject'
- Result: 'rst_MyProject'
```

**Even more complex nesting:**
```bash
# .env file
prefix='app_{{ env }}'
env=prod
project=MyApp
version=2.0
```

Then in your template:
```json
{
  "name": "{{prefix}}_{{project}}",
  "version": "{{version}}"
}
```

This will resolve to:
```json
{
  "name": "app_prod_MyApp",
  "version": "2.0"
}
```

**How it works:**
1. `pt` scans parent directories for `.env` files
2. Loads variables from `.env` as defaults
3. Expands nested placeholders iteratively (up to 10 passes)
4. Resolves circular references gracefully

**Example with nested placeholders:**
```bash
# .env file
template_path='docs/{{ project }}'
project=wiki
```

Result: `template_path` becomes `docs/wiki`

**Important:** Missing nested variables remain as `{{ variable }}` placeholders (with preserved whitespace) to help identify configuration issues.
