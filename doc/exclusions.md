# Exclusions

The following are excluded by default when learning templates:

- `.git`, `node_modules`, `dist`, `build`
- `.DS_Store`, `.pytest_cache`, `__pycache__`
- `.vscode`, `.idea`
- Various editor/IDE files (`.bak`, `.swp`, etc.)
- Compiled files (`.pyc`, `.so`, `.dll`, etc.)
- `.gitkeep.md`, `.info.md`, `.vale.ini`, `.gitattributes`

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
| `NODE`       | Ignore this specific folder only (no wildcard = exact match)                 |

The CLI flag `--ignore=DAILIES/*,PARKING_LOT/*` merges with the config patterns (one-shot, not persistent).

## Custom exclusions

Additional patterns can be added to `DEFAULT_EXCLUDES` in `src/config.ts`.
