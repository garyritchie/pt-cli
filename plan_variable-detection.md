# Plan: Variable Detection in Text Files

## Objective
Automatically detect variable placeholders (e.g., `{{ variable_name }}`) in text files during `pt learn` (or `pt update`). This reduces friction by automatically populating the `variables` array in `config.yaml` instead of requiring manual definition.

## Proposed Implementation (Without Major Rewrite)

1. **Regex Extraction Logic**
   - Introduce a helper function in `src/learn.ts` (e.g., `detectVariablesInFiles(basePath, filePaths)`).
   - Use a regular expression like `/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g` to find variables within the contents of the scanned files.

2. **Target File Selection**
   - Limit the scan to text files at the top level and 1st-level subdirectories to avoid performance issues (e.g., scanning large datasets or binaries).
   - Alternatively, define a specific array of common text files to check: `.makerc`, `readme.md`, `README.md`, `package.json`, `Makefile`, `makefile`, `DOC/*.md`.
   - Leverage the existing `shouldExcludeFile` and `shouldIgnore` functions to ensure we don't scan `node_modules`, `.git`, or binary files.

3. **Integration in `learn.ts`**
   - Before prompting the user with "Define template variables...", run the auto-detection over the targeted files.
   - Collect unique variable names.
   - If `isUpdate` is true, merge the newly detected variables with the existing variables from `config.templates[updateTemplate].variables`.
   - If variables are auto-detected, we can either:
     - Inform the user: `Auto-detected variables: var1, var2` and skip the manual input prompt for those.
     - In interactive mode, ask the user to confirm or provide additional variables.
     - In headless/`--yes` mode, silently merge them and generate default prompts (`Enter var1:`).

4. **Updating Agent Skills**
   - Update `skills/agency-pt-operator/SKILL.md`.
   - Add a section under `Capturing Knowledge (pt learn)` explaining that variables in the format `{{ variable_name }}` inside text files (like `README.md`, `.makerc`) are automatically detected during `pt learn` and `pt update`.
   - Explain that the agent can inject `{{ new_var }}` into template files and run `pt update <template_name> . --yes` to seamlessly register new variables without manual `config.yaml` editing.

## Step-by-Step Changes

- **`src/learn.ts`**:
  - Add a fast file scanner for top-level and 2nd-level files (ignoring directories via `shouldIgnore`/`shouldExclude`).
  - Read files as UTF-8, run regex, and extract unique variable names.
  - Modify the interactive prompt logic: if `detectedVars.length > 0`, default the `hasVariables` prompt to `true` and pre-fill the `variableDefs` input with the detected comma-separated names.

- **`skills/agency-pt-operator/SKILL.md`**:
  - Add a bullet point about automatic variable detection syntax `{{ var_name }}`.
