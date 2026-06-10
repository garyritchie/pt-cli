import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-init');
process.env.HOME = testHome;

import { init } from '../src/commands/initCommand.js';
import { loadConfig, saveConfig, PtConfig, CONFIG_PATH } from '../src/config.js';

// Helper to clean up test directories
function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

// Helper to set up a config with a template for testing
function setupTestConfig(templateName: string, template: any): PtConfig {
  const config: PtConfig = {
    version: '3.0',
    templates: {
      [templateName]: template
    }
  };
  saveConfig(config);
  return config;
}

test('direct JSON template initialization via --file', async () => {
  const jsonFilePath = path.join(process.cwd(), 'test-direct-template.json');
  const projectDest = path.join(process.cwd(), 'test-scaffolded-project');

  cleanup(projectDest);

  // Create a mock template JSON configuration
  const mockTemplate = {
    name: 'direct-json-test',
    description: 'A mock template for direct JSON scaffolding test',
    folders: [
      {
        name: 'src',
        info: 'contains sources',
        children: [
          { name: 'components', info: 'reusable components' },
          { name: 'utils', info: 'utility functions' }
        ]
      },
      {
        name: 'docs',
        info: 'documentation folder'
      }
    ]
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(mockTemplate, null, 2));

  // Run the init command with the --file option
  await init(undefined, projectDest, {
    file: jsonFilePath,
    yes: true,
    skipPostConfig: true
  });

  // Verify structure was created successfully
  assert.ok(fs.existsSync(projectDest), 'Project destination folder should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src')), 'src directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src/components')), 'src/components directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src/utils')), 'src/utils directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'docs')), 'docs directory should exist');

  // Verify metadata file .info.md was created
  assert.ok(fs.existsSync(path.join(projectDest, '.info.md')), '.info.md file should exist');
  const infoContent = fs.readFileSync(path.join(projectDest, '.info.md'), 'utf-8');
  assert.ok(infoContent.includes('direct-json-test'), 'Should contain template name');
  assert.ok(infoContent.includes('mock template'), 'Should contain description');

  // Clean up
  cleanup(projectDest, testHome);
});

test('init with --file and typeName as destPath shortcut', async () => {
  const jsonFilePath = path.join(process.cwd(), 'test-file-shortcut.json');
  const projectDest = path.join(process.cwd(), 'test-shortcut-project');

  cleanup(projectDest);

  const mockTemplate = {
    name: 'shortcut-test',
    description: 'Testing typeName-as-dest shortcut',
    folders: [
      { name: 'lib', info: 'library code' }
    ]
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(mockTemplate, null, 2));

  // When --file is provided and only typeName is given (no destPath),
  // typeName becomes the destination path
  await init(projectDest, undefined, {
    file: jsonFilePath,
    yes: true,
    skipPostConfig: true
  });

  assert.ok(fs.existsSync(projectDest), 'Project should be created at typeName path');
  assert.ok(fs.existsSync(path.join(projectDest, 'lib')), 'lib directory should exist');

  // Clean up
  fs.unlinkSync(jsonFilePath);
  cleanup(projectDest, testHome);
});

test('init creates nested folder structure with .info.md files', async () => {
  const projectDest = path.join(process.cwd(), 'test-nested-structure');
  cleanup(projectDest);

  const jsonFilePath = path.join(process.cwd(), 'test-nested-template.json');
  const mockTemplate = {
    name: 'nested-test',
    description: 'Testing nested structure creation',
    folders: [
      {
        name: 'src',
        info: 'Source code directory',
        children: [
          {
            name: 'models',
            info: 'Data models',
            children: [
              { name: 'base', info: 'Base model classes' }
            ]
          },
          { name: 'views', info: 'View templates' }
        ]
      },
      {
        name: 'tests',
        info: 'Test directory'
      }
    ]
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(mockTemplate, null, 2));

  await init(undefined, projectDest, {
    file: jsonFilePath,
    yes: true,
    skipPostConfig: true
  });

  // Verify deeply nested structure
  assert.ok(fs.existsSync(path.join(projectDest, 'src')), 'src should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src/models')), 'src/models should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src/models/base')), 'src/models/base should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src/views')), 'src/views should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'tests')), 'tests should exist');

  // Verify .info.md files were created for folders with info
  const srcInfo = fs.readFileSync(path.join(projectDest, 'src/.info.md'), 'utf-8');
  assert.ok(srcInfo.includes('Source code directory'), 'src .info.md should have correct content');

  const modelsInfo = fs.readFileSync(path.join(projectDest, 'src/models/.info.md'), 'utf-8');
  assert.ok(modelsInfo.includes('Data models'), 'models .info.md should have correct content');

  const baseInfo = fs.readFileSync(path.join(projectDest, 'src/models/base/.info.md'), 'utf-8');
  assert.ok(baseInfo.includes('Base model classes'), 'base .info.md should have correct content');

  // Clean up
  fs.unlinkSync(jsonFilePath);
  cleanup(projectDest, testHome);
});

