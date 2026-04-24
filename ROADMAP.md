# pt - Project Template CLI — Roadmap

## Phase 1 - Foundation

| Item | Status |
|------|--------|
| `pt learn` — scan directory, save folder structure | ✓ DONE |
| `pt update` — update existing template | ✓ DONE |
| `pt init` — create project from learned template | ✓ DONE |
| `pt config` — display config location and templates | ✓ DONE |
| Config at `~/.pt/config.yaml` | ✓ DONE |
| Default exclusions (`.git`, `node_modules`, etc.) | ✓ DONE |

## Phase 2 - Variable Substitution

| Item | Status |
|------|--------|
| `PostConfigTask` / `CopyFileEntry` / `PostCopyFile` types | ✓ DONE |
| `substitute.ts` — variable substitution + processCopyFiles | ✓ DONE |
| `postconfig.ts` — post-config runner | ✓ DONE |
| `postconfig.ts` — baked-in defaults by project type | ✓ DONE |
| `init.ts` — wire post_config into init flow | ✓ DONE |
| `init.ts` — auto-suggest defaults if template has none | ✓ DONE |
| `init.ts` — wire `copy_files` | ⏳ TODO (blocked on templateRoot) |
| `init.ts` — process `post_copy` | ⏳ TODO |
| `init.ts` — add post_copy to init order (after copy_files) | ⏳ TODO |
| `learn.ts` — store `templateRoot` in config | ⏳ TODO (PRIORITY) |
| `learn.ts` — auto-detect `post_copy` (executables/scripts) | ⏳ TODO (PRIORITY) |
| `config.ts` — add `post_copy?: PostCopyFile[]` to TemplateConfig | ⏳ TODO |
| `--skip-post-config` CLI flag in `index.ts` | ✓ DONE |
| `pt config` example post-config output | ✓ DONE |

## Phase 3 - Polish

| Item | Status |
|------|--------|
| `platform.ts` — cross-platform shell detection | ⏳ TODO |
| Error summary at end of post-config run | ⏳ TODO |
| Per-task retry support | ⏳ TODO |
| End-to-end integration test | ⏳ TODO |
| Update README/ROADMAP | ✓ DONE |

---

## Current Implementation Status

### What's working now

- `pt learn <path>` — scans directory, saves folder structure to `~/.pt/config.yaml`
- `pt update <template>` — updates existing template
- `pt init [type] [path]` — creates project from template (folder structure only)
- `pt config` — shows templates and an example post-config block
- `--skip-post-config` flag — works (just skips the prompt)
- Variable substitution in `processCopyFiles()` — ready but not wired into `init.ts`
- Baked-in defaults by project type (javascript, python, godot, blender, etc.) — ready but not wired in

### What needs to be done

**Critical path (unblocks copy_files):**
1. `learn.ts` store `templateRoot = resolvedPath`
2. `learn.ts` auto-detect executables → `post_copy`
3. `init.ts` process `copy_files` using `templateRoot`
4. `init.ts` process `post_copy` using `templateRoot`
5. `config.ts` add `post_copy?: PostCopyFile[]` to `TemplateConfig`

**Order of operations in `pt init`:**
1. Create folder structure (`.info.md` from `folder.info`)
2. Copy `copy_files` (variable substitution + chmod)
3. Copy `post_copy` (executable scripts)
4. Execute post-config tasks
