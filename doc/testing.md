# Testing pt-cli

This guide explains how to run, write, and manage the test suite for `pt-cli`.

## Overview

The test suite uses Node.js's native test runner (`node:test`) and assertion library (`node:assert`). It is configured to run files ending with `.test.ts` in the `tests/` directory.

## Test Suite Summary (as of v1.0.0)

| Test File | Focus | Test Count |
|-----------|-------|------------|
| `config.test.ts` | Config loading, saving, migration, atomic writes | ~30 |
| `init.test.ts` | Project initialization, variables, dry-run, copy_files, post_copy | ~20 |
| `learn.test.ts` | Template learning, updates, variable detection, JSON output | ~25 |
| `update.test.ts` | Additive diff mode, full mode, post-config, JSON config | ~15 |
| `substitute.test.ts` | Variable substitution, nested expansion, edge cases | ~15 |
| `safety.test.ts` | Security validation, command blocking, audit logging | ~15 |
| `remote.test.ts` | Remote template download, trusted sources | ~10 |
| `config-utils.test.ts` | Ignore patterns, path sanitization, exclusions | ~10 |
| `nested-variable-expansion.test.ts` | Nested variable resolution, circular refs | ~5 |
| `env-scanning.test.ts` | Parent directory `.env` file scanning | ~5 |
| `final-rst-verification.test.ts` | End-to-end integration | ~5 |

**Total: ~146 tests, all passing**

## Running Tests

### 1. Run the Entire Test Suite

```bash
npm test
```

This runs the underlying command:

```bash
node --import tsx --test tests/**/*.test.ts
```

### 2. Run Individual Test Files

To run a specific test suite, use `tsx`:

```bash
npx tsx --test tests/config.test.ts
npx tsx --test tests/init.test.ts
npx tsx --test tests/learn.test.ts
npx tsx --test tests/substitute.test.ts
```

### 3. Run with Test Coverage

To generate a test coverage report directly in the terminal:

```bash
node --experimental-test-coverage --import tsx --test tests/**/*.test.ts
```

### 4. Sequential Test Run (for debugging)

Some tests modify shared state (HOME directory). To run sequentially:

```bash
npm run test:sequential
```

---

## Security Testing

Security features can be tested by:

1. **Testing command blocks**: Try running templates with dangerous commands like `sudo rm -rf` or `dd`
2. **Testing remote downloads**: Use untrusted URLs to verify source verification
3. **Testing rate limiting**: Execute more than 50 commands in a single init session
4. **Testing timeouts**: Run commands that hang to verify timeout behavior
5. **Reviewing audit logs**: Check `~/.pt/security-audit.log` for security events

For more details, see the [Security Guide](security.md).

---

## Writing Tests

When writing new tests, please adhere to these guidelines:

1. **Use Native imports**: Import `test` from `node:test` and `assert` from `node:assert`. Do not use external testing frameworks (like Mocha, Jest, or Vitest).
2. **ESM Imports**: Since this is an ESM (ECMAScript Modules) project, file imports within tests must use the `.js` extension (e.g., `import { learn } from '../src/commands/learnCommand.js';`).
3. **Environment Isolation**: The configuration path relies on `process.env.HOME`. To prevent tests from polluting your user config directory, override the home directory before importing any CLI files:
   ```typescript
   const testHome = path.join(process.cwd(), ".test-home-custom");
   process.env.HOME = testHome;
   ```
4. **Cleanup**: Always ensure temporary files, workspace directories, and test home directories are deleted after tests complete (e.g., in a `finally` block or `after` hook).
