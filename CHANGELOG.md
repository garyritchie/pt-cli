# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.3.0] - 2026-09-08

### Added

- **Multi-template task deduplication**: `pt init` now deduplicates post-config tasks across templates by command+description, executing each unique task only once
- **ID-based task selection**: Internal `_id` fields prevent key collisions when identical commands exist in multiple templates

### Changed

- **Aggregated security warnings**: Single security prompt for all templates (was per-template), preventing early abort when one template has dangerous commands
- **Template attribution in UI**: Deduplicated tasks show all contributing templates (e.g., `[base-template, addon-template]`)

### Fixed

- Duplicate `git init` execution when multiple templates include the same post-config task
- Security warning loop that cancelled all templates when user declined one template's post-config

---

## [1.2.0] - 2026-09-04

### Added

- **Modular multi-template initialization**: `pt init <template1> <template2> <target>` combines folders, files, variables, and post-config from multiple templates
- **Collision handling**: Detects and reports conflicting folder names, file destinations, and variable definitions across templates
- **Readme renaming**: Auto-renames `README.md` from each template to `README_<template>.md` to prevent overwrites

### Changed

- **Init command accepts multiple templates**: Space-separated template names before target directory
- **Variable merging**: Template variables merged with collision detection and clear error messages

---

## [1.1.0] - 2026-09-03

### Added

- **Shell completions**: `pt completion <bash|zsh|fish>` generates shell completion scripts
- **Completion install guidance**: Printed instructions for adding to shell rc files

### Fixed

- **Shell completions interfere with PT-GUI**: Removed auto-install behavior that broke GUI integration; completions now opt-in only

---

## [1.0.0] - 2026-07-31

### 🎉 First Stable Release

