# pt - Project Template CLI Roadmap

## Phase 1 ✅

- [x] Learn directory structure as a template
- [x] Initialize project from a learned template
- [x] Update existing templates
- [x] Config storage in `~/.pt/config.yaml`
- [x] File/folder exclusion patterns
- [x] Template variable definition
- [x] Dynamic version from package.json
- [x] README documentation

## Phase 2 - Variable Substitution

### 1. Variable Substitution in `init`

**Why**: Variables allow customizing content at init time, not just creating blank folders.

**Use cases**:

- **File content substitution** — `.makerc` templates, config files, source files with `{{variable_name}}` placeholders replaced with user values.
- **File/folder renaming** — A folder named `{{client_name}}_wip` in the template becomes `acme_wip` at init time.
- **Config injection** — `config.json` with `"name": "{{project_name}}"` → `"name": "acme_project"`.

**Design**:
- Variables are defined when learning a template (already implemented).
- During `init`, prompt for each variable if not provided on command line.
- Apply substitution to file content (for files with `.template` extension or matching a pattern) and to file/folder names.

**File copying mechanism**:
A `copy_files` section in the template config for user-specified files:

```yaml
copy_files:
  - src: "templates/makerc.template"
    dest: "makerc"
    substitute_variables: true
  - src: "tools/lint.sh"
    dest: "bin/lint.sh"
    chmod: "0755"
```

Files live in the template at a location the user chooses. At init:
1. Copy file from template to destination path.
2. If `substitute_variables: true`, scan content for `{{var}}` placeholders and replace them with user-provided values.
3. Apply optional `chmod`.

### 2. Post-Creation Tasks

**Why**: After `init` creates the folder structure and files, users often need to run setup commands.

**Examples**:
- `git init`
- `git lfs install`
- `npm init`
- `pip install -e .`
- `make setup`
- Custom scripts per project type

**Design**:

```yaml
post_config:
  - command: "git init"
    description: "Initialize git repository"
    always: false  # prompt before running
  - command: "git lfs install"
    description: "Install git-lfs hooks"
    always: false
  - command: "npm init -y"
    description: "Initialize npm project"
    type: "javascript"  # only run for this project type
  - script: "bin/setup.sh"
    description: "Run project setup script"
    cross_platform: true  # use shell:sh or node equivalent
```

**Interaction**:
- After project creation, prompt: `Run post-config tasks? (y/N):`
- If yes, show the list and run each (prompting per task if `always: false`).
- `type` filter ensures commands only run for matching project types.

**Cross-platform**:
- Shell commands → use `sh -c` (works on macOS/Linux, and on Windows via WSL/Git Bash).
- Scripts → detect platform and choose appropriate launcher (`node`, `python`, etc.).

## Phase 3 - Template Sharing (Deferred)

- [ ] Export/import templates as archives
- [ ] Remote template storage (git repo, shared config)
- [ ] Pull updates from shared templates
- [ ] Template versioning and compatibility checks

## Open Questions

1. **Variable substitution scope** — Should we support full templating (e.g., conditional blocks, loops) or keep it simple (`{{var}}` → value)?
2. **Post-config scripts** — Should these be written in a specific language, or just raw shell commands?
3. **Template discovery** — How should users find/share templates beyond manual copying?
4. **Dry-run mode** — `pt init --dry-run` to preview what would be created without actually doing it.