test('init dry run does not create files', async () => {
  const projectDest = path.join(process.cwd(), 'test-dry-run-project');
  cleanup(projectDest);

  const jsonFilePath = path.join(process.cwd(), 'test-dryrun-template.json');
  const mockTemplate = {
    name: 'dryrun-test',
    description: 'Testing dry run mode',
    folders: [
      { name: 'src', info: 'source' },
      { name: 'docs', info: 'documentation' }
    ]
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(mockTemplate, null, 2));

  await init(undefined, projectDest, {
    file: jsonFilePath,
    yes: true,
    skipPostConfig: true,
    dryRun: true
  });

  // Dry run should NOT create the project directory
  assert.ok(!fs.existsSync(projectDest), 'Project directory should NOT exist in dry run');

  // Clean up
  fs.unlinkSync(jsonFilePath);
  cleanup(testHome);
});

test('init with saved template from config', async () => {
  const projectDest = path.join(process.cwd(), 'test-saved-template-project');
  cleanup(projectDest);

  // Set up a config with a template
  setupTestConfig('test-saved-tpl', {
    description: 'A saved template for testing',
    folders: [
      { name: 'app', info: 'application code' },
      { name: 'config', info: 'configuration files' }
    ]
  });

  await init('test-saved-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  assert.ok(fs.existsSync(projectDest), 'Project should be created');
  assert.ok(fs.existsSync(path.join(projectDest, 'app')), 'app directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'config')), 'config directory should exist');

  // Verify .info.md at project root
  const infoContent = fs.readFileSync(path.join(projectDest, '.info.md'), 'utf-8');
  assert.ok(infoContent.includes('test-saved-tpl'), 'Root .info.md should have template name');
  assert.ok(infoContent.includes('A saved template for testing'), 'Root .info.md should have description');

  // Clean up
  cleanup(projectDest, testHome);
});

test('init with variables via --vars option', async () => {
  const projectDest = path.join(process.cwd(), 'test-vars-project');
  const templateRoot = path.join(process.cwd(), 'test-vars-template-root');
  cleanup(projectDest, templateRoot);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ project_name }}\n\nBy {{ author }}\n'
  );

  // Set up config with template that has variables and copy_files
  setupTestConfig('vars-tpl', {
    description: 'Template with variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'project_name', prompt: 'Project name:', required: true },
      { name: 'author', prompt: 'Author:', default: 'Unknown' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  await init('vars-tpl', projectDest, {
    yes: true,
    skipPostConfig: true,
    vars: 'project_name=MyProject,author=TestAuthor'
  });

  assert.ok(fs.existsSync(projectDest), 'Project should be created');

  // Verify variable substitution in copied file
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  assert.ok(readme.includes('MyProject'), 'README should contain substituted project_name');
  assert.ok(readme.includes('TestAuthor'), 'README should contain substituted author');
  assert.ok(!readme.includes('{{ project_name }}'), 'README should NOT contain variable placeholder');

  // Clean up
  cleanup(projectDest, templateRoot, testHome);
});

test('init with variables uses defaults in --yes mode', async () => {
  const projectDest = path.join(process.cwd(), 'test-vars-default-project');
  const templateRoot = path.join(process.cwd(), 'test-vars-default-tpl-root');
  cleanup(projectDest, templateRoot);

  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'config.txt'),
    'env={{ environment }}\n'
  );

  setupTestConfig('vars-default-tpl', {
    description: 'Template with default variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'environment', prompt: 'Environment:', default: 'development', required: false }
    ],
    copy_files: [
      { src: 'config.txt', dest: 'config.txt', substitute_variables: true }
    ]
  });

  // Run without providing --vars; in --yes mode, defaults should be used
  await init('vars-default-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  const configContent = fs.readFileSync(path.join(projectDest, 'config.txt'), 'utf-8');
  assert.ok(configContent.includes('env=development'), 'Should use default variable value');

  cleanup(projectDest, templateRoot, testHome);
});