This release locks the public API for the 1.x series. See [README](README.md#10-release--api-stability) for stability guarantees.

### Changed

- **Version bump**: 0.42.0 → 1.0.0
- **Documentation overhaul**: Added API stability promise, versioning policy, migration guide, and locked CLI/config/JSON schemas to README
- **Config schema v3.0 locked**: No breaking changes to `~/.pt/config.yaml` or `.pt-template.json` in 1.x

### Fixed

- All documentation files updated to reflect current implementation (exclusions, testing, variable substitution)

---

## [0.42.0] - 2026-07-25

### Added

- Security enhancements and audit logging improvements
- Additional security test coverage

### Fixed

- Consistent key ordering in config.yaml output (name → prompt → default → required)

---

## [0.41.0] - 2026-07-20

### Added

- Shared utility modules for template parsing
- Comprehensive test suites for config-utils, learn, and substitute commands
- Testing guide documentation

### Fixed

- Learn and update checkbox interaction bugs
- Config test isolation by making HOME_DIR dynamic
- Critical issue where config was being wiped during test execution

---

## [0.40.0] - 2026-07-15

### Added

- **Remote template learning**: `pt learn https://github.com/user/repo` downloads and learns from Git repositories and tarball URLs
- Trusted source verification with `--allow-untrusted` override
- Automatic URL translation for GitHub/Gitea to tarball endpoints

### Changed

- Improved template sharing and portability workflow
- Strip trailing `.git` from repository URLs

---

## [0.39.0] - 2026-07-10

### Added

- JSON template config files (`.pt-template.json`, `template.json`) take precedence over `.info.md` and shell scripts
- Full template metadata auto-detection from JSON config files
- JSON export/import for template sharing

### Fixed

- JSON variables take precedence during update
- Update docs for remote learn

---

## [0.38.0] - 2026-07-05

### Added

- **Additive diff mode for `pt update`** (default): Shows only new folders/files/variables for de-selection
- `--no-diff` flag to restore full/original update mode
- Preserves existing `substitute_variables` and `post_copy` settings during updates

### Changed

- Default post-config tasks renamed from `global_post_config` → `default_post_config`
- Default tasks now baked into template at learn time (not auto-applied at init)

---

## [0.37.0] - 2026-06-28

### Added

- Security model: command validation, blocklists, dangerous command warnings with 5-second countdown
- Rate limiting (50 commands per init session)
- Execution timeout (30 seconds per command)
- Audit logging to `~/.pt/security-audit.log`
- Trusted sources for remote template downloads
- `pt security-response` command for GUI integration

### Fixed

- Security warning loop issues
- Variables not replaced during init; missing chmod for scripts
- Selecting "N" during learn with untrusted URL now exits cleanly

---

## [0.36.0] - 2026-06-20

### Added

- **Nested variable expansion**: Variables can contain other `{{ variable }}` placeholders resolved iteratively (up to 10 passes)
- **Parent directory `.env` file scanning**: Automatic defaults from `.env` files up to 3 levels up
- Circular reference detection and graceful handling
- Whitespace preservation for unresolved placeholders

---

## [0.35.0] - 2026-06-15

### Added

- Default post-config tasks (`default_post_config`) with `checked`, `type` filter fields
- `pt default-post-config` command for managing default tasks via JSON
- Template-specific post-config with `always_prompt`, `script`, `cross_platform` fields
- Auto-detection of post-config from `post_config.sh`/`post_config.bat`

---

## [0.34.0] - 2026-06-10

### Added

- Global variables in config.yaml with `name`, `prompt`, `default`, `required` fields
- `pt variables` command for managing global variables (`--set`, `--delete`, `--json`)
- Variable suggestions during `pt learn`/`pt update`

---

## [0.33.0] - 2026-06-05

### Added

- `pt add` command for importing templates from JSON string/file
- `pt config --json` for full config export
- `pt config <template> --json` for single template export
- Direct JSON scaffolding: `pt init --file template.json`

---

## [0.32.0] - 2026-05-28

### Added

- Comprehensive test suite (114+ tests passing)
- Test isolation with dynamic HOME directory
- Sequential test run option (`npm run test:sequential`)

---

## [0.31.0] - 2026-05-20

### Added

- Config version 3.0 migration (auto-migrates from v2.0)
- Renames `name` → `description`, removes `type` field
- Migrates `global_post_config` → `default_post_config`
- Normalizes variables from Record → TemplateVariable[]

---

## [0.30.0] - 2026-05-10

### Added

- Automatic variable detection from `{{ var }}` placeholders during `pt learn`/`pt update`
- Auto-detection of executable scripts for `post_copy`
- Folder ignore patterns with glob support (`DAILIES/*`, `**/FOLDER/`, etc.)

---

## [0.20.0 - 0.29.0] - 2026-04 to 2026-05

### Added (Incremental)

- Core `pt learn`, `pt init`, `pt update`, `pt config`, `pt remove` commands
- Template structure learning with folder hierarchy
- Variable substitution in `copy_files` with `substitute_variables`
- Post-copy executable handling
- Remote template infrastructure
- Cross-platform binary builds (Linux, macOS, Windows via Bun)

---

## [0.10.0] - 2026-03-15

### Added

- Initial project structure
- TypeScript + Commander.js CLI framework
- Basic template learning and initialization
- YAML config storage at `~/.pt/config.yaml`

---

## Migration Guides

### 0.x → 1.0.0

**No manual action required.** Run any `pt` command and your config auto-migrates from v2.0 → v3.0 with a `.bak` backup created.

Key 0.x breaking changes already applied in earlier versions:

- Config v3.0 (0.31+): `name`→`description`, `global_post_config`→`default_post_config`
- Additive update mode (0.38+): `pt update` shows diffs by default
- Nested variables (0.36+): `.env` scanning and iterative expansion
- Security model (0.37+): Command validation, audit logging

### 0.30 → 0.31 (Config v3.0)

Auto-migration handles:

- `template.name` → `template.description`
- `template.type` removed
- `global_post_config` → `default_post_config`
- `variables` Record → `TemplateVariable[]`

---

## Links

- [GitHub Releases](https://github.com/garyritchie/pt-cli/releases)
- [npm Package](https://www.npmjs.com/package/@garyr/pt-cli)
- [Documentation](doc/)
