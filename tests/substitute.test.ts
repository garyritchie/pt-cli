import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing BEFORE importing from the CLI
const testHome = path.join(process.cwd(), '.test-home-substitute');
process.env.HOME = testHome;

import { substituteVariables, processCopyFiles } from '../src/substitute.js';
import { TemplateConfig } from '../src/config.js';

// Helper: create a temp directory and return its path
function makeTempDir(name: string): string {
  const dir = path.join(process.cwd(), `.test-tmp-substitute-${name}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Helper: recursively remove a directory
function rmDir(dir: string) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Clean up the test home after all tests
after(() => {
  rmDir(testHome);
});

// ============================================================
// substituteVariables tests
// ============================================================

test('substituteVariables: basic single variable substitution', () => {
  const result = substituteVariables('Hello {{ name }}!', { name: 'World' });
  assert.strictEqual(result, 'Hello World!');
});

test('substituteVariables: multiple variables in one string', () => {
  const result = substituteVariables(
    '{{ greeting }}, {{ name }}! Welcome to {{ place }}.',
    { greeting: 'Hello', name: 'Alice', place: 'Wonderland' }
  );
  assert.strictEqual(result, 'Hello, Alice! Welcome to Wonderland.');
});

test('substituteVariables: variable with extra whitespace in braces', () => {
  const result = substituteVariables('Value is {{  name  }}.', { name: 'OK' });
  assert.strictEqual(result, 'Value is OK.');
});

test('substituteVariables: variable with no whitespace in braces', () => {
  const result = substituteVariables('Value is {{name}}.', { name: 'OK' });
  assert.strictEqual(result, 'Value is OK.');
});

test('substituteVariables: missing variable remains as normalized placeholder', () => {
  const result = substituteVariables('Hello {{ unknown }}!', {});
  // The regex replaces {{ unknown }} with {{unknown}} (no spaces) when not found
  assert.strictEqual(result, 'Hello {{unknown}}!');
});

test('substituteVariables: empty variables object leaves all placeholders', () => {
  const content = '{{ foo }} and {{ bar }}';
  const result = substituteVariables(content, {});
  assert.strictEqual(result, '{{foo}} and {{bar}}');
});

test('substituteVariables: no variables in content returns content unchanged', () => {
  const content = 'Just a plain string with no mustaches.';
  const result = substituteVariables(content, { name: 'ignored' });
  assert.strictEqual(result, content);
});

test('substituteVariables: mixed - some found, some not', () => {
  const result = substituteVariables(
    '{{ found }} and {{ missing }}',
    { found: 'YES' }
  );
  assert.strictEqual(result, 'YES and {{missing}}');
});

test('substituteVariables: repeated variable is substituted in all occurrences', () => {
  const result = substituteVariables(
    '{{ x }} + {{ x }} = {{ result }}',
    { x: '2', result: '4' }
  );
  assert.strictEqual(result, '2 + 2 = 4');
});

test('substituteVariables: empty string content', () => {
  const result = substituteVariables('', { name: 'test' });
  assert.strictEqual(result, '');
});

test('substituteVariables: value containing braces is not re-processed', () => {
  // Substituted values should be inserted literally, no recursive substitution
  const result = substituteVariables('{{ name }}', { name: '{{ other }}' });
  assert.strictEqual(result, '{{ other }}');
});

// ============================================================
// processCopyFiles tests
// ============================================================

test('processCopyFiles: template with no copy_files returns immediately', async () => {
  const template: TemplateConfig = {
    description: 'No copy files',
    folders: [],
    // no copy_files key at all
  };

  // Should complete without error
  await processCopyFiles('/nonexistent', '/nonexistent', template, {}, false);
});

test('processCopyFiles: copy single file without substitution', async () => {
  const templateRoot = makeTempDir('copy-single-src');
  const destDir = makeTempDir('copy-single-dest');

  try {
    // Create source file
    fs.writeFileSync(path.join(templateRoot, 'readme.txt'), 'Hello {{ name }}!');

    const template: TemplateConfig = {
      description: 'Single copy',
      folders: [],
      copy_files: [
        { src: 'readme.txt', dest: 'readme.txt' }
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, { name: 'World' }, false);

    const destFile = path.join(destDir, 'readme.txt');
    assert.ok(fs.existsSync(destFile), 'Destination file should exist');
    // Without substitute_variables, content should be unchanged
    const content = fs.readFileSync(destFile, 'utf-8');
    assert.strictEqual(content, 'Hello {{ name }}!');
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: copy single file with substitution enabled', async () => {
  const templateRoot = makeTempDir('copy-sub-src');
  const destDir = makeTempDir('copy-sub-dest');

  try {
    // Create source file with variable placeholders
    fs.writeFileSync(
      path.join(templateRoot, 'config.txt'),
      'project={{ project_name }}\nauthor={{ author }}'
    );

    const template: TemplateConfig = {
      description: 'Copy with substitution',
      folders: [],
      copy_files: [
        { src: 'config.txt', dest: 'config.txt', substitute_variables: true }
      ],
    };

    await processCopyFiles(
      templateRoot,
      destDir,
      template,
      { project_name: 'MyApp', author: 'Alice' },
      false
    );

    const destFile = path.join(destDir, 'config.txt');
    assert.ok(fs.existsSync(destFile), 'Destination file should exist');
    const content = fs.readFileSync(destFile, 'utf-8');
    assert.strictEqual(content, 'project=MyApp\nauthor=Alice');
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: copy to nested destination path', async () => {
  const templateRoot = makeTempDir('copy-nested-src');
  const destDir = makeTempDir('copy-nested-dest');

  try {
    fs.writeFileSync(path.join(templateRoot, 'file.txt'), 'content');

    const template: TemplateConfig = {
      description: 'Nested dest',
      folders: [],
      copy_files: [
        { src: 'file.txt', dest: 'sub/dir/file.txt' }
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, {}, false);

    const destFile = path.join(destDir, 'sub', 'dir', 'file.txt');
    assert.ok(fs.existsSync(destFile), 'File should be created in nested directory');
    assert.strictEqual(fs.readFileSync(destFile, 'utf-8'), 'content');
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: copy a directory recursively', async () => {
  const templateRoot = makeTempDir('copy-dir-src');
  const destDir = makeTempDir('copy-dir-dest');

  try {
    // Create a source directory structure
    const srcDir = path.join(templateRoot, 'scripts');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'run.sh'), '#!/bin/bash\necho "hello"');
    fs.mkdirSync(path.join(srcDir, 'utils'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils', 'helper.sh'), '#!/bin/bash\necho "helper"');

    const template: TemplateConfig = {
      description: 'Directory copy',
      folders: [],
      copy_files: [
        { src: 'scripts', dest: 'scripts' }
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, {}, false);

    // Verify the directory structure was copied
    assert.ok(fs.existsSync(path.join(destDir, 'scripts', 'run.sh')), 'run.sh should exist');
    assert.ok(fs.existsSync(path.join(destDir, 'scripts', 'utils', 'helper.sh')), 'helper.sh should exist');
    assert.strictEqual(
      fs.readFileSync(path.join(destDir, 'scripts', 'run.sh'), 'utf-8'),
      '#!/bin/bash\necho "hello"'
    );
    assert.strictEqual(
      fs.readFileSync(path.join(destDir, 'scripts', 'utils', 'helper.sh'), 'utf-8'),
      '#!/bin/bash\necho "helper"'
    );
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: recursive directory copy with substitution', async () => {
  const templateRoot = makeTempDir('copy-dir-sub-src');
  const destDir = makeTempDir('copy-dir-sub-dest');

  try {
    const srcDir = path.join(templateRoot, 'templates');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'index.html'), '<title>{{ title }}</title>');
    fs.mkdirSync(path.join(srcDir, 'css'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'css', 'theme.css'), '/* Theme: {{ theme }} */');

    const template: TemplateConfig = {
      description: 'Dir copy with substitution',
      folders: [],
      copy_files: [
        { src: 'templates', dest: 'output', substitute_variables: true }
      ],
    };

    await processCopyFiles(
      templateRoot,
      destDir,
      template,
      { title: 'My Page', theme: 'dark' },
      false
    );

    assert.strictEqual(
      fs.readFileSync(path.join(destDir, 'output', 'index.html'), 'utf-8'),
      '<title>My Page</title>'
    );
    assert.strictEqual(
      fs.readFileSync(path.join(destDir, 'output', 'css', 'theme.css'), 'utf-8'),
      '/* Theme: dark */'
    );
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: dry run mode does not copy files', async () => {
  const templateRoot = makeTempDir('dryrun-src');
  const destDir = makeTempDir('dryrun-dest');

  try {
    fs.writeFileSync(path.join(templateRoot, 'data.txt'), 'should not be copied');

    const template: TemplateConfig = {
      description: 'Dry run test',
      folders: [],
      copy_files: [
        { src: 'data.txt', dest: 'data.txt' }
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, {}, true);

    // In dry run, the file should NOT be copied
    assert.ok(
      !fs.existsSync(path.join(destDir, 'data.txt')),
      'File should NOT exist in dry run mode'
    );
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: dry run mode with substitution and chmod logs but does not act', async () => {
  const templateRoot = makeTempDir('dryrun-full-src');
  const destDir = makeTempDir('dryrun-full-dest');

  try {
    fs.writeFileSync(path.join(templateRoot, 'script.sh'), '#!/bin/bash\necho {{ msg }}');

    const template: TemplateConfig = {
      description: 'Dry run full',
      folders: [],
      copy_files: [
        { src: 'script.sh', dest: 'script.sh', substitute_variables: true, chmod: '0755' }
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, { msg: 'hello' }, true);

    assert.ok(
      !fs.existsSync(path.join(destDir, 'script.sh')),
      'File should NOT exist in dry run mode'
    );
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: missing source file warns but does not crash', async () => {
  const templateRoot = makeTempDir('missing-src');
  const destDir = makeTempDir('missing-dest');

  try {
    const template: TemplateConfig = {
      description: 'Missing source',
      folders: [],
      copy_files: [
        { src: 'nonexistent.txt', dest: 'nonexistent.txt' }
      ],
    };

    // Should complete without throwing
    await processCopyFiles(templateRoot, destDir, template, {}, false);

    // Destination should not exist
    assert.ok(
      !fs.existsSync(path.join(destDir, 'nonexistent.txt')),
      'Destination file should not exist for missing source'
    );
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: chmod option sets file permissions', async () => {
  // chmod only works properly on non-Windows
  if (process.platform === 'win32') {
    return;
  }

  const templateRoot = makeTempDir('chmod-src');
  const destDir = makeTempDir('chmod-dest');

  try {
    fs.writeFileSync(path.join(templateRoot, 'run.sh'), '#!/bin/bash\necho hi');

    const template: TemplateConfig = {
      description: 'Chmod test',
      folders: [],
      copy_files: [
        { src: 'run.sh', dest: 'run.sh', chmod: '0755' }
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, {}, false);

    const destFile = path.join(destDir, 'run.sh');
    assert.ok(fs.existsSync(destFile), 'File should exist');

    const stat = fs.statSync(destFile);
    // Check that the execute bit is set (0o755 = 493 decimal)
    const mode = stat.mode & 0o777;
    assert.ok(
      (mode & 0o111) !== 0,
      `File should have execute permission, got mode ${mode.toString(8)}`
    );
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: multiple copy_files entries', async () => {
  const templateRoot = makeTempDir('multi-src');
  const destDir = makeTempDir('multi-dest');

  try {
    fs.writeFileSync(path.join(templateRoot, 'a.txt'), 'file a');
    fs.writeFileSync(path.join(templateRoot, 'b.txt'), 'Hello {{ who }}');

    const template: TemplateConfig = {
      description: 'Multiple copies',
      folders: [],
      copy_files: [
        { src: 'a.txt', dest: 'a.txt' },
        { src: 'b.txt', dest: 'b.txt', substitute_variables: true },
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, { who: 'World' }, false);

    assert.strictEqual(fs.readFileSync(path.join(destDir, 'a.txt'), 'utf-8'), 'file a');
    assert.strictEqual(fs.readFileSync(path.join(destDir, 'b.txt'), 'utf-8'), 'Hello World');
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});

test('processCopyFiles: copy_files as empty array does nothing', async () => {
  const template: TemplateConfig = {
    description: 'Empty copy_files',
    folders: [],
    copy_files: [],
  };

  // Should complete without error
  await processCopyFiles('/nonexistent', '/nonexistent', template, {}, false);
});

test('processCopyFiles: dry run on directory copy does not create files', async () => {
  const templateRoot = makeTempDir('dryrun-dir-src');
  const destDir = makeTempDir('dryrun-dir-dest');

  try {
    const srcDir = path.join(templateRoot, 'mydir');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'file.txt'), 'content');

    const template: TemplateConfig = {
      description: 'Dry run dir',
      folders: [],
      copy_files: [
        { src: 'mydir', dest: 'mydir' }
      ],
    };

    await processCopyFiles(templateRoot, destDir, template, {}, true);

    // In dry run, directory copy should not create files
    // Note: the source code logs the green checkmark even in dry run for directories,
    // but the actual copyDirRecursive is skipped, so the dest files won't exist.
    assert.ok(
      !fs.existsSync(path.join(destDir, 'mydir', 'file.txt')),
      'File should NOT exist inside directory in dry run mode'
    );
  } finally {
    rmDir(templateRoot);
    rmDir(destDir);
  }
});
