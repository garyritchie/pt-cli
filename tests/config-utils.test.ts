import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing BEFORE importing from the CLI
const testHome = path.join(process.cwd(), '.test-home-config-utils');
process.env.HOME = testHome;

import {
  ensureConfigDir,
  getTemplateNames,
  getDefaultPostConfig,
  shouldExclude,
  shouldIgnore,
  shouldExcludeFile,
  sanitizePath,
  DEFAULT_EXCLUDES,
  getHomeDir,
  PtConfig,
} from '../src/config.js';

// Clean up test home after all tests
after(() => {
  if (fs.existsSync(testHome)) {
    fs.rmSync(testHome, { recursive: true, force: true });
  }
});

// ─── ensureConfigDir ─────────────────────────────────────────────────────────

test('ensureConfigDir creates dir when it does not exist', () => {
  // Make sure the dir does NOT exist before the test
  if (fs.existsSync(getHomeDir())) {
    fs.rmSync(getHomeDir(), { recursive: true, force: true });
  }
  assert.ok(!fs.existsSync(getHomeDir()), 'Precondition: getHomeDir() should not exist');

  ensureConfigDir();

  assert.ok(fs.existsSync(getHomeDir()), 'getHomeDir() should be created');
  assert.ok(fs.statSync(getHomeDir()).isDirectory(), 'getHomeDir() should be a directory');
});

test('ensureConfigDir does nothing when dir already exists', () => {
  // Ensure directory exists first
  if (!fs.existsSync(getHomeDir())) {
    fs.mkdirSync(getHomeDir(), { recursive: true });
  }
  // Place a marker file inside to prove the dir is not recreated
  const markerPath = path.join(getHomeDir(), '.marker');
  fs.writeFileSync(markerPath, 'exists');

  ensureConfigDir();

  assert.ok(fs.existsSync(getHomeDir()), 'getHomeDir() should still exist');
  assert.ok(fs.existsSync(markerPath), 'Marker file inside getHomeDir() should still exist');

  // Clean up marker
  fs.unlinkSync(markerPath);
});

// ─── getTemplateNames ────────────────────────────────────────────────────────

test('getTemplateNames returns empty array for empty templates', () => {
  const config: PtConfig = { version: '3.0', templates: {} };
  const names = getTemplateNames(config);
  assert.deepStrictEqual(names, []);
});

test('getTemplateNames returns correct names', () => {
  const config: PtConfig = {
    version: '3.0',
    templates: {
      'node-api': { description: 'Node API', folders: [] },
      'react-app': { description: 'React App', folders: [] },
      'python-cli': { description: 'Python CLI', folders: [] },
    },
  };
  const names = getTemplateNames(config);
  assert.deepStrictEqual(names, ['node-api', 'react-app', 'python-cli']);
});

test('getTemplateNames handles undefined templates', () => {
  // Simulate a config with templates missing entirely
  const config = { version: '3.0' } as PtConfig;
  const names = getTemplateNames(config);
  assert.deepStrictEqual(names, []);
});

// ─── getDefaultPostConfig ────────────────────────────────────────────────────

test('getDefaultPostConfig returns empty array when no default_post_config', () => {
  const config: PtConfig = { version: '3.0', templates: {} };
  const tasks = getDefaultPostConfig(config);
  assert.deepStrictEqual(tasks, []);
});

test('getDefaultPostConfig returns empty array when default_post_config is undefined', () => {
  const config = { version: '3.0', templates: {} } as PtConfig;
  delete (config as any).default_post_config;
  const tasks = getDefaultPostConfig(config);
  assert.deepStrictEqual(tasks, []);
});

test('getDefaultPostConfig defaults checked to true', () => {
  const config: PtConfig = {
    version: '3.0',
    templates: {},
    default_post_config: [
      { description: 'Install deps', command: 'npm install' },
      { description: 'Run lint', command: 'npm run lint' },
    ],
  };
  const tasks = getDefaultPostConfig(config);

  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].checked, true, 'First task should default checked to true');
  assert.strictEqual(tasks[1].checked, true, 'Second task should default checked to true');
  assert.strictEqual(tasks[0].description, 'Install deps');
  assert.strictEqual(tasks[0].command, 'npm install');
});