test('init with post_copy handles executables', async () => {
  const projectDest = path.join(process.cwd(), 'test-postcopy-project');
  const templateRoot = path.join(process.cwd(), 'test-postcopy-tpl-root');
  cleanup(projectDest, templateRoot);

  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'setup.sh'), '#!/bin/bash\necho "setup"\n');

  setupTestConfig('postcopy-tpl', {
    description: 'Template with post_copy',
    templateRoot: templateRoot,
    folders: [
      { name: 'bin', info: 'executables' }
    ],
    post_copy: [
      { src: 'setup.sh', dest: 'setup.sh' }
    ]
  });

  await init('postcopy-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  assert.ok(fs.existsSync(projectDest), 'Project should be created');
  assert.ok(fs.existsSync(path.join(projectDest, 'setup.sh')), 'setup.sh should be copied');

  // Verify content was copied
  const content = fs.readFileSync(path.join(projectDest, 'setup.sh'), 'utf-8');
  assert.ok(content.includes('echo "setup"'), 'setup.sh should have correct content');

  // Verify it was made executable (on Linux/macOS)
  if (process.platform !== 'win32') {
    const stat = fs.statSync(path.join(projectDest, 'setup.sh'));
    assert.ok(stat.mode & 0o111, 'setup.sh should be executable');
  }

  cleanup(projectDest, templateRoot, testHome);
});

test('init with missing templateRoot warns but creates structure', async () => {
  const projectDest = path.join(process.cwd(), 'test-missing-root-project');
  cleanup(projectDest);

  setupTestConfig('missing-root-tpl', {
    description: 'Template with missing root',
    templateRoot: '/tmp/nonexistent-pt-test-dir-' + Date.now(),
    folders: [
      { name: 'src', info: 'source code' },
      { name: 'lib', info: 'library code' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md' }
    ]
  });

  // Should still create the folder structure even though templateRoot is missing
  await init('missing-root-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  assert.ok(fs.existsSync(projectDest), 'Project should still be created');
  assert.ok(fs.existsSync(path.join(projectDest, 'src')), 'src directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'lib')), 'lib directory should exist');
  // But README.md should NOT exist since templateRoot doesn't exist
  assert.ok(!fs.existsSync(path.join(projectDest, 'README.md')), 'README.md should NOT exist');

  cleanup(projectDest, testHome);
});

test('init fails for non-existent template name', async () => {
  const projectDest = path.join(process.cwd(), 'test-nonexistent-tpl');
  cleanup(projectDest);

  // Set up empty config
  setupTestConfig('existing-tpl', {
    description: 'Some template',
    folders: []
  });

  // Mock process.exit so the test doesn't die
  let exitCalled = false;
  let exitCode: number | undefined;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCalled = true;
    exitCode = code;
    throw new Error('process.exit called');
  }) as any;

  try {
    await init('nonexistent-template', projectDest, {
      yes: true,
      skipPostConfig: true
    });
    assert.fail('Should have called process.exit');
  } catch (e) {
    assert.ok(exitCalled, 'process.exit should have been called');
    assert.strictEqual(exitCode, 1, 'Should exit with code 1');
  } finally {
    process.exit = originalExit;
  }

  cleanup(projectDest, testHome);
});

test('init fails when destination already exists', async () => {
  const projectDest = path.join(process.cwd(), 'test-existing-dest');
  
  // Create the destination first
  fs.mkdirSync(projectDest, { recursive: true });

  setupTestConfig('exists-tpl', {
    description: 'A template',
    folders: [{ name: 'src', info: '' }]
  });

  let exitCalled = false;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCalled = true;
    throw new Error('process.exit called');
  }) as any;

  try {
    await init('exists-tpl', projectDest, {
      yes: true,
      skipPostConfig: true
    });
    assert.fail('Should have called process.exit');
  } catch (e) {
    assert.ok(exitCalled, 'process.exit should have been called for existing destination');
  } finally {
    process.exit = originalExit;
  }

  cleanup(projectDest, testHome);
});

test('init with copy_files copies directory recursively', async () => {
  const projectDest = path.join(process.cwd(), 'test-recursive-copy-project');
  const templateRoot = path.join(process.cwd(), 'test-recursive-copy-tpl-root');
  cleanup(projectDest, templateRoot);

  // Create template root with a nested directory structure
  fs.mkdirSync(path.join(templateRoot, 'scripts', 'helpers'), { recursive: true });
  fs.writeFileSync(path.join(templateRoot, 'scripts', 'build.sh'), '#!/bin/bash\necho "building"');
  fs.writeFileSync(path.join(templateRoot, 'scripts', 'helpers', 'utils.sh'), '#!/bin/bash\necho "utils"');

  setupTestConfig('recursive-tpl', {
    description: 'Template with recursive copy',
    templateRoot: templateRoot,
    folders: [],
    copy_files: [
      { src: 'scripts', dest: 'scripts', substitute_variables: false }
    ]
  });

  await init('recursive-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  assert.ok(fs.existsSync(path.join(projectDest, 'scripts')), 'scripts dir should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'scripts', 'build.sh')), 'build.sh should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'scripts', 'helpers', 'utils.sh')), 'nested utils.sh should exist');

  const content = fs.readFileSync(path.join(projectDest, 'scripts', 'build.sh'), 'utf-8');
  assert.ok(content.includes('echo "building"'), 'build.sh should have correct content');

  cleanup(projectDest, templateRoot, testHome);
});
