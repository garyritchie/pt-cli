import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import YAML from 'yaml';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-completion');
process.env.HOME = testHome;

import {
  generateCompletion,
  generateBashCompletion,
  generateZshCompletion,
  generateFishCompletion,
  getTemplatesForCompletion,
  completionCommand,
} from '../src/commands/completionCommand.js';
import { getConfigPath, ensureConfigDir } from '../src/config.js';

describe('Shell Completion Generation', () => {
  beforeEach(() => {
    ensureConfigDir();
  });

  afterEach(() => {
    if (fs.existsSync(testHome)) {
      fs.rmSync(testHome, { recursive: true, force: true });
    }
  });

  test('generateCompletion throws on unsupported shell', () => {
    assert.throws(
      () => generateCompletion('powershell'),
      /Unsupported shell: powershell\. Supported: bash, zsh, fish/
    );
    assert.throws(
      () => generateCompletion('elvish'),
      /Unsupported shell: elvish\. Supported: bash, zsh, fish/
    );
  });

  test('generateBashCompletion generates valid bash script with commands and flags', () => {
    const script = generateBashCompletion();
    assert.ok(script.includes('_pt_completions()'), 'Must define _pt_completions');
    assert.ok(script.includes('complete -F _pt_completions pt'), 'Must register complete -F');
    assert.ok(script.includes('pt completion --templates'), 'Must include template completion call');

    const expectedCommands = [
      'learn',
      'update',
      'init',
      'config',
      'ignore',
      'variables',
      'default-post-config',
      'add',
      'remove',
      'rm',
      'security-response',
      'completion',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(script.includes(cmd), `Bash completion must include command ${cmd}`);
    }

    // Verify bash script parses cleanly and registers completion
    try {
      const tempScriptPath = path.join(testHome, 'pt-completion.bash');
      fs.writeFileSync(tempScriptPath, script, 'utf-8');
      const verifyOutput = execSync(`bash -c "source '${tempScriptPath}' && complete -p pt"`, { encoding: 'utf-8' });
      assert.ok(verifyOutput.includes('_pt_completions pt'), 'complete -p pt should return registered function');
    } catch (e: any) {
      if (e.status !== undefined) throw e;
    }
  });

  test('generateZshCompletion generates valid zsh script with commands and flags', () => {
    const script = generateZshCompletion();
    assert.ok(script.includes('#compdef pt'), 'Must include #compdef pt header');
    assert.ok(script.includes('_pt()'), 'Must define _pt function');
    assert.ok(script.includes('_pt_templates()'), 'Must define _pt_templates function');
    assert.ok(script.includes('pt completion --templates'), 'Must call pt completion --templates');

    const expectedCommands = [
      'learn',
      'update',
      'init',
      'config',
      'ignore',
      'variables',
      'default-post-config',
      'add',
      'remove',
      'rm',
      'security-response',
      'completion',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(script.includes(cmd), `Zsh completion must include command ${cmd}`);
    }
  });

  test('generateFishCompletion generates valid fish script with commands and flags', () => {
    const script = generateFishCompletion();
    assert.ok(script.includes('complete -c pt'), 'Must include complete -c pt');
    assert.ok(script.includes('__fish_pt_templates'), 'Must define __fish_pt_templates function');
    assert.ok(script.includes('pt completion --templates'), 'Must call pt completion --templates');

    const expectedCommands = [
      'learn',
      'update',
      'init',
      'config',
      'ignore',
      'variables',
      'default-post-config',
      'add',
      'remove',
      'rm',
      'security-response',
      'completion',
    ];

    for (const cmd of expectedCommands) {
      assert.ok(script.includes(cmd), `Fish completion must include command ${cmd}`);
    }
  });

  test('getTemplatesForCompletion returns template names when config exists', () => {
    ensureConfigDir();
    const configPath = getConfigPath();
    const testConfig = {
      version: '3.0',
      templates: {
        'web-app': { description: 'Web Application', folders: [] },
        'python-cli': { description: 'Python CLI', folders: [] },
        'godot-game': { description: 'Godot Game', folders: [] },
      },
    };
    fs.writeFileSync(configPath, YAML.stringify(testConfig), 'utf-8');

    const templates = getTemplatesForCompletion();
    assert.deepStrictEqual(templates, ['web-app', 'python-cli', 'godot-game']);
  });

  test('getTemplatesForCompletion returns empty array when config does not exist', () => {
    const configPath = getConfigPath();
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    const templates = getTemplatesForCompletion();
    assert.deepStrictEqual(templates, []);
  });

  test('getTemplatesForCompletion returns empty array when config is empty or invalid', () => {
    ensureConfigDir();
    const configPath = getConfigPath();
    fs.writeFileSync(configPath, '', 'utf-8');
    assert.deepStrictEqual(getTemplatesForCompletion(), []);

    fs.writeFileSync(configPath, ':::invalid yaml:::', 'utf-8');
    assert.deepStrictEqual(getTemplatesForCompletion(), []);

    fs.writeFileSync(configPath, YAML.stringify({ version: '3.0' }), 'utf-8');
    assert.deepStrictEqual(getTemplatesForCompletion(), []);
  });

  test('completionCommand with --templates option outputs newline-separated template names', async () => {
    ensureConfigDir();
    const configPath = getConfigPath();
    const testConfig = {
      version: '3.0',
      templates: {
        'alpha-template': { description: 'Alpha', folders: [] },
        'beta-template': { description: 'Beta', folders: [] },
      },
    };
    fs.writeFileSync(configPath, YAML.stringify(testConfig), 'utf-8');

    const logged: string[] = [];
    const origLog = console.log;
    console.log = (msg: any) => logged.push(String(msg));

    try {
      await completionCommand(undefined, { templates: true });
      assert.strictEqual(logged.length, 1);
      assert.strictEqual(logged[0], 'alpha-template\nbeta-template');
    } finally {
      console.log = origLog;
    }
  });

  test('completionCommand with valid shell outputs script', async () => {
    const logged: string[] = [];
    const origLog = console.log;
    console.log = (msg: any) => logged.push(String(msg));

    try {
      await completionCommand('bash');
      assert.strictEqual(logged.length, 1);
      assert.ok(logged[0].includes('_pt_completions()'));
    } finally {
      console.log = origLog;
    }
  });
});
