# Plan: Global post_config Feature

## Feature: Global `post_config` Settings

**The ask:** A top-level key in `~/.pt/config.yaml` (e.g., `global_post_config`) that stores post_config tasks. During `pt init`, these appear as checkboxes alongside the template's own post_config tasks, allowing the user to toggle each one on/off. Defaults to checked so the user can quickly add `git init`, `npm install`, etc. to every project.

**Why:** Reduces the friction of adding the same boilerplate commands (like `git init`, `npm install`) to every new project without editing config.yaml each time.

---

### Plan

#### 1. Config Schema — Add `global_post_config` to `~/.pt/config.yaml`

**File: `src/config.ts`**

- Add `global_post_config?: PostConfigTask[]` to the `PtConfig` interface.
- In `loadConfig()`, initialize it to `[]` for legacy configs that don't have it.

This is the storage. Example config shape:

```yaml
version: "3.0"
global_post_config:
  - command: "git init"
    description: "Initialize git repository"
    checked: true
  - command: "git add -A && git commit -m 'Initial commit'"
    description: "Initial git commit"
    checked: true
templates:
  ...
```

Note the `checked` boolean — it's only used for UI rendering (checkbox default), not stored back to config.

#### 2. Init Flow — Merge Global + Template post_config

**File: `src/init.ts`** (the `init()` function)

After copying files and post_copy but before running post_config:

1. Load config (already done).
2. Collect global tasks from `config.global_post_config`.
3. Collect template-specific tasks from `template.post_config`.
4. Present them as a single combined list to the user in a checkbox prompt.
5. Each global task gets a default-checked checkbox; template tasks keep their existing per-task prompt behavior.
6. Filter the final list to only checked tasks, then pass to `runPostConfig()`.

#### 3. Checkbox UI for post_config Selection

**File: `src/init.ts`**

Replace the existing "Run post-config tasks?" confirm prompt with a checkbox prompt that shows:

- Global tasks (grouped, labeled "Global post-config", default checked)
- Template-specific tasks (grouped, labeled "Template post-config")

Each task line shows: `- [x] git init (Initialize git repository)` or similar.

The user can uncheck any task. Only checked tasks get executed.

#### 4. Non-interactive Mode (`--yes`)

In `--yes` mode, all global tasks are applied automatically (they default to checked). Template-specific tasks that normally prompt get auto-approved.

#### 5. `pt config` Display

**File: `src/index.ts`** (the `config` command)

Add a section to display global post_config tasks, similar to the existing ignore patterns section.

#### 6. `pt init --dry-run`

Dry-run mode should list which global tasks would be applied.

---

### Implementation Order (TDD-style)

1. **Config schema change** — Update `PtConfig` interface and `loadConfig()` migration.
2. **Init merge logic** — Combine global + template tasks in `init()`.
3. **Checkbox UI** — Replace the single confirm with a multi-checkbox prompt.
4. **Non-interactive mode** — Handle `--yes` / `--dry-run` for the new flow.
5. **`pt config` display** — Show global tasks.
6. **`pt learn` unaffected** — No changes needed to learn flow (global config is separate from templates).

### Files Changed
- `src/config.ts` — Add `global_post_config` to `PtConfig` interface, migration in `loadConfig()`.
- `src/init.ts` — Merge logic, checkbox UI, filtering.
- `src/postconfig.ts` — Minor: accept a `checked` flag or filter externally (prefer external filtering in init).
- `src/index.ts` — `pt config` display for global tasks.

### Edge Cases
- **Global task conflicts**: If both global and template have `git init`, the user sees two checkboxes and can uncheck one. No dedup logic — let the user decide.
- **Script type filtering**: Global tasks inherit the project type filter (`type: "javascript"` etc.) — same as template tasks.
- **Migration**: Legacy configs get `global_post_config: []` initialized.
- **`--skip-post-config`**: Still works as an override — skips everything.
- **`-y` mode**: All global tasks auto-apply (all checked by default).
