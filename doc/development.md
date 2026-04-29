# Development

## Build

```bash
npm run build
```

## Watch mode

```bash
npm run watch
```

## Lint

```bash
npm run lint
```

## Project Structure

```
pt-cli/
├── bin/          # CLI entry point
├── src/          # TypeScript source
│   ├── config.ts       # Config management, exclusion logic, type definitions
│   ├── learn.ts        # Template learning logic + templateRoot storage + executable auto-detection
│   ├── init.ts         # Project initialization + copy_files/post_copy/post_config wiring
│   ├── postconfig.ts   # Post-config runner + baked-in defaults
│   ├── substitute.ts   # Variable substitution + processCopyFiles
│   ├── platform.ts     # Cross-platform shell detection
│   └── index.ts        # CLI command definitions
├── dist/         # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── post-config_PLAN.md # Feature plan and implementation tracking
└── ROADMAP.md      # Project roadmap
```