test('getDefaultPostConfig preserves checked=false', () => {
  const config: PtConfig = {
    version: '3.0',
    templates: {},
    default_post_config: [
      { description: 'Optional step', command: 'echo optional', checked: false },
      { description: 'Required step', command: 'echo required', checked: true },
      { description: 'Default step', command: 'echo default' },
    ],
  };
  const tasks = getDefaultPostConfig(config);

  assert.strictEqual(tasks.length, 3);
  assert.strictEqual(tasks[0].checked, false, 'Explicitly false should stay false');
  assert.strictEqual(tasks[1].checked, true, 'Explicitly true should stay true');
  assert.strictEqual(tasks[2].checked, true, 'Undefined checked should default to true');
});

// ─── DEFAULT_EXCLUDES ────────────────────────────────────────────────────────

test('DEFAULT_EXCLUDES contains expected patterns', () => {
  assert.ok(Array.isArray(DEFAULT_EXCLUDES), 'DEFAULT_EXCLUDES should be an array');
  assert.ok(DEFAULT_EXCLUDES.includes('.git'), 'Should include .git');
  assert.ok(DEFAULT_EXCLUDES.includes('node_modules'), 'Should include node_modules');
  assert.ok(DEFAULT_EXCLUDES.includes('dist'), 'Should include dist');
  assert.ok(DEFAULT_EXCLUDES.includes('build'), 'Should include build');
  assert.ok(DEFAULT_EXCLUDES.includes('.DS_Store'), 'Should include .DS_Store');
  assert.ok(DEFAULT_EXCLUDES.includes('.vscode'), 'Should include .vscode');
  assert.ok(DEFAULT_EXCLUDES.includes('Thumbs.db'), 'Should include Thumbs.db');
});

// ─── shouldExclude ───────────────────────────────────────────────────────────

test('shouldExclude excludes default patterns', () => {
  const dirPath = '/project';
  // Each default exclude should be matched by name
  for (const name of DEFAULT_EXCLUDES) {
    const fullPath = path.join(dirPath, name);
    assert.ok(
      shouldExclude(dirPath, fullPath),
      `Should exclude "${name}" (default pattern)`
    );
  }
});

test('shouldExclude does NOT exclude normal directories', () => {
  const dirPath = '/project';
  const normalDirs = ['src', 'lib', 'tests', 'docs', 'scripts', 'assets', 'public'];
  for (const name of normalDirs) {
    const fullPath = path.join(dirPath, name);
    assert.ok(
      !shouldExclude(dirPath, fullPath),
      `Should NOT exclude "${name}"`
    );
  }
});

test('shouldExclude handles custom excludes', () => {
  const dirPath = '/project';
  const customExcludes = ['vendor', 'tmp', 'coverage'];

  for (const name of customExcludes) {
    const fullPath = path.join(dirPath, name);
    assert.ok(
      shouldExclude(dirPath, fullPath, customExcludes),
      `Should exclude custom pattern "${name}"`
    );
  }

  // Normal dirs still pass
  assert.ok(!shouldExclude(dirPath, path.join(dirPath, 'src'), customExcludes));
});

test('shouldExclude handles git submodules via .gitmodules detection', () => {
  // Create a temporary project structure with a .gitmodules file
  const tmpProject = path.join(testHome, '_test_shouldExclude_submodule');
  const submoduleName = 'my-submodule';
  const submodulePath = path.join(tmpProject, submoduleName);
  fs.mkdirSync(submodulePath, { recursive: true });

  // Write a .gitmodules file that references the submodule
  const gitmodulesContent = `[submodule "${submoduleName}"]\n\tpath = ${submoduleName}\n\turl = https://example.com/repo.git\n`;
  fs.writeFileSync(path.join(tmpProject, '.gitmodules'), gitmodulesContent);

  // shouldExclude checks for .gitmodules in the parent of fullPath
  const result = shouldExclude(tmpProject, submodulePath);
  assert.ok(result, 'Should exclude a git submodule listed in .gitmodules');

  // Non-submodule dir in the same project should NOT be excluded
  const otherDir = path.join(tmpProject, 'regular-dir');
  fs.mkdirSync(otherDir, { recursive: true });
  const otherResult = shouldExclude(tmpProject, otherDir);
  assert.ok(!otherResult, 'Should NOT exclude a non-submodule directory');

  // Clean up
  fs.rmSync(tmpProject, { recursive: true, force: true });
});

