import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-learn');
process.env.HOME = testHome;

import { learn } from '../src/commands/learnCommand.js';
import { loadConfig, saveConfig, PtConfig, CONFIG_PATH } from '../src/config.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a temporary source directory with a given structure. Returns the root path. */
function createSourceDir(name: string): string {
  const dir = path.join(process.cwd(), name);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Remove a directory tree (and swallow ENOENT). */
function rmrf(p: string) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
  }
}

/** Ensure a clean test config state (no leftover config files). */
function cleanConfig() {
  if (fs.existsSync(CONFIG_PATH)) fs.unlinkSync(CONFIG_PATH);
  const bak = CONFIG_PATH + '.bak';
  if (fs.existsSync(bak)) fs.unlinkSync(bak);
}

/** Capture console.log output during an async callback. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const original = console.log;
  let captured = '';
  console.log = (...args: unknown[]) => {
    captured += args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ') + '\n';
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return captured;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('learn with --yes flag saves template to config', async () => {
  const srcDir = createSourceDir('.test-learn-yes');
  cleanConfig();
  try {
    // Create a minimal directory structure
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'docs'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Hello');

    await learn(srcDir, null, { yes: true });

    const config = loadConfig();
    const templateName = path.basename(srcDir);
    assert.ok(config.templates[templateName], `Template "${templateName}" should be saved`);
    assert.ok(config.templates[templateName].templateRoot, 'Should have a templateRoot');
    assert.ok(Array.isArray(config.templates[templateName].folders), 'Should have folders array');

    // The folder skeleton should include the two directories we created
    const folderNames = config.templates[templateName].folders.map(f => f.name);
    assert.ok(folderNames.includes('src'), 'Structure should contain src');
    assert.ok(folderNames.includes('docs'), 'Structure should contain docs');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn with --json outputs JSON and does NOT save to config', async () => {
  const srcDir = createSourceDir('.test-learn-json');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Project');

    const output = await captureStdout(async () => {
      await learn(srcDir, null, { json: true });
    });

    // Should have produced valid JSON
    const parsed = JSON.parse(output.trim());
    assert.ok(parsed.name, 'JSON output should have a name');
    assert.ok(Array.isArray(parsed.folders), 'JSON output should have folders array');

    // Config should NOT have the template
    const config = loadConfig();
    assert.strictEqual(
      Object.keys(config.templates).length,
      0,
      'No template should be saved when --json is used'
    );
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn with --name and --desc options', async () => {
  const srcDir = createSourceDir('.test-learn-name-desc');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'app'), { recursive: true });

    await learn(srcDir, null, { yes: true, name: 'my-custom-name', desc: 'A custom description' });

    const config = loadConfig();
    assert.ok(config.templates['my-custom-name'], 'Template should be saved under the custom name');
    assert.strictEqual(
      config.templates['my-custom-name'].description,
      'A custom description',
      'Description should match --desc value'
    );
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn detects .pt-template.json for name, description, variables, and folders', async () => {
  const srcDir = createSourceDir('.test-learn-pt-template-json');
  cleanConfig();
  try {
    const ptConfig = {
      name: 'json-detected-template',
      description: 'Loaded from JSON config',
      variables: [
        { name: 'project_name', prompt: 'Project name?', required: true },
        { name: 'author', prompt: 'Author?', default: 'anon' }
      ],
      folders: [
        { name: 'src', info: 'source code', children: [] },
        { name: 'tests', info: 'test files' }
      ]
    };
    fs.writeFileSync(path.join(srcDir, '.pt-template.json'), JSON.stringify(ptConfig, null, 2));

    await learn(srcDir, null, { yes: true });

    const config = loadConfig();
    const tpl = config.templates['json-detected-template'];
    assert.ok(tpl, 'Template should be saved with the name from .pt-template.json');
    assert.strictEqual(tpl.description, 'Loaded from JSON config', 'Description from JSON');

    // Variables from JSON should be present
    assert.ok(tpl.variables, 'Should have variables');
    const varNames = tpl.variables!.map(v => v.name);
    assert.ok(varNames.includes('project_name'), 'Should have project_name variable');
    assert.ok(varNames.includes('author'), 'Should have author variable');

    // Folders from JSON should be used verbatim
    const folderNames = tpl.folders.map(f => f.name);
    assert.ok(folderNames.includes('src'), 'Should have src folder from JSON');
    assert.ok(folderNames.includes('tests'), 'Should have tests folder from JSON');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn detects .info.md for name and description', async () => {
  const srcDir = createSourceDir('.test-learn-info-md');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'stuff'), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, '.info.md'),
      '# My Info Template\nThis is a great template for stuff.\n\nMore details here.\n'
    );

    await learn(srcDir, null, { yes: true });

    const config = loadConfig();
    const tpl = config.templates['My Info Template'];
    assert.ok(tpl, 'Template should be saved with name from .info.md heading');
    assert.strictEqual(
      tpl.description,
      'This is a great template for stuff.',
      'Description should be the first non-empty, non-heading line from .info.md'
    );
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn detects {{ variable_name }} patterns in text files', async () => {
  const srcDir = createSourceDir('.test-learn-variables');
  cleanConfig();
  try {
    // Create files containing template variables
    fs.writeFileSync(
      path.join(srcDir, 'README.md'),
      '# {{ project_name }}\nAuthor: {{ author_name }}\n'
    );
    fs.mkdirSync(path.join(srcDir, 'config'), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'config', 'settings.yaml'),
      'app_name: {{ app_title }}\nversion: {{ version }}\n'
    );
    // Also add a binary-ish extension file that should NOT be scanned
    fs.writeFileSync(path.join(srcDir, 'image.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    await learn(srcDir, null, { yes: true, name: 'var-test' });

    const config = loadConfig();
    const tpl = config.templates['var-test'];
    assert.ok(tpl, 'Template should exist');
    assert.ok(tpl.variables, 'Should have detected variables');

    const varNames = tpl.variables!.map(v => v.name);
    assert.ok(varNames.includes('project_name'), 'Should detect project_name');
    assert.ok(varNames.includes('author_name'), 'Should detect author_name');
    assert.ok(varNames.includes('app_title'), 'Should detect app_title from subfolder');
    assert.ok(varNames.includes('version'), 'Should detect version from subfolder');

    // Each auto-detected variable should have sensible defaults
    for (const v of tpl.variables!) {
      assert.ok(v.prompt, `Variable "${v.name}" should have a prompt`);
      assert.strictEqual(v.required, true, `Auto-detected variable "${v.name}" should be required`);
    }
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn with --ignore patterns excludes matching directories', async () => {
  const srcDir = createSourceDir('.test-learn-ignore');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'vendor'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'tmp_stuff'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Test');

    await learn(srcDir, null, { yes: true, name: 'ignore-test', ignore: 'vendor,tmp_stuff' });

    const config = loadConfig();
    const tpl = config.templates['ignore-test'];
    assert.ok(tpl, 'Template should exist');

    const folderNames = tpl.folders.map(f => f.name);
    assert.ok(folderNames.includes('src'), 'src should be included');
    assert.ok(!folderNames.includes('vendor'), 'vendor should be excluded by --ignore');
    assert.ok(!folderNames.includes('tmp_stuff'), 'tmp_stuff should be excluded by --ignore');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn detects executable files for post_copy', async () => {
  const srcDir = createSourceDir('.test-learn-executables');
  cleanConfig();
  try {
    // Create executable files (detected by extension)
    fs.writeFileSync(path.join(srcDir, 'setup.sh'), '#!/bin/bash\necho hello');
    fs.writeFileSync(path.join(srcDir, 'deploy.py'), '#!/usr/bin/env python3\nprint("deploy")');
    // Create a non-executable text file
    fs.writeFileSync(path.join(srcDir, 'notes.txt'), 'just notes');
    // Create a Makefile (always detected as executable)
    fs.writeFileSync(path.join(srcDir, 'Makefile'), 'all:\n\techo build');
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });

    await learn(srcDir, null, { yes: true, name: 'exec-test' });

    const config = loadConfig();
    const tpl = config.templates['exec-test'];
    assert.ok(tpl, 'Template should exist');
    assert.ok(tpl.post_copy, 'Should have post_copy entries');

    const postCopySrcs = tpl.post_copy!.map(pc => pc.src);
    assert.ok(postCopySrcs.includes('setup.sh'), 'setup.sh should be in post_copy');
    assert.ok(postCopySrcs.includes('deploy.py'), 'deploy.py should be in post_copy');
    assert.ok(postCopySrcs.includes('Makefile'), 'Makefile should be in post_copy');

    // Executables should NOT be in copy_files (they get moved to post_copy)
    if (tpl.copy_files) {
      const copySrcs = tpl.copy_files.map(cf => cf.src);
      assert.ok(!copySrcs.includes('setup.sh'), 'setup.sh should not be in copy_files');
      assert.ok(!copySrcs.includes('deploy.py'), 'deploy.py should not be in copy_files');
    }
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn detects post_config tasks from post_config.sh', async () => {
  const srcDir = createSourceDir('.test-learn-post-config');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'app'), { recursive: true });
    // Create a post_config.sh with the expected format
    const scriptContent = [
      '#!/bin/bash',
      'echo "Running: Installing dependencies"',
      'npm install',
      'echo "Running: Building project"',
      'npm run build',
      '# This is a comment and should be skipped',
      'echo "Running: Running tests"',
      'npm test',
    ].join('\n');
    fs.writeFileSync(path.join(srcDir, 'post_config.sh'), scriptContent);

    await learn(srcDir, null, { yes: true, name: 'postconfig-test' });

    const config = loadConfig();
    const tpl = config.templates['postconfig-test'];
    assert.ok(tpl, 'Template should exist');
    assert.ok(tpl.post_config, 'Should have post_config tasks');
    assert.strictEqual(tpl.post_config!.length, 3, 'Should have 3 post_config tasks');

    // Verify task commands and descriptions
    assert.strictEqual(tpl.post_config![0].command, 'npm install');
    assert.strictEqual(tpl.post_config![0].description, 'Installing dependencies');

    assert.strictEqual(tpl.post_config![1].command, 'npm run build');
    assert.strictEqual(tpl.post_config![1].description, 'Building project');

    assert.strictEqual(tpl.post_config![2].command, 'npm test');
    assert.strictEqual(tpl.post_config![2].description, 'Running tests');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn updates an existing template with updateTemplate param', async () => {
  const srcDir = createSourceDir('.test-learn-update');
  cleanConfig();
  try {
    // Seed an initial config with an existing template
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'existing-tpl': {
          description: 'Old description',
          templateRoot: '/old/path',
          folders: [{ name: 'old-folder', info: 'old info' }],
          variables: [
            { name: 'old_var', prompt: 'Old var:', required: true }
          ]
        }
      }
    };
    saveConfig(initialConfig);

    // Create new source structure
    fs.mkdirSync(path.join(srcDir, 'new-folder'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'another'), { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Updated {{ new_var }}');

    // Update the existing template (--yes keeps existing description)
    await learn(srcDir, 'existing-tpl', { yes: true });

    const config = loadConfig();
    const tpl = config.templates['existing-tpl'];
    assert.ok(tpl, 'Template should still exist');
    assert.strictEqual(tpl.description, 'Old description', 'Description preserved with --yes on update');
    assert.strictEqual(tpl.templateRoot, path.resolve(srcDir), 'templateRoot should be updated');

    // Folders should reflect the NEW source structure
    const folderNames = tpl.folders.map(f => f.name);
    assert.ok(folderNames.includes('new-folder'), 'Should include new-folder from updated source');
    assert.ok(folderNames.includes('another'), 'Should include another from updated source');

    // Old variable should be preserved, and new_var should be added from detection
    assert.ok(tpl.variables, 'Should have variables');
    const varNames = tpl.variables!.map(v => v.name);
    assert.ok(varNames.includes('old_var'), 'Old variable should be preserved');
    assert.ok(varNames.includes('new_var'), 'New detected variable should be added');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn --json output includes detected variables and folders', async () => {
  const srcDir = createSourceDir('.test-learn-json-full');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'components'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'utils'), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'config.yaml'),
      'title: {{ site_title }}\nowner: {{ owner_name }}\n'
    );

    const output = await captureStdout(async () => {
      await learn(srcDir, null, { json: true, name: 'json-full-test' });
    });

    const parsed = JSON.parse(output.trim());
    assert.strictEqual(parsed.name, 'json-full-test', 'JSON name should match --name');

    // Should contain detected variables
    assert.ok(parsed.variables, 'JSON should include variables');
    const varNames = parsed.variables.map((v: { name: string }) => v.name);
    assert.ok(varNames.includes('site_title'), 'Should detect site_title');
    assert.ok(varNames.includes('owner_name'), 'Should detect owner_name');

    // Should contain folders
    assert.ok(Array.isArray(parsed.folders), 'JSON should include folders');
    const folderNames = parsed.folders.map((f: { name: string }) => f.name);
    assert.ok(folderNames.includes('components'), 'Should have components folder');
    assert.ok(folderNames.includes('utils'), 'Should have utils folder');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn with .pt-template.json overrides --yes name fallback', async () => {
  const srcDir = createSourceDir('.test-learn-json-name-priority');
  cleanConfig();
  try {
    // .pt-template.json has a name — it should win over the directory basename
    const ptConfig = { name: 'from-json', description: 'JSON desc' };
    fs.writeFileSync(path.join(srcDir, '.pt-template.json'), JSON.stringify(ptConfig));
    fs.mkdirSync(path.join(srcDir, 'a'), { recursive: true });

    await learn(srcDir, null, { yes: true });

    const config = loadConfig();
    assert.ok(config.templates['from-json'], 'Should use name from .pt-template.json, not dirname');
    assert.ok(!config.templates[path.basename(srcDir)], 'Should NOT use dirname as name');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn --name takes priority over .pt-template.json name', async () => {
  const srcDir = createSourceDir('.test-learn-cli-name-priority');
  cleanConfig();
  try {
    const ptConfig = { name: 'from-json', description: 'JSON desc' };
    fs.writeFileSync(path.join(srcDir, '.pt-template.json'), JSON.stringify(ptConfig));
    fs.mkdirSync(path.join(srcDir, 'x'), { recursive: true });

    await learn(srcDir, null, { yes: true, name: 'cli-name' });

    const config = loadConfig();
    assert.ok(config.templates['cli-name'], 'CLI --name should take priority over JSON name');
    assert.ok(!config.templates['from-json'], 'JSON name should NOT be used when --name is given');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn --desc takes priority over .pt-template.json description', async () => {
  const srcDir = createSourceDir('.test-learn-cli-desc-priority');
  cleanConfig();
  try {
    const ptConfig = { name: 'desc-priority-test', description: 'JSON description' };
    fs.writeFileSync(path.join(srcDir, '.pt-template.json'), JSON.stringify(ptConfig));
    fs.mkdirSync(path.join(srcDir, 'z'), { recursive: true });

    await learn(srcDir, null, { yes: true, desc: 'CLI description' });

    const config = loadConfig();
    const tpl = config.templates['desc-priority-test'];
    assert.ok(tpl, 'Template should exist');
    assert.strictEqual(tpl.description, 'CLI description', '--desc should override JSON description');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn update with --desc replaces existing description', async () => {
  const srcDir = createSourceDir('.test-learn-update-desc');
  cleanConfig();
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'update-desc-tpl': {
          description: 'Original desc',
          templateRoot: '/some/old/path',
          folders: []
        }
      }
    };
    saveConfig(initialConfig);

    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });

    await learn(srcDir, 'update-desc-tpl', { yes: true, desc: 'New description' });

    const config = loadConfig();
    assert.strictEqual(
      config.templates['update-desc-tpl'].description,
      'New description',
      'Description should be replaced on update with --desc'
    );
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn excludes default directories (.git, node_modules, etc.)', async () => {
  const srcDir = createSourceDir('.test-learn-default-excludes');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, '.git', 'objects'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'node_modules', 'somepkg'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, '.vscode'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'dist'), { recursive: true });

    await learn(srcDir, null, { yes: true, name: 'exclude-test' });

    const config = loadConfig();
    const tpl = config.templates['exclude-test'];
    const folderNames = tpl.folders.map(f => f.name);

    assert.ok(folderNames.includes('src'), 'src should be included');
    assert.ok(!folderNames.includes('.git'), '.git should be excluded');
    assert.ok(!folderNames.includes('node_modules'), 'node_modules should be excluded');
    assert.ok(!folderNames.includes('.vscode'), '.vscode should be excluded');
    assert.ok(!folderNames.includes('dist'), 'dist should be excluded');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn populates copy_files with auto-selected boilerplate files', async () => {
  const srcDir = createSourceDir('.test-learn-copy-files');
  cleanConfig();
  try {
    // Files that should be auto-selected by --yes
    fs.writeFileSync(path.join(srcDir, 'README.md'), '# Project');
    fs.writeFileSync(path.join(srcDir, '.gitignore'), 'node_modules/');
    fs.writeFileSync(path.join(srcDir, 'package.json'), '{}');
    // A file that should NOT be auto-selected (not in the defaults list)
    fs.writeFileSync(path.join(srcDir, 'random.txt'), 'stuff');
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });

    await learn(srcDir, null, { yes: true, name: 'copyfiles-test' });

    const config = loadConfig();
    const tpl = config.templates['copyfiles-test'];
    assert.ok(tpl.copy_files, 'Should have copy_files');

    const copySrcs = tpl.copy_files!.map(cf => cf.src);
    assert.ok(copySrcs.includes('README.md'), 'README.md should be auto-selected');
    assert.ok(copySrcs.includes('.gitignore'), '.gitignore should be auto-selected');
    assert.ok(!copySrcs.includes('random.txt'), 'random.txt should NOT be auto-selected');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn with nested folder structure extracts children', async () => {
  const srcDir = createSourceDir('.test-learn-nested');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'src', 'components', 'ui'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'src', 'utils'), { recursive: true });
    fs.mkdirSync(path.join(srcDir, 'docs'), { recursive: true });

    await learn(srcDir, null, { yes: true, name: 'nested-test' });

    const config = loadConfig();
    const tpl = config.templates['nested-test'];

    // Find the src folder node
    const srcNode = tpl.folders.find(f => f.name === 'src');
    assert.ok(srcNode, 'Should have src folder');
    assert.ok(srcNode!.children, 'src should have children');

    const srcChildNames = srcNode!.children!.map(c => c.name);
    assert.ok(srcChildNames.includes('components'), 'src should have components child');
    assert.ok(srcChildNames.includes('utils'), 'src should have utils child');

    // Find the components node inside src
    const componentsNode = srcNode!.children!.find(c => c.name === 'components');
    assert.ok(componentsNode, 'Should have components node');
    assert.ok(componentsNode!.children, 'components should have children');
    const uiNode = componentsNode!.children!.find(c => c.name === 'ui');
    assert.ok(uiNode, 'components should have ui child');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn reads .info.md inside subdirectories for folder info', async () => {
  const srcDir = createSourceDir('.test-learn-folder-info');
  cleanConfig();
  try {
    fs.mkdirSync(path.join(srcDir, 'assets'), { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'assets', '.info.md'),
      '# Assets\nStatic assets like images and fonts.'
    );

    await learn(srcDir, null, { yes: true, name: 'folder-info-test' });

    const config = loadConfig();
    const tpl = config.templates['folder-info-test'];
    const assetsNode = tpl.folders.find(f => f.name === 'assets');
    assert.ok(assetsNode, 'Should have assets folder');
    assert.ok(
      assetsNode!.info.includes('Assets'),
      'Folder info should contain content from .info.md'
    );
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn with .pt-template.json copy_files uses JSON copy_files', async () => {
  const srcDir = createSourceDir('.test-learn-json-copyfiles');
  cleanConfig();
  try {
    const ptConfig = {
      name: 'json-copyfiles',
      description: 'Test JSON copy_files',
      copy_files: [
        { src: 'custom.conf', dest: 'config/custom.conf', substitute_variables: true },
        { src: 'helper.txt', dest: 'bin/helper.txt', substitute_variables: false }
      ]
    };
    fs.writeFileSync(path.join(srcDir, '.pt-template.json'), JSON.stringify(ptConfig));
    fs.writeFileSync(path.join(srcDir, 'custom.conf'), 'key=value');
    fs.writeFileSync(path.join(srcDir, 'helper.txt'), '#!/bin/bash');
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });

    await learn(srcDir, null, { yes: true });

    const config = loadConfig();
    const tpl = config.templates['json-copyfiles'];
    assert.ok(tpl.copy_files, 'Should have copy_files');
    assert.strictEqual(tpl.copy_files!.length, 2, 'Should have 2 copy_files from JSON');
    assert.strictEqual(tpl.copy_files![0].src, 'custom.conf');
    assert.strictEqual(tpl.copy_files![0].dest, 'config/custom.conf');
    assert.strictEqual(tpl.copy_files![1].src, 'helper.txt');
    assert.strictEqual(tpl.copy_files![1].dest, 'bin/helper.txt');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn with .pt-template.json post_config uses JSON post_config', async () => {
  const srcDir = createSourceDir('.test-learn-json-postconfig');
  cleanConfig();
  try {
    const ptConfig = {
      name: 'json-postconfig',
      description: 'Test JSON post_config',
      post_config: [
        { command: 'yarn install', description: 'Install deps' },
        { command: 'yarn build', description: 'Build project' }
      ]
    };
    fs.writeFileSync(path.join(srcDir, '.pt-template.json'), JSON.stringify(ptConfig));
    // Also have a post_config.sh — it should be IGNORED in favor of JSON
    fs.writeFileSync(path.join(srcDir, 'post_config.sh'), '#!/bin/bash\nnpm install');
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });

    await learn(srcDir, null, { yes: true });

    const config = loadConfig();
    const tpl = config.templates['json-postconfig'];
    assert.ok(tpl.post_config, 'Should have post_config');
    assert.strictEqual(tpl.post_config!.length, 2, 'Should use JSON post_config, not script');
    assert.strictEqual(tpl.post_config![0].command, 'yarn install');
    assert.strictEqual(tpl.post_config![1].command, 'yarn build');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});

test('learn update merges new variables with existing ones', async () => {
  const srcDir = createSourceDir('.test-learn-update-vars');
  cleanConfig();
  try {
    const initialConfig: PtConfig = {
      version: '3.0',
      templates: {
        'merge-vars-tpl': {
          description: 'Merge test',
          templateRoot: '/old',
          folders: [],
          variables: [
            { name: 'existing_var', prompt: 'Existing:', default: 'old-default', required: true },
            { name: 'shared_var', prompt: 'Shared:', required: false }
          ]
        }
      }
    };
    saveConfig(initialConfig);

    // Source with a file containing {{ shared_var }} and {{ brand_new_var }}
    fs.writeFileSync(
      path.join(srcDir, 'template.md'),
      'Hello {{ shared_var }} and {{ brand_new_var }}!'
    );
    fs.mkdirSync(path.join(srcDir, 'src'), { recursive: true });

    await learn(srcDir, 'merge-vars-tpl', { yes: true });

    const config = loadConfig();
    const vars = config.templates['merge-vars-tpl'].variables!;
    const varNames = vars.map(v => v.name);

    assert.ok(varNames.includes('existing_var'), 'Existing variable should be preserved');
    assert.ok(varNames.includes('shared_var'), 'Shared variable should still exist');
    assert.ok(varNames.includes('brand_new_var'), 'New detected variable should be added');

    // Verify the existing_var retains its original properties
    const existingVar = vars.find(v => v.name === 'existing_var')!;
    assert.strictEqual(existingVar.default, 'old-default', 'Existing var default should be preserved');
  } finally {
    rmrf(srcDir);
    cleanConfig();
    rmrf(testHome);
  }
});
