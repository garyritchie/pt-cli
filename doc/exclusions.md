# Exclusions

The following are excluded by default when learning templates (from `src/config.ts`):

- `.git`
- `node_modules`, `dist`, `build`, `bin`
- `.DS_Store`, `Thumbs.db`

Additionally, these **file patterns** are excluded from `copy_files`/`post_copy` scanning:

- Compiled/binary: `*.pyc`, `*.pyo`, `*.pyd`, `.Python`, `*.egg-info`, `*.egg`, `*.whl`, `*.so`, `*.dll`, `*.dylib`, `*.exe`, `*.o`, `*.a`, `*.lib`, `*.class`, `*.jar`, `*.war`, `*.ear`
- Logs/temp: `*.log`, `*.tmp`, `*.swp`, `*.swo`, `*~`, `.bak`
- Lockfiles: `Gemfile.lock`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `composer.lock`

> **Note:** Configuration files (`*.json`, `*.yaml`, `*.yml`, `*.ini`, `*.conf`, `*.config`, `.gitconfig`, `.makerc`, `package.json`, `composer.json`), documentation (`*.md`, `*.txt`), and editor folders (`.vscode`, `.gitea`, `.stignore`, etc.) are **NOT** excluded by default. Use the `ignore` config or `--ignore` flag to exclude them if needed.

## Ignore Patterns

Use the top-level `ignore` key in `~/.pt/config.yaml` or the `--ignore` flag to exclude folders:

```yaml
ignore:
  - DAILIES/*
  - PARKING_LOT/*
  - REFERENCE/*
```

Patterns use wildcards for clarity:

| Pattern      | Effect                                                                       |
| ------------ | ---------------------------------------------------------------------------- |
| `DAILIES/*`  | Ignore all contents of DAILIES (DAILIES itself is kept as a template folder) |
| `DAILIES/**` | Same as `DAILIES/*` (deep match)                                             |
| `**/FOLDER/` | Ignore any folder named FOLDER at any depth                                  |
| `FOLDER`     | Ignore this specific folder (at root or by name)                             |

The CLI flag `--ignore=DAILIES/*,PARKING_LOT/*` merges with the config patterns (one-shot, not persistent).

## Custom exclusions

Additional patterns can be added to `DEFAULT_EXCLUDES` in `src/config.ts` or via the `--ignore` flag / config `ignore` array.
