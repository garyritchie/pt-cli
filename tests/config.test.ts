import { test, before, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-config');
process.env.HOME = testHome;

import { normalizeVariable, saveConfig, loadConfig, PtConfig, CONFIG_PATH } from '../src/config.js';

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
  if (fs.existsSync(testHome)) {
    fs.rmdirSync(testHome);
  }
});
