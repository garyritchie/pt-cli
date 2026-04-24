# TODO, Errors, etc.

## Resolved

- [x] Not all scripts/executables are detected during learn. For example `pt learn LRL/LSK` picked up godot.mk and production.mk but failed to pick up blender and godot (executable bash scripts) and the main makefile.
  - NOTE: makefile should be ignored by postcopy because it should be part of copyfiles for virtually every project. Not sure how to handle this.
- ✅ `.git` in config.yaml — Fixed in `shouldExclude()` — was checking `path.basename(dirPath)` (parent dir) instead of `path.basename(fullPath)` (entry name). Now correctly excludes `.git` folders.
- ✅ `pt update` ambiguity — Added `[path]` optional argument: `pt update Godot LRL/LSK`. Falls back to `.` if no path given.
- ✅ "Keep current type" message — Changed to `Change type from "Godot"?`. Lists available types when user says "No".
- ✅ `--ignore` feature — Added top-level `ignore` key in config.yaml and `--ignore` CLI flag for `pt learn`/`pt update`. CLI patterns merge with config patterns (one-shot, not persistent).
