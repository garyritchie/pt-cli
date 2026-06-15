import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-config');

// Mock os.homedir() to return the test directory (Node.js doesn't use HOME env var on Linux)
const originalHomedir = os.homedir;
os.homedir = () => testHome;

import { normalizeVariable, saveConfig, loadConfig, PtConfig, CONFIG_PATH, HOME_DIR } from '../src/config.js';

test('normalizeVariable key ordering', () => {
  const variableInput = {
    required: true,
    default: 'my-default',
    prompt: 'Enter variable:',
    name: 'varName'
  };

  const normalized = normalizeVariable(variableInput);
  
  // Verify that name is the first key in the returned object
  const keys = Object.keys(normalized);
  assert.strictEqual(keys[0], 'name', 'The "name" key must be first');
  assert.deepStrictEqual(keys, ['name', 'prompt', 'default', 'required']);
});

test('saveConfig and loadConfig roundtrip', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const testConfig: PtConfig = {
    version: '1.0.0',
    templates: {
      'test-tpl': {
        description: 'Test Template Description',
        folders: [
          { name: 'src', info: 'source folder' }
        ],
        variables: [
          {
            required: true,
            default: 'hello',
            prompt: 'Prompt:',
            name: 'myVar'
          }
        ]
      }
    }
  };

  // Save the config
  saveConfig(testConfig);

  // Assert CONFIG_PATH exists and has been created
  assert.ok(fs.existsSync(CONFIG_PATH), 'Config file should be created');

  // Verify key order in YAML string
  const yamlContent = fs.readFileSync(CONFIG_PATH, 'utf-8');
  assert.ok(yamlContent.includes('name: myVar'), 'Should contain myVar variable');
  
  // Load the config back
  const loaded = loadConfig();
  assert.strictEqual(loaded.version, '1.0.0');
  assert.ok(loaded.templates['test-tpl']);
  assert.strictEqual(loaded.templates['test-tpl'].description, 'Test Template Description');
  
  const loadedVar = loaded.templates['test-tpl'].variables?.[0];
  assert.ok(loadedVar);
  assert.strictEqual(loadedVar.name, 'myVar');

  // Test atomic backup behavior: saving again should create a backup
  saveConfig({
    ...testConfig,
    version: '1.0.1'
  });
  
  assert.ok(fs.existsSync(backupPath), 'Backup file .bak should exist after a second save');
  const backupContent = fs.readFileSync(backupPath, 'utf-8');
  assert.ok(backupContent.includes("version: 1.0.0") || backupContent.includes("version: '1.0.0'"), 'Backup should contain previous version');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('normalizeVariable with minimal input', () => {
  const variableInput = {
    name: 'minimalVar'
  };

  const normalized = normalizeVariable(variableInput);
  
  // Verify that only name is present
  const keys = Object.keys(normalized);
  assert.deepStrictEqual(keys, ['name']);
  assert.strictEqual(normalized.name, 'minimalVar');
});

test('normalizeVariable with all fields', () => {
  const variableInput = {
    required: false,
    default: 'default-value',
    prompt: 'Custom prompt:',
    name: 'allFields'
  };

  const normalized = normalizeVariable(variableInput);
  
  // Verify all fields are present and in correct order
  const keys = Object.keys(normalized);
  assert.deepStrictEqual(keys, ['name', 'prompt', 'default', 'required']);
  assert.strictEqual(normalized.name, 'allFields');
  assert.strictEqual(normalized.prompt, 'Custom prompt:');
  assert.strictEqual(normalized.default, 'default-value');
  assert.strictEqual(normalized.required, false);
});

test('saveConfig creates backup on overwrite', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const config1: PtConfig = {
    version: '1.0.0',
    templates: {}
  };
  const config2: PtConfig = {
    version: '2.0.0',
    templates: {}
  };

  // Save first config
  saveConfig(config1);
  assert.ok(fs.existsSync(CONFIG_PATH), 'Config file should be created');

  // Save second config (should create backup)
  saveConfig(config2);
  assert.ok(fs.existsSync(backupPath), 'Backup file should exist');
  
  // Verify backup contains first config
  const backupContent = fs.readFileSync(backupPath, 'utf-8');
  assert.ok(backupContent.includes("version: 1.0.0") || backupContent.includes("version: '1.0.0'"), 'Backup should contain previous version');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('saveConfig atomic write behavior', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const config: PtConfig = {
    version: '1.0.0',
    templates: {}
  };

  // Save config - should use atomic write
  saveConfig(config);
  
  // Verify config exists
  assert.ok(fs.existsSync(CONFIG_PATH), 'Config file should be created');
  
  // Verify no temp file remains
  const tempPath = CONFIG_PATH + '.tmp';
  assert.ok(!fs.existsSync(tempPath), 'Temp file should not remain');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('loadConfig returns default config when file missing', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const config = loadConfig();
  
  // Verify default config structure
  assert.strictEqual(config.version, '3.0');
  assert.deepStrictEqual(config.templates, {});
  assert.deepStrictEqual(config.default_post_config, []);
  assert.deepStrictEqual(config.variables, []);

  // Clean up
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
});

test('saveConfig with variables normalizes key order', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const config: PtConfig = {
    version: '1.0.0',
    templates: {
      'test-template': {
        description: 'Test',
        folders: [],
        variables: [
          {
            required: true,
            default: 'value1',
            prompt: 'Prompt1:',
            name: 'var1'
          },
          {
            required: false,
            default: 'value2',
            prompt: 'Prompt2:',
            name: 'var2'
          }
        ]
      }
    }
  };

  // Save config
  saveConfig(config);
  
  // Load and verify
  const loaded = loadConfig();
  const vars = loaded.templates['test-template'].variables;
  
  assert.strictEqual(vars.length, 2, 'Should have 2 variables');
  assert.strictEqual(vars[0].name, 'var1', 'First variable name should be var1');
  assert.strictEqual(vars[1].name, 'var2', 'Second variable name should be var2');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('saveConfig with empty config file', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  // Create empty config file
  fs.writeFileSync(CONFIG_PATH, '');
  
  // loadConfig calls process.exit(1) on error, so we need to mock it
  // to prevent the test runner from dying
  let exitCalled = false;
  let exitCode: number | undefined;
  const originalExit = process.exit;
  process.exit = ((code?: number) => {
    exitCalled = true;
    exitCode = code;
    throw new Error('process.exit called');
  }) as any;

  try {
    loadConfig();
    assert.fail('loadConfig should have called process.exit');
  } catch (e) {
    assert.ok(exitCalled, 'process.exit should have been called');
    assert.strictEqual(exitCode, 1, 'Should exit with code 1');
  } finally {
    process.exit = originalExit;
  }

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('normalizeVariable preserves field order', () => {
  const variableInput = {
    required: true,
    default: 'my-default',
    prompt: 'Enter variable:',
    name: 'varName'
  };

  const normalized = normalizeVariable(variableInput);
  
  // Verify field order is preserved
  const keys = Object.keys(normalized);
  assert.deepStrictEqual(keys, ['name', 'prompt', 'default', 'required']);
});

test('saveConfig handles multiple templates', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const config: PtConfig = {
    version: '1.0.0',
    templates: {
      'template1': {
        description: 'Template 1',
        folders: []
      },
      'template2': {
        description: 'Template 2',
        folders: []
      }
    }
  };

  // Save config
  saveConfig(config);
  
  // Load and verify
  const loaded = loadConfig();
  assert.strictEqual(Object.keys(loaded.templates).length, 2, 'Should have 2 templates');
  assert.strictEqual(loaded.templates['template1'].description, 'Template 1');
  assert.strictEqual(loaded.templates['template2'].description, 'Template 2');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('saveConfig handles templates with variables', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  const config: PtConfig = {
    version: '1.0.0',
    templates: {
      'template-with-vars': {
        description: 'Template with variables',
        folders: [],
        variables: [
          {
            required: true,
            default: 'default-value',
            prompt: 'Enter value:',
            name: 'myVar'
          }
        ]
      }
    }
  };

  // Save config
  saveConfig(config);
  
  // Load and verify
  const loaded = loadConfig();
  const template = loaded.templates['template-with-vars'];
  
  assert.ok(template, 'Template should exist');
  assert.strictEqual(template.variables?.length, 1, 'Should have 1 variable');
  assert.strictEqual(template.variables?.[0].name, 'myVar', 'Variable name should be myVar');
  assert.strictEqual(template.variables?.[0].prompt, 'Enter value:', 'Variable prompt should match');
  assert.strictEqual(template.variables?.[0].default, 'default-value', 'Variable default should match');
  assert.strictEqual(template.variables?.[0].required, true, 'Variable should be required');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('loadConfig handles migration from v2.0', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  // Create a v2.0 config
  const v2Config = {
    version: '2.0',
    templates: {
      'test-template': {
        name: 'Test Template',
        type: 'web',
        folders: []
      }
    }
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(v2Config));
  
  // Load config - should migrate to v3.0
  const config = loadConfig();
  
  // Verify migration happened
  assert.strictEqual(config.version, '3.0', 'Should be migrated to v3.0');
  assert.strictEqual(config.templates['test-template'].description, 'Test Template', 'Name should be migrated to description');
  assert.ok(!config.templates['test-template'].type, 'Type should be removed');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('loadConfig handles migration from v2.0 with global_post_config', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  // Create a v2.0 config with global_post_config
  const v2Config = {
    version: '2.0',
    templates: {},
    global_post_config: [
      {
        command: 'npm install',
        description: 'Install dependencies'
      }
    ]
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(v2Config));
  
  // Load config - should migrate to v3.0
  const config = loadConfig();
  
  // Verify migration happened
  assert.strictEqual(config.version, '3.0', 'Should be migrated to v3.0');
  assert.deepStrictEqual(config.default_post_config, [
    {
      command: 'npm install',
      description: 'Install dependencies'
    }
  ], 'global_post_config should be migrated to default_post_config');
  assert.ok(!config.global_post_config, 'global_post_config should be removed');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('loadConfig handles migration from v2.0 with variables', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Clean up any existing test files
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  const backupPath = CONFIG_PATH + '.bak';
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }

  // Create a v2.0 config with variables as Record<string, string>
  const v2Config = {
    version: '2.0',
    templates: {},
    variables: {
      'client_name': 'My Client',
      'project_type': 'web'
    }
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(v2Config));
  
  // Load config - should migrate to v3.0
  const config = loadConfig();
  
  // Verify migration happened
  assert.strictEqual(config.version, '3.0', 'Should be migrated to v3.0');
  assert.strictEqual(config.variables.length, 2, 'Should have 2 variables');
  assert.strictEqual(config.variables[0].name, 'client_name', 'First variable name should be client_name');
  assert.strictEqual(config.variables[0].default, 'My Client', 'First variable default should be My Client');
  assert.strictEqual(config.variables[1].name, 'project_type', 'Second variable name should be project_type');
  assert.strictEqual(config.variables[1].default, 'web', 'Second variable default should be web');

  // Clean up
  if (fs.existsSync(CONFIG_PATH)) {
    fs.unlinkSync(CONFIG_PATH);
  }
  if (fs.existsSync(backupPath)) {
    fs.unlinkSync(backupPath);
  }
  
  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
  
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});

test('loadConfig handles existing config file', () => {
  // Don't delete the existing config file - let it be restored by the user
  // This test verifies that loadConfig works with an existing config
  const config = loadConfig();
  
  // Verify config is loaded correctly
  assert.ok(config, 'Config should be loaded');
  assert.ok(config.templates, 'Templates should exist');
  assert.ok(config.version, 'Version should exist');
});

test('saveConfig preserves existing config when not deleting', () => {
  // Save the current config to restore later
  let savedConfig: PtConfig | null = null;
  if (fs.existsSync(CONFIG_PATH)) {
    savedConfig = loadConfig();
  }

  // Don't delete the config file - test saving without deletion
  const config: PtConfig = {
    version: '1.0.0',
    templates: {
      'test-template': {
        description: 'Test',
        folders: []
      }
    }
  };

  // Save config
  saveConfig(config);
  
  // Load and verify
  const loaded = loadConfig();
  assert.strictEqual(loaded.version, '1.0.0');
  assert.ok(loaded.templates['test-template']);

  // Restore the original config if it existed
  if (savedConfig) {
    saveConfig(savedConfig);
  }
});

// Cleanup: restore original os.homedir function and clean up test directory
after(() => {
  // Restore original os.homedir function
  os.homedir = originalHomedir;
  
  // Clean up test home directory if it exists
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome, { recursive: true });
  }
});