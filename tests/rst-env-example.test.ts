import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-rst-example');
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

test('RST example: prefix variable with nested {{ project }} reference', async () => {
  // Simulate the exact scenario from /mnt/production/CLIENT/RST/.env
  const parentEnvDir = path.join(process.cwd(), 'test-rst-parent');
  const projectDest = path.join(parentEnvDir, 'test-rst-project');
  const templateRoot = path.join(process.cwd(), 'test-rst-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing the exact example from the user's request
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ prefix }}\n\nThis is a test project.\n'
  );

  // Set up config with template that has the nested variable example
  setupTestConfig('rst-tpl', {
    description: 'RST Template with nested variable expansion',
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
  // This simulates /mnt/production/CLIENT/RST/.env
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='rst_{{ project }}'\nproject=MyRSTProject\n`
  );

  // Run init from within the parent directory
  await init('rst-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify nested variable expansion worked correctly
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  
  // The prefix variable should be 'rst_MyRSTProject' (after expanding {{ project }})
  assert.ok(readme.includes('rst_MyRSTProject'), 'README should contain expanded prefix value');
  assert.ok(!readme.includes('{{ prefix }}'), 'README should NOT contain variable placeholder');
  assert.ok(!readme.includes('{{ project }}'), 'README should NOT contain nested variable placeholder');
  assert.ok(!readme.includes('rst_{{ project }}'), 'README should NOT contain unexpanded nested variable');
  
  console.log('✓ RST example test passed: nested variable expansion works correctly');
  console.log(`  Input: prefix='rst_{{ project }}', project=MyRSTProject`);
  console.log(`  Output: prefix resolved to 'rst_MyRSTProject'`);

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('RST example: multiple nested variables in .env', async () => {
  // Test multiple nested variables in a single .env file
  const parentEnvDir = path.join(process.cwd(), 'test-rst-multi-parent');
  const projectDest = path.join(parentEnvDir, 'test-rst-multi-project');
  const templateRoot = path.join(process.cwd(), 'test-rst-multi-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing multiple nested variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'config.txt'),
    'name={{ prefix }}_{{ project }}_{{ version }}\n'
  );

  // Set up config with template that has multiple nested variables
  setupTestConfig('rst-multi-tpl', {
    description: 'RST Template with multiple nested variables',
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

  // Create parent directory with .env file containing multiple nested variables
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='app_{{ env }}'\nenv=prod\nproject=MyApp\nversion=2.0\n`
  );

  // Run init from within the parent directory
  await init('rst-multi-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify multiple nested variables were expanded correctly
  const configContent = fs.readFileSync(path.join(projectDest, 'config.txt'), 'utf-8');
  
  // The prefix variable should be 'app_prod' (after expanding {{ env }})
  // The final result should be 'app_prod_MyApp_2.0'
  assert.ok(configContent.includes('app_prod_MyApp_2.0'), 'config.txt should contain fully expanded variables');
  assert.ok(!configContent.includes('{{ prefix }}'), 'config.txt should NOT contain variable placeholders');
  assert.ok(!configContent.includes('{{ project }}'), 'config.txt should NOT contain variable placeholders');
  assert.ok(!configContent.includes('{{ version }}'), 'config.txt should NOT contain variable placeholders');
  assert.ok(!configContent.includes('{{ env }}'), 'config.txt should NOT contain nested variable placeholders');
  assert.ok(!configContent.includes('app_{{ env }}'), 'config.txt should NOT contain unexpanded nested variable');
  
  console.log('✓ RST multi-variable test passed: all nested variables expanded correctly');
  console.log(`  Input: prefix='app_{{ env }}', env=prod, project=MyApp, version=2.0`);
  console.log(`  Output: name resolved to 'app_prod_MyApp_2.0'`);

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('RST example: .env values are used as defaults in interactive mode', async () => {
  // Test that .env values are used as defaults when user doesn't override
  const parentEnvDir = path.join(process.cwd(), 'test-rst-defaults-parent');
  const projectDest = path.join(parentEnvDir, 'test-rst-defaults-project');
  const templateRoot = path.join(process.cwd(), 'test-rst-defaults-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ prefix }}\n\nThis is a test project.\n'
  );

  // Set up config with template that has variables with defaults
  setupTestConfig('rst-defaults-tpl', {
    description: 'RST Template with defaults',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'prefix', prompt: 'Project prefix:', required: true, default: 'default_prefix' },
      { name: 'project', prompt: 'Project name:', default: 'default_project' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file containing values that should be used as defaults
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='rst_{{ project }}'\nproject=EnvProject\n`
  );

  // Run init from within the parent directory
  await init('rst-defaults-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify .env values were used as defaults
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  
  // The prefix variable should be 'rst_EnvProject' (after expanding {{ project }})
  assert.ok(readme.includes('rst_EnvProject'), 'README should contain expanded prefix value from .env');
  assert.ok(!readme.includes('{{ prefix }}'), 'README should NOT contain variable placeholder');
  assert.ok(!readme.includes('default_prefix'), 'README should NOT contain default value');
  
  console.log('✓ RST defaults test passed: .env values used as defaults');
  console.log(`  Input: prefix='rst_{{ project }}', project=EnvProject`);
  console.log(`  Output: prefix resolved to 'rst_EnvProject'`);

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});