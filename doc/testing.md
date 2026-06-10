# Testing pt-cli

This guide explains how to run, write, and manage the test suite for `pt-cli`.

## Overview

The test suite uses Node.js's native test runner (`node:test`) and assertion library (`node:assert`). It is configured to run files ending with `.test.ts` in the `tests/` directory.

## Running Tests

### 1. Run the Entire Test Suite
To execute all tests:
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
npx tsx --test tests/learn.test.ts
npx tsx --test tests/substitute.test.ts
```

### 3. Run with Test Coverage
To generate a test coverage report directly in the terminal:
```bash
node --experimental-test-coverage --import tsx --test tests/**/*.test.ts
```

---

## Writing Tests

When writing new tests, please adhere to these guidelines:

1. **Use Native imports**: Import `test` from `node:test` and `assert` from `node:assert`. Do not use external testing frameworks (like Mocha, Jest, or Vitest).
2. **ESM Imports**: Since this is an ESM (ECMAScript Modules) project, file imports within tests must use the `.js` extension (e.g., `import { learn } from '../src/commands/learnCommand.js';`).
3. **Environment Isolation**: The configuration path relies on `process.env.HOME`. To prevent tests from polluting your user config directory, override the home directory before importing any CLI files:
   ```typescript
   const testHome = path.join(process.cwd(), '.test-home-custom');
   process.env.HOME = testHome;
   ```
4. **Cleanup**: Always ensure temporary files, workspace directories, and test home directories are deleted after tests complete (e.g., in a `finally` block or `after` hook).