test('shouldExclude with empty custom excludes behaves like default only', () => {
  const dirPath = '/project';
  assert.ok(shouldExclude(dirPath, path.join(dirPath, 'node_modules'), []));
  assert.ok(!shouldExclude(dirPath, path.join(dirPath, 'src'), []));
});

// ─── shouldIgnore ────────────────────────────────────────────────────────────

test('shouldIgnore returns false when no patterns provided', () => {
  assert.strictEqual(shouldIgnore('src', 'src'), false);
  assert.strictEqual(shouldIgnore('src', 'src', []), false);
  assert.strictEqual(shouldIgnore('src', 'src', undefined), false);
});

test('shouldIgnore deep match with **/FOLDER', () => {
  assert.ok(
    shouldIgnore('logs', 'app/data/logs', ['**/logs']),
    'Should match "logs" at any depth via **/logs'
  );
  assert.ok(
    shouldIgnore('logs', 'logs', ['**/logs']),
    'Should match "logs" at root via **/logs'
  );
  assert.ok(
    !shouldIgnore('src', 'app/src', ['**/logs']),
    'Should not match folder named "src" when pattern is **/logs'
  );
});

test('shouldIgnore deep match with **/FOLDER/ trailing slash', () => {
  assert.ok(
    shouldIgnore('cache', 'deep/nested/cache', ['**/cache/']),
    'Should match with trailing slash in pattern'
  );
});

test('shouldIgnore FOLDER/* wildcard children match', () => {
  // FOLDER/* should match children of FOLDER, not FOLDER itself
  assert.ok(
    shouldIgnore('child', 'DAILIES/child', ['DAILIES/*']),
    'Should match child inside DAILIES with DAILIES/*'
  );
  assert.ok(
    !shouldIgnore('DAILIES', 'DAILIES', ['DAILIES/*']),
    'Should NOT match DAILIES itself with DAILIES/*'
  );
  assert.ok(
    shouldIgnore('deep', 'DAILIES/deep', ['DAILIES/*']),
    'Should match any immediate child of DAILIES'
  );
});

test('shouldIgnore FOLDER/** deep wildcard match', () => {
  assert.ok(
    shouldIgnore('nested', 'DAILIES/nested', ['DAILIES/**']),
    'Should match child inside DAILIES with DAILIES/**'
  );
  assert.ok(
    !shouldIgnore('DAILIES', 'DAILIES', ['DAILIES/**']),
    'Should NOT match DAILIES itself with DAILIES/**'
  );
  assert.ok(
    shouldIgnore('deep', 'DAILIES/deep', ['DAILIES/**']),
    'Should match deep nested child of DAILIES'
  );
});

test('shouldIgnore exact match by name', () => {
  assert.ok(
    shouldIgnore('temp', 'temp', ['temp']),
    'Should match exact folder name'
  );
  assert.ok(
    !shouldIgnore('temporary', 'temporary', ['temp']),
    'Should NOT match partial folder name'
  );
});

test('shouldIgnore exact match by path', () => {
  assert.ok(
    shouldIgnore('logs', 'data/logs', ['data/logs']),
    'Should match exact relative path'
  );
  assert.ok(
    !shouldIgnore('logs', 'other/logs', ['data/logs']),
    'Should NOT match different path with same name'
  );
});

test('shouldIgnore trailing slash handling on exact match', () => {
  assert.ok(
    shouldIgnore('temp', 'temp', ['temp/']),
    'Should match exact name even with trailing slash in pattern'
  );
});

test('shouldIgnore returns false for non-matching patterns', () => {
  const patterns = ['**/cache', 'vendor/*', 'tmp'];
  assert.strictEqual(shouldIgnore('src', 'src', patterns), false);
  assert.strictEqual(shouldIgnore('lib', 'project/lib', patterns), false);
  assert.strictEqual(shouldIgnore('app', 'app', patterns), false);
});

