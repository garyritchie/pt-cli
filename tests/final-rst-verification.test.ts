import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing
const testHome = path.join(process.cwd(), '.test-home-final-verification');
process.env.HOME = testHome;

// Import the init command
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

test('FINAL VERIFICATION: Exact scenario from /mnt/production/CLIENT/RST/.env', async () => {
  console.log('\n🎯 FINAL VERIFICATION TEST - Exact scenario from user request');
  const prefixVar = 'rst_' + '{{ project }}';
  console.log('📁 Testing: prefix=' + prefixVar + ' with project value');
  
  // Set up the exact scenario from the user's request
  const parentEnvDir = path.join(process.cwd(), 'test-final-rst');
  const projectDest = path.join(parentEnvDir, 'final-rst-project');
  const templateRoot = path.join(process.cwd(), 'test-final-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template with the exact structure from the user's request
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ prefix }}\n\nThis is a test project.\n'
  );

  // Set up config with template that has the nested variable example
  setupTestConfig('final-rst-tpl', {
    description: 'Final RST Template with nested variable expansion',
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

  // Create parent directory with .env file containing the EXACT example from the user's request
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='rst_{{ project }}'\nproject=MyProject\n`
  );

  console.log('🔍 Running pt init with the exact scenario...');
  // Run init from within the parent directory
  await init('final-rst-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify the nested variable expansion worked correctly
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  
  console.log('📊 Test Results:');
  console.log('   Input: prefix=rst_{{ project }}, project=MyProject');
  console.log('   Expected: README should contain rst_MyProject');
  console.log('   Actual: README contains ' + readme.trim());
  
  // The prefix variable should be 'rst_MyProject' (after expanding {{ project }})
  assert.ok(readme.includes('rst_MyProject'), '✅ README should contain expanded prefix value');
  assert.ok(!readme.includes('{{ prefix }}'), '✅ README should NOT contain variable placeholder');
  assert.ok(!readme.includes('{{ project }}'), '✅ README should NOT contain nested variable placeholder');
  assert.ok(!readme.includes('rst_{{ project }}'), '✅ README should NOT contain unexpanded nested variable');
  
  console.log('\n🎉 SUCCESS: Nested variable expansion works exactly as requested!');
  console.log('   - .env file was scanned in parent directory');
  console.log('   - prefix variable was pre-filled from .env with value rst_{{ project }}');
  console.log('   - Nested {{ project }} placeholder was expanded to MyProject');
  console.log('   - Final result: prefix resolved to rst_MyProject');
  console.log('   - No manual input needed - fully automated!');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('FINAL VERIFICATION: Multiple nested variables with complex expansion', async () => {
  console.log('\n🧪 BONUS TEST: Complex nested variable expansion scenario');
  
  // Set up a more complex scenario with multiple levels of nesting
  const parentEnvDir = path.join(process.cwd(), 'test-final-complex');
  const projectDest = path.join(parentEnvDir, 'complex-project');
  const templateRoot = path.join(process.cwd(), 'test-final-complex-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template with complex nested variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'config.json'),
    '{\n  "name": "{{ prefix }}_{{ project }}",\n  "version": "{{ version }}"\n}\n'
  );

  // Set up config with template that has multiple nested variables
  setupTestConfig('complex-tpl', {
    description: 'Complex nested variable test',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'prefix', prompt: 'Prefix:', required: true },
      { name: 'project', prompt: 'Project:', default: 'default' },
      { name: 'version', prompt: 'Version:', default: '1.0' }
    ],
    copy_files: [
      { src: 'config.json', dest: 'config.json', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file containing complex nested variables
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `prefix='app_{{ env }}'\nenv=prod\nproject=MyApp\nversion=2.0\n`
  );

  console.log('🔍 Running complex nested variable scenario...');
  // Run init from within the parent directory
  await init('complex-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify complex nested variables were expanded correctly
  const configContent = fs.readFileSync(path.join(projectDest, 'config.json'), 'utf-8');
  
  console.log('📊 Complex Test Results:');
  console.log('   Input: prefix=app_{{ env }}, env=prod, project=MyApp, version=2.0');
  console.log('   Expected: name=app_prod_MyApp, version=2.0');
  console.log('   Actual: ' + configContent.trim());
  
  // The prefix variable should be 'app_prod' (after expanding {{ env }})
  // The final name should be 'app_prod_MyApp'
  assert.ok(configContent.includes('app_prod_MyApp'), '✅ config.json should contain fully expanded name');
  assert.ok(configContent.includes('"2.0"'), '✅ config.json should contain version');
  assert.ok(!configContent.includes('{{ prefix }}'), '✅ config.json should NOT contain variable placeholders');
  assert.ok(!configContent.includes('{{ env }}'), '✅ config.json should NOT contain nested variable placeholders');
  assert.ok(!configContent.includes('app_{{ env }}'), '✅ config.json should NOT contain unexpanded nested variable');
  
  console.log('\n🎉 SUCCESS: Complex nested variables work perfectly!');
  console.log('   - Multiple levels of nesting were resolved');
  console.log('   - prefix=app_{{ env }} expanded to app_prod');
  console.log('   - Final name resolved to app_prod_MyApp');
  console.log('   - All variables expanded correctly in one pass!');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});