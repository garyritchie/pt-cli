import { test, after } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Isolated HOME so the default location never touches the real ~/.pt
const testHome = path.join(process.cwd(), '.test-home-config-path');
process.env.HOME = testHome;

import { saveConfig, loadConfig, PtConfig, getConfigPath, getHomeDir, setConfigPathOverride } from '../src/config.js';

const customFile = path.join(process.cwd(), '.test-custom-config.yaml');

after(() => {
  setConfigPathOverride(null);
  for (const p of [customFile, customFile + '.bak', path.join(process.cwd(), 'rel-custom.yaml')]) {
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
});

test('omission falls back to the default user config location', () => {
  setConfigPathOverride(null);
  assert.strictEqual(getConfigPath(), path.join(getHomeDir(), 'config.yaml'));
});

test('override is stored as an absolute path', () => {
  setConfigPathOverride('rel-custom.yaml');
  assert.strictEqual(getConfigPath(), path.join(process.cwd(), 'rel-custom.yaml'));
  setConfigPathOverride(null);
});

test('save/load round-trip in a custom location', () => {
  if (fs.existsSync(customFile)) fs.unlinkSync(customFile);
  setConfigPathOverride(customFile);
  try {
    const cfg: PtConfig = {
      version: '3.0',
      templates: {
        'custom-tpl': { description: 'lives in the custom file', folders: [{ name: 'SRC', info: '' }] }
      }
    };
    saveConfig(cfg);
    assert.ok(fs.existsSync(customFile), 'custom config file should be created');
    const loaded = loadConfig();
    assert.ok(loaded.templates['custom-tpl'], 'template should load from the custom file');
    assert.strictEqual(loaded.templates['custom-tpl'].description, 'lives in the custom file');
  } finally {
    setConfigPathOverride(null);
  }
});

test('a blank file is treated like a missing one', () => {
  const blankFile = path.join(process.cwd(), '.test-blank-config.yaml');
  fs.writeFileSync(blankFile, '\n  \n');
  setConfigPathOverride(blankFile);
  try {
    const loaded = loadConfig();
    assert.deepStrictEqual(Object.keys(loaded.templates), [], 'blank file starts with no templates');
    assert.strictEqual(loaded.version, '3.0');
  } finally {
    setConfigPathOverride(null);
    if (fs.existsSync(blankFile)) fs.unlinkSync(blankFile);
  }
});

test('custom location never writes to the default file', () => {
  const defaultPath = path.join(getHomeDir(), 'config.yaml');
  if (fs.existsSync(defaultPath)) fs.unlinkSync(defaultPath);
  setConfigPathOverride(customFile);
  try {
    saveConfig({ version: '3.0', templates: {} });
    assert.ok(!fs.existsSync(defaultPath), 'default config file must not be created');
  } finally {
    setConfigPathOverride(null);
    if (fs.existsSync(testHome)) fs.rmSync(testHome, { recursive: true, force: true });
  }
});
