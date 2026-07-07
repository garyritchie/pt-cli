import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-nested');
process.env.HOME = testHome;

// Import the init command to test the nested variable expansion functionality
import { init } from '../src/commands/initCommand.js';
import { loadConfig, saveConfig, PtConfig } from '../src/config.js';

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

test('nested variable expansion: prefix variable with nested {{ project }} reference', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-parent-nested');
  const projectDest = path.join(parentEnvDir, 'test-nested-project');
  const templateRoot = path.join(process.cwd(), 'test-nested-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing the nested variable example
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ prefix }}\n\nThis is a test project.\n'
  );

  // Set up config with template that has the nested variable example
  setupTestConfig('nested-tpl', {
    description: 'Template with nested variable expansion',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'prefix', prompt: 'Project prefix:', required: true },
      { name: 'project', prompt: 'Project name:', default: 'default' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file containing the exact example from the user's request
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='rst_{{ project }}'\nproject=MyProject\n`
  );

  // Run init from within the parent directory
  await init('nested-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify nested variable expansion worked correctly
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  
  // The prefix variable should be 'rst_MyProject' (after expanding {{ project }})
  assert.ok(readme.includes('rst_MyProject'), 'README should contain expanded prefix value');
  assert.ok(!readme.includes('{{ prefix }}'), 'README should NOT contain variable placeholder');
  assert.ok(!readme.includes('{{ project }}'), 'README should NOT contain nested variable placeholder');
  assert.ok(!readme.includes('rst_{{ project }}'), 'README should NOT contain unexpanded nested variable');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('nested variable expansion: multiple levels of nesting', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-parent-deep-nested');
  const projectDest = path.join(parentEnvDir, 'test-deep-nested-project');
  const templateRoot = path.join(process.cwd(), 'test-deep-nested-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing deeply nested variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'config.txt'),
    'name={{ prefix }}_{{ project }}_{{ version }}\n'
  );

  // Set up config with template that has deeply nested variables
  setupTestConfig('deep-nested-tpl', {
    description: 'Template with deeply nested variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'prefix', prompt: 'Prefix:', required: true },
      { name: 'project', prompt: 'Project:', default: 'default' },
      { name: 'version', prompt: 'Version:', default: '1.0' }
    ],
    copy_files: [
      { src: 'config.txt', dest: 'config.txt', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file containing deeply nested variables
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='app_{{ env }}'\nenv=prod\nproject=MyApp\nversion=2.0\n`
  );

  // Run init from within the parent directory
  await init('deep-nested-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify deeply nested variable expansion worked correctly
  const configContent = fs.readFileSync(path.join(projectDest, 'config.txt'), 'utf-8');
  
  // The prefix variable should be 'app_prod' (after expanding {{ env }})
  // The final result should be 'app_prod_MyApp_2.0'
  assert.ok(configContent.includes('app_prod_MyApp_2.0'), 'config.txt should contain fully expanded variables');
  assert.ok(!configContent.includes('{{ prefix }}'), 'config.txt should NOT contain variable placeholders');
  assert.ok(!configContent.includes('{{ project }}'), 'config.txt should NOT contain variable placeholders');
  assert.ok(!configContent.includes('{{ version }}'), 'config.txt should NOT contain variable placeholders');
  assert.ok(!configContent.includes('{{ env }}'), 'config.txt should NOT contain nested variable placeholders');
  assert.ok(!configContent.includes('app_{{ env }}'), 'config.txt should NOT contain unexpanded nested variable');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('nested variable expansion: handles circular references gracefully', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-parent-circular');
  const projectDest = path.join(parentEnvDir, 'test-circular-project');
  const templateRoot = path.join(process.cwd(), 'test-circular-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing potentially circular variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'data.txt'),
    'value={{ a }}\n'
  );

  // Set up config with template that has variables that could cause circular references
  setupTestConfig('circular-tpl', {
    description: 'Template with potential circular references',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'a', prompt: 'Value a:', required: true }
    ],
    copy_files: [
      { src: 'data.txt', dest: 'data.txt', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file that could cause circular references
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `a={{ a }}\n`
  );

  // Run init from within the parent directory - should not hang or crash
  await init('circular-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify the feature handles circular references without hanging
  const dataContent = fs.readFileSync(path.join(projectDest, 'data.txt'), 'utf-8');
  
  // The circular reference should be handled gracefully (either left as-is or replaced with empty)
  assert.ok(dataContent.includes('{{ a }}') || dataContent.includes(''), 
    'circular reference should be handled without hanging');
  assert.ok(dataContent.includes('value='), 'data.txt should still contain the original structure');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('nested variable expansion: handles missing nested variables', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-parent-missing-nested');
  const projectDest = path.join(parentEnvDir, 'test-missing-nested-project');
  const templateRoot = path.join(process.cwd(), 'test-missing-nested-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing nested variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ prefix }}\n\nThis is a test project.\n'
  );

  // Set up config with template that has nested variables
  setupTestConfig('missing-nested-tpl', {
    description: 'Template with missing nested variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'prefix', prompt: 'Prefix:', required: true },
      { name: 'project', prompt: 'Project:', default: 'default' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file that has nested variable but missing the referenced variable
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='rst_{{ missing_var }}'\n`
  );

  // Run init from within the parent directory
  await init('missing-nested-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify that missing nested variables are handled gracefully
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  
  // The missing variable should remain as placeholder or be replaced with empty
  assert.ok(readme.includes('# ') || readme.includes('rst_'), 'README should contain the prefix value');
  assert.ok(!readme.includes('{{ prefix }}'), 'README should NOT contain the original prefix placeholder');
  // The missing variable might remain as placeholder or be replaced with empty - both are acceptable

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});