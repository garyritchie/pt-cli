import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing
const testHome = path.join(process.cwd(), '.test-home-update');
process.env.HOME = testHome;

import { update } from '../src/commands/updateCommand.js';
import { loadConfig, saveConfig, PtConfig, getConfigPath } from '../src/config.js';

// Helper to clean up test directories
function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

// Helper to create a test source directory with a given structure
function createSourceDir(name: string): string {
  const dir = path.join(process.cwd(), name);
  cleanup(dir);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

test('update: basic additive update adds new folders', async () => {
  const srcDir = createSourceDir('.test-update-folders');
  cleanup(testHome);
  
  try {
    // Seed initial config with existing template
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test': {
          description: 'Original template',
          templateRoot: '/old/path',
          folders: [{ name: 'old-folder', info: 'old info', children: [] }],
          copy_files: [],
          variables: [{ name: 'old_var', prompt: 'Old:', required: true }]
        }
      }
    };
    saveConfig(initialConfig);

    // Create new source structure with new folder
    fs.mkdirSync(path.join(srcDir, 'old-folder'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'new-folder'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Test');

    await update(srcDir, 'update-test', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['update-test'];
    
    assert.ok(tpl, 'Template should exist');
    const folderNames = tpl.folders.map(f => f.name);
    assert.ok(folderNames.includes('old-folder'), 'Should preserve old folder');
    assert.ok(folderNames.includes('new-folder'), 'Should add new folder');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: basic additive update adds new files', async () => {
  const srcDir = createSourceDir('.test-update-files');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-files': {
          description: 'Original template',
          templateRoot: '/old/path',
          folders: [],
          copy_files: [{ src: 'existing.txt', dest: 'existing.txt', substitute_variables: true }],
          variables: []
        }
      }
    };
    saveConfig(initialConfig);

    fs.writeFileSync(path.join(srcDir, 'existing.txt'), 'old content');
    fs.writeFileSync(path.join(srcDir, 'new-file.txt'), 'new content');
    fs.writeFileSync(path.join(srcDir, 'another-new.md'), '# new');

    await update(srcDir, 'update-test-files', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['update-test-files'];
    
    const copySrcs = tpl.copy_files!.map(cf => cf.src);
    assert.ok(copySrcs.includes('existing.txt'), 'Should preserve existing file');
    assert.ok(copySrcs.includes('new-file.txt'), 'Should add new file');
    assert.ok(copySrcs.includes('another-new.md'), 'Should add another new file');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: basic additive update adds new variables', async () => {
  const srcDir = createSourceDir('.test-update-vars');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-vars': {
          description: 'Original template',
          templateRoot: '/old/path',
          folders: [],
          copy_files: [],
          variables: [{ name: 'existing_var', prompt: 'Existing:', required: true }]
        }
      }
    };
    saveConfig(initialConfig);

    fs.writeFileSync(path.join(srcDir, 'template.txt'), 'Hello {{ new_var }} and {{ existing_var }}');

    await update(srcDir, 'update-test-vars', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['update-test-vars'];
    
    const varNames = tpl.variables!.map(v => v.name);
    assert.ok(varNames.includes('existing_var'), 'Should preserve existing variable');
    assert.ok(varNames.includes('new_var'), 'Should add new detected variable');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: --no-diff full mode replaces template completely', async () => {
  const srcDir = createSourceDir('.test-update-full');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-full': {
          description: 'Old description',
          templateRoot: '/old/path',
          folders: [{ name: 'old-folder', info: 'old', children: [] }],
          copy_files: [{ src: 'old.txt', dest: 'old.txt', substitute_variables: true }],
          variables: [{ name: 'old_var', prompt: 'Old:', required: true }]
        }
      }
    };
    saveConfig(initialConfig);

    fs.mkdirSync(path.join(srcDir, 'new-folder'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'new.txt'), 'new content');
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# New {{ var }}');

    await update(srcDir, 'update-test-full', { yes: true, noDiff: true });

    const config = loadConfig();
    const tpl = config.templates['update-test-full'];
    
    // Full mode should replace everything
    const folderNames = tpl.folders.map(f => f.name);
    assert.ok(folderNames.includes('new-folder'), 'Should have new folder');
    assert.ok(!folderNames.includes('old-folder'), 'Should NOT have old folder');
    
    const copySrcs = tpl.copy_files!.map(cf => cf.src);
    assert.ok(copySrcs.includes('new.txt'), 'Should have new file');
    assert.ok(!copySrcs.includes('old.txt'), 'Should NOT have old file');
    
    const varNames = tpl.variables!.map(v => v.name);
    assert.ok(varNames.includes('var'), 'Should have new variable');
    assert.ok(!varNames.includes('old_var'), 'Should NOT have old variable');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: preserves copy_files settings (substitute_variables, chmod)', async () => {
  const srcDir = createSourceDir('.test-update-copyfiles');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-copy': {
          description: 'Test',
          templateRoot: '/old/path',
          folders: [],
          copy_files: [
            { src: 'config.yaml', dest: 'config.yaml', substitute_variables: false, chmod: '644' },
            { src: 'script.sh', dest: 'script.sh', substitute_variables: true, chmod: '755' }
          ],
          variables: []
        }
      }
    };
    saveConfig(initialConfig);

    fs.writeFileSync(path.join(srcDir, 'config.yaml'), 'key: value');
    fs.writeFileSync(path.join(srcDir, 'script.sh'), '#!/bin/bash\necho hello');
    fs.writeFileSync(path.join(srcDir, 'new.txt'), 'new');

    await update(srcDir, 'update-test-copy', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['update-test-copy'];
    
    // Find the preserved entries
    const configEntry = tpl.copy_files!.find(cf => cf.src === 'config.yaml');
    const scriptEntry = tpl.copy_files!.find(cf => cf.src === 'script.sh');
    const newEntry = tpl.copy_files!.find(cf => cf.src === 'new.txt');
    
    assert.ok(configEntry, 'Should preserve config.yaml entry');
    assert.strictEqual(configEntry.substitute_variables, false, 'Should preserve substitute_variables: false');
    assert.strictEqual(configEntry.chmod, '644', 'Should preserve chmod');
    
    assert.ok(scriptEntry, 'Should preserve script.sh entry');
    assert.strictEqual(scriptEntry.substitute_variables, true, 'Should preserve substitute_variables: true');
    assert.strictEqual(scriptEntry.chmod, '755', 'Should preserve chmod');
    
    assert.ok(newEntry, 'Should add new file');
    assert.strictEqual(newEntry.substitute_variables, true, 'New files default to substitute_variables: true');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: interactive mode can select which new items to add', async () => {
  const srcDir = createSourceDir('.test-update-interactive');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-interactive': {
          description: 'Original',
          templateRoot: '/old/path',
          folders: [{ name: 'existing', info: '', children: [] }],
          copy_files: [{ src: 'existing.txt', dest: 'existing.txt', substitute_variables: true }],
          variables: [{ name: 'existing_var', prompt: 'Existing:', required: true }]
        }
      }
    };
    saveConfig(initialConfig);

    fs.mkdirSync(path.join(srcDir, 'existing'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'new-folder-a'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'new-folder-b'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'existing.txt'), 'old');
    fs.writeFileSync(path.join(srcDir, 'new-a.txt'), 'a');
    fs.writeFileSync(path.join(srcDir, 'new-b.txt'), 'b');
    fs.writeFileSync(path.join(srcDir, 'template.txt'), '{{ new_var_a }} and {{ new_var_b }}');

    // Test with --yes (auto-select all)
    await update(srcDir, 'update-test-interactive', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['update-test-interactive'];
    
    // Should have all new folders added
    const folderNames = tpl.folders.map(f => f.name);
    assert.ok(folderNames.includes('existing'), 'Preserves existing');
    assert.ok(folderNames.includes('new-folder-a'), 'Adds new-folder-a');
    assert.ok(folderNames.includes('new-folder-b'), 'Adds new-folder-b');
    
    // Should have all new files added
    const copySrcs = tpl.copy_files!.map(cf => cf.src);
    assert.ok(copySrcs.includes('existing.txt'), 'Preserves existing file');
    assert.ok(copySrcs.includes('new-a.txt'), 'Adds new-a.txt');
    assert.ok(copySrcs.includes('new-b.txt'), 'Adds new-b.txt');
    
    // Should have all new variables
    const varNames = tpl.variables!.map(v => v.name);
    assert.ok(varNames.includes('existing_var'), 'Preserves existing var');
    assert.ok(varNames.includes('new_var_a'), 'Adds new_var_a');
    assert.ok(varNames.includes('new_var_b'), 'Adds new_var_b');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: handles post_config scripts additively', async () => {
  const srcDir = createSourceDir('.test-update-postconfig');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-post': {
          description: 'Test',
          templateRoot: '/old/path',
          folders: [],
          copy_files: [],
          variables: [],
          post_config: [{ command: 'npm install', description: 'Install deps' }]
        }
      }
    };
    saveConfig(initialConfig);

    fs.writeFileSync(path.join(srcDir, 'post_config.sh'), '#!/bin/bash\necho "Running: Build"\nnpm run build\n');

    await update(srcDir, 'update-test-post', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['update-test-post'];
    
    const commands = tpl.post_config!.map(t => t.command);
    assert.ok(commands.includes('npm install'), 'Preserves existing post_config');
    assert.ok(commands.includes('npm run build'), 'Adds new post_config from script');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: handles post_copy executables additively', async () => {
  const srcDir = createSourceDir('.test-update-postcopy');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-pc': {
          description: 'Test',
          templateRoot: '/old/path',
          folders: [],
          copy_files: [],
          variables: [],
          post_copy: [{ src: 'old.sh', dest: 'old.sh' }]
        }
      }
    };
    saveConfig(initialConfig);

    fs.writeFileSync(path.join(srcDir, 'old.sh'), '#!/bin/bash\necho old');
    fs.writeFileSync(path.join(srcDir, 'new.sh'), '#!/bin/bash\necho new');
    fs.chmodSync(path.join(srcDir, 'old.sh'), 0o755);
    fs.chmodSync(path.join(srcDir, 'new.sh'), 0o755);

    await update(srcDir, 'update-test-pc', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['update-test-pc'];
    
    const postCopySrcs = tpl.post_copy!.map(pc => pc.src);
    assert.ok(postCopySrcs.includes('old.sh'), 'Preserves existing post_copy');
    assert.ok(postCopySrcs.includes('new.sh'), 'Adds new executable');
    
    // copy_files should not include post_copy files
    const copySrcs = tpl.copy_files!.map(cf => cf.src);
    assert.ok(!copySrcs.includes('old.sh'), 'Does not duplicate in copy_files');
    assert.ok(!copySrcs.includes('new.sh'), 'Does not duplicate new in copy_files');
  } finally {
    cleanup(srcDir, testHome);
  }
});

test('update: JSON mode outputs template config', async () => {
  const srcDir = createSourceDir('.test-update-json');
  cleanup(testHome);
  
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-test-json': {
          description: 'Original',
          templateRoot: '/old/path',
          folders: [],
          copy_files: [],
          variables: []
        }
      }
    };
    saveConfig(initialConfig);

    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Test');
    fs.writeFileSync(path.join(srcDir, 'template.txt'), '{{ var }}');

    // Capture stdout using a proper approach
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      output.push(args.join(' '));
    };
    
    try {
      await update(srcDir, 'update-test-json', { yes: true, json: true });
    } finally {
      console.log = originalLog;
    }
    
    // Find the JSON line (last line that starts with {)
    const jsonLine = output.reverse().find(line => line.trim().startsWith('{'));
    const parsed = JSON.parse(jsonLine!);
    assert.strictEqual(parsed.name, 'update-test-json');
    assert.ok(parsed.folders);
    assert.ok(parsed.copy_files);
    assert.ok(parsed.variables);
  } finally {
    cleanup(srcDir, testHome);
  }
});

cleanup(testHome);