test('shouldIgnore handles multiple patterns', () => {
  const patterns = ['**/logs', 'tmp', 'data/*'];

  assert.ok(shouldIgnore('logs', 'deep/logs', patterns), 'Should match **/logs');
  assert.ok(shouldIgnore('tmp', 'tmp', patterns), 'Should match tmp');
  assert.ok(shouldIgnore('file', 'data/file', patterns), 'Should match data/*');
  assert.ok(!shouldIgnore('src', 'src', patterns), 'Should not match src');
});

// ─── shouldExcludeFile ───────────────────────────────────────────────────────

test('shouldExcludeFile excludes wildcard extension patterns', () => {
  const wildcardExcludes = [
    'module.pyc',
    'cache.pyo',
    'native.pyd',
    'info.egg-info',
    'dist.egg',
    'dep.whl',
    'lib.so',
    'lib.dll',
    'lib.dylib',
    'app.exe',
    'main.o',
    'archive.a',
    'static.lib',
    'Main.class',
    'app.jar',
    'app.war',
    'app.ear',
    'server.log',
    'data.tmp',
    'file.swp',
    'file.swo',
    'backup~',
    'readme.md',
    'notes.txt',
    'data.json',
    'config.yaml',
    'settings.yml',
    'setup.ini',
    'app.conf',
    'lint.config',
  ];

  for (const file of wildcardExcludes) {
    assert.ok(
      shouldExcludeFile(file),
      `Should exclude "${file}"`
    );
  }
});

test('shouldExcludeFile excludes exact match files', () => {
  const exactExcludes = [
    '.Python',
    '.bak',
    '.gitconfig',
    '.makerc',
    'Gemfile.lock',
    'package.json',
    'package-lock.json',
    'yarn.lock',
    'pnpm-lock.yaml',
    'composer.json',
    'composer.lock',
  ];

  for (const file of exactExcludes) {
    assert.ok(
      shouldExcludeFile(file),
      `Should exclude exact match "${file}"`
    );
  }
});

test('shouldExcludeFile does NOT exclude normal source files', () => {
  const normalFiles = [
    'index.js',
    'app.ts',
    'styles.css',
    'template.html',
    'image.png',
    'photo.jpg',
    'Dockerfile',
    'Makefile',
    'script.sh',
    'main.go',
    'lib.rs',
    'App.vue',
    'Component.jsx',
    'handler.py',
    'server.rb',
  ];

  for (const file of normalFiles) {
    assert.ok(
      !shouldExcludeFile(file),
      `Should NOT exclude "${file}"`
    );
  }
});

// ─── sanitizePath ────────────────────────────────────────────────────────────

test('sanitizePath removes .. segments', () => {
  const result = sanitizePath('foo/../bar');
  assert.strictEqual(result, ['foo', 'bar'].join(path.sep));
});

test('sanitizePath removes . segments', () => {
  const result = sanitizePath('foo/./bar');
  assert.strictEqual(result, ['foo', 'bar'].join(path.sep));
});

test('sanitizePath removes empty segments', () => {
  const result = sanitizePath('foo//bar///baz');
  assert.strictEqual(result, ['foo', 'bar', 'baz'].join(path.sep));
});

test('sanitizePath handles mixed separators', () => {
  const result = sanitizePath('foo\\..\\bar/./baz');
  assert.strictEqual(result, ['foo', 'bar', 'baz'].join(path.sep));
});

test('sanitizePath normal path passes through', () => {
  const result = sanitizePath('src/components/App');
  assert.strictEqual(result, ['src', 'components', 'App'].join(path.sep));
});

test('sanitizePath strips leading traversal attempts', () => {
  const result = sanitizePath('../../etc/passwd');
  assert.strictEqual(result, ['etc', 'passwd'].join(path.sep));
});

test('sanitizePath handles path with only dots and slashes', () => {
  const result = sanitizePath('../../../..');
  assert.strictEqual(result, '');
});

test('sanitizePath trims whitespace from segments', () => {
  const result = sanitizePath(' foo / bar / baz ');
  assert.strictEqual(result, ['foo', 'bar', 'baz'].join(path.sep));
});

test('sanitizePath returns empty string for empty input', () => {
  const result = sanitizePath('');
  assert.strictEqual(result, '');
});
