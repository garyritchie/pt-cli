# Development

## Repository Layout

The `pt-cli` and `pt-gui` projects live as siblings:

```
pt-cli/    ← Node.js / TypeScript CLI backend
pt-gui/    ← Godot 4 GUI frontend
```

---

## pt-cli

### Build

```bash
npm run build
```

### Watch mode

```bash
npm run watch
```

### Lint

```bash
npm run lint
```

### Project Structure

```
pt-cli/
├── bin/          # CLI entry point (Node shebang wrapper)
├── src/          # TypeScript source
│   ├── config.ts       # Config management, exclusion logic, type definitions, global_post_config helper
│   ├── learn.ts        # Template learning logic + templateRoot storage + executable auto-detection
│   ├── init.ts         # Project initialization + copy_files/post_copy/post_config wiring
│   ├── postconfig.ts   # Post-config runner + baked-in defaults
│   ├── substitute.ts   # Variable substitution + processCopyFiles
│   ├── platform.ts     # Cross-platform shell detection
│   └── index.ts        # CLI command definitions
├── dist/         # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
└── doc/          # Developer documentation
```

### CLI Commands

| Command | Description |
|---|---|
| `pt learn <path>` | Scan a directory and save it as a template |
| `pt init [type] [path]` | Initialize a new project from a template |
| `pt add <name>` | Add or update a template from JSON |
| `pt remove <name>` | Remove a template |
| `pt config` | Show config location and list templates |
| `pt ignore [patterns] --set` | View or update global folder ignore patterns |

All commands support `--yes` / `-y` for non-interactive (agent/GUI) use.

---

## pt-gui

`pt-gui` is a [Godot 4](https://godotengine.org/) application that wraps `pt-cli` via `OS.execute()`. It does **not** duplicate any logic from `pt-cli` — it calls the binary directly.

### Source Structure

```
pt-gui/
├── main.gd              # Root UI controller — all state, threading, CLI calls
├── main.tscn            # Scene file — layout, dialogs, node tree
├── scenes/
│   └── accordion_item.tscn   # Reusable collapsible section component
├── scripts/
│   └── accordion_item.gd     # AccordionItem logic and helper UI builders
├── pt-cli/              # Compiled pt-cli binaries (gitignored)
│   ├── pt-linux
│   ├── pt-macos
│   └── pt-win.exe
├── BUILD/               # Godot export output (gitignored)
├── README.md
└── implementation_plan.md
```

### Runtime Binary Resolution

`main.gd` uses `_get_pt_binary()` to locate the correct `pt-cli` binary at runtime:

1. Checks for a `pt-cli/` folder next to the exported Godot executable.
2. Picks `pt-linux`, `pt-macos`, or `pt-win.exe` based on `OS.get_name()`.
3. Falls back to calling `pt` via the system `PATH` if no compiled binary is found.

The dev fallback calls `pt` via the system `PATH`. To enable this during development, run:

```bash
# In the pt-cli directory:
npm run build && npm link
```

This compiles the TypeScript and symlinks `pt` globally so Godot can find it without any hardcoded paths. After running `npm link`, `pt-gui` will work out of the box in the Godot editor.

### Building Standalone pt-cli Binaries

Binaries are compiled with [Bun](https://bun.sh/) and placed directly into `pt-gui/pt-cli/`:

```bash
# From the pt-cli directory:

# All platforms at once
npm run build:all

# Individual targets
npm run build:linux    # → pt-gui/pt-cli/pt-linux
npm run build:macos    # → pt-gui/pt-cli/pt-macos
npm run build:windows  # → pt-gui/pt-cli/pt-win.exe
```

### Threaded Execution

All `pt-cli` calls are made inside a `Thread` to avoid blocking the Godot UI. The `current_mode` variable tracks what operation is in flight so `_on_pt_complete()` can dispatch the correct response handler.

| Mode | Triggered by |
|---|---|
| `list` | App launch, Cancel, save/delete completion |
| `learn` | Drag & drop or folder browser |
| `save` | Save Template button |
| `save_ignore` | Save in Ignore section |
| `delete` | Delete Template button |
| `init` | Init button (after folder + name entry) |

### Data Exchange

When saving a template, the full template JSON is written to a temporary file at `OS.get_user_data_dir()/temp_template.json`. This avoids command-line length limits and allows structured data to be passed to `pt add <name> --file <path>`.

---

## Development Requirements

| Tool | Purpose |
|---|---|
| Node.js + npm | Running and building `pt-cli` from source |
| TypeScript | `pt-cli` language |
| Godot 4.x | Running `pt-gui` from source |
| Bun | Cross-compiling `pt-cli` to standalone binaries |
