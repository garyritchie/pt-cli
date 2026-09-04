import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

const testHome = path.join(process.cwd(), '.test-home-modularity');
process.env.HOME = testHome;

import { init, mergeFolderNodes, mergeVariables, isRootReadme } from '../src/commands/initCommand.js';
import { saveConfig, PtConfig, TemplateConfig } from '../src/config.js';

function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

test('isRootReadme helper tests', () => {
  assert.strictEqual(isRootReadme('readme.md'), true);
  assert.strictEqual(isRootReadme('README.md'), true);
  assert.strictEqual(isRootReadme('./readme.md'), true);
  assert.strictEqual(isRootReadme('.\\readme.md'), true);
  assert.strictEqual(isRootReadme('README.MD'), true);
  assert.strictEqual(isRootReadme('src/README.md'), false);
  assert.strictEqual(isRootReadme('other.md'), false);
});

test('mergeFolderNodes merges nested trees and deduplicates', () => {
  const treeA = [
    {
      name: 'src',
      info: 'Source A',
      children: [
        { name: 'components', info: 'Components A' }
      ]
    },
    { name: 'docs', info: 'Docs A' }
  ];

  const treeB = [
    {
      name: 'src',
      info: 'Source B',
      children: [
        { name: 'utils', info: 'Utils B' }
      ]
    },
    { name: 'tests', info: 'Tests B' }
  ];

  const merged = mergeFolderNodes(treeA, treeB);
  assert.strictEqual(merged.length, 3);

  const srcNode = merged.find(n => n.name === 'src');
  assert.ok(srcNode);
  assert.strictEqual(srcNode?.info, 'Source B'); // Later overrides info
  assert.strictEqual(srcNode?.children?.length, 2);
  assert.ok(srcNode?.children?.some(c => c.name === 'components'));
  assert.ok(srcNode?.children?.some(c => c.name === 'utils'));

  assert.ok(merged.some(n => n.name === 'docs'));
  assert.ok(merged.some(n => n.name === 'tests'));
});

test('mergeVariables deduplicates and allows later template to override defaults', () => {
  const t1 = {
    name: 'base',
    template: {
      description: 'base',
      folders: [],
      variables: [
        { name: 'project_name', prompt: 'Project name:', default: 'my-app' },
        { name: 'port', prompt: 'Port:', default: '8080' }
      ]
    }
  };

  const t2 = {
    name: 'caddy',
    template: {
      description: 'caddy',
      folders: [],
      variables: [
        { name: 'port', prompt: 'Caddy Port:', default: '443' },
        { name: 'domain', prompt: 'Domain:', default: 'example.com' }
      ]
    }
  };

  const merged = mergeVariables([t1, t2]);
  assert.strictEqual(merged.length, 3);

  const portVar = merged.find(v => v.name === 'port');
  assert.ok(portVar);
  assert.strictEqual(portVar?.default, '443'); // Later template overrides default!
  assert.strictEqual(portVar?.prompt, 'Caddy Port:');

  const nameVar = merged.find(v => v.name === 'project_name');
  assert.strictEqual(nameVar?.default, 'my-app');

  const domainVar = merged.find(v => v.name === 'domain');
  assert.strictEqual(domainVar?.default, 'example.com');
});

test('multi-template init merges templates, folders, variables, and post_config', async () => {
  const destDir = path.join(process.cwd(), 'test-modular-dest');
  const t1Root = path.join(process.cwd(), 'test-modular-t1-root');
  const t2Root = path.join(process.cwd(), 'test-modular-t2-root');

  cleanup(destDir, t1Root, t2Root, testHome);

  fs.mkdirSync(t1Root, { recursive: true });
  fs.mkdirSync(t2Root, { recursive: true });

  fs.writeFileSync(path.join(t1Root, 'base-file.txt'), 'base content');
  fs.writeFileSync(path.join(t2Root, 'addon-file.txt'), 'addon content {{ port }}');

  const t1Config: TemplateConfig = {
    description: 'Base Web App',
    templateRoot: t1Root,
    folders: [
      {
        name: 'src',
        info: 'Base sources',
        children: [{ name: 'frontend', info: 'UI' }]
      }
    ],
    variables: [
      { name: 'port', prompt: 'Port:', default: '3000' }
    ],
    copy_files: [
      { src: 'base-file.txt', dest: 'base-file.txt' }
    ],
    post_config: [
      { description: 'Run base setup', command: 'echo "BASE SETUP"' }
    ]
  };

  const t2Config: TemplateConfig = {
    description: 'Caddy Proxy Addon',
    templateRoot: t2Root,
    folders: [
      {
        name: 'src',
        info: 'Caddy sources',
        children: [{ name: 'proxy', info: 'Proxy config' }]
      }
    ],
    variables: [
      { name: 'port', prompt: 'Caddy port:', default: '443' }
    ],
    copy_files: [
      { src: 'addon-file.txt', dest: 'addon-file.txt', substitute_variables: true }
    ],
    post_config: [
      { description: 'Run caddy setup', command: 'echo "CADDY SETUP"' }
    ]
  };

  const config: PtConfig = {
    version: '3.0',
    templates: {
      'base-app': t1Config,
      'caddy-addon': t2Config
    }
  };
  saveConfig(config);

  // Call init with args: ['base-app', 'caddy-addon', destDir]
  await init(['base-app', 'caddy-addon', destDir], {
    yes: true,
    skipPostConfig: true
  });

  // Verify destination structure exists and is merged
  assert.ok(fs.existsSync(destDir));
  assert.ok(fs.existsSync(path.join(destDir, 'src/frontend')));
  assert.ok(fs.existsSync(path.join(destDir, 'src/proxy')));

  // Verify copy files from both templates
  assert.ok(fs.existsSync(path.join(destDir, 'base-file.txt')));
  assert.strictEqual(fs.readFileSync(path.join(destDir, 'base-file.txt'), 'utf-8'), 'base content');

  assert.ok(fs.existsSync(path.join(destDir, 'addon-file.txt')));
  // Verify later template default (443) was used for port substitution
  assert.strictEqual(fs.readFileSync(path.join(destDir, 'addon-file.txt'), 'utf-8'), 'addon content 443');

  // Verify .info.md contains both template names
  const infoContent = fs.readFileSync(path.join(destDir, '.info.md'), 'utf-8');
  assert.ok(infoContent.includes('base-app'));
  assert.ok(infoContent.includes('caddy-addon'));

  cleanup(destDir, t1Root, t2Root, testHome);
});

test('readme renaming when multiple templates define root readme', async () => {
  const destDir = path.join(process.cwd(), 'test-readme-rename-dest');
  const t1Root = path.join(process.cwd(), 'test-readme-t1-root');
  const t2Root = path.join(process.cwd(), 'test-readme-t2-root');

  cleanup(destDir, t1Root, t2Root, testHome);

  fs.mkdirSync(t1Root, { recursive: true });
  fs.mkdirSync(t2Root, { recursive: true });

  fs.writeFileSync(path.join(t1Root, 'README.md'), '# Base Documentation');
  fs.writeFileSync(path.join(t2Root, 'readme.md'), '# Addon Documentation');

  const config: PtConfig = {
    version: '3.0',
    templates: {
      'base': {
        description: 'Base with uppercase README',
        templateRoot: t1Root,
        folders: [],
        copy_files: [{ src: 'README.md', dest: 'README.md' }]
      },
      'addon': {
        description: 'Addon with lowercase readme',
        templateRoot: t2Root,
        folders: [],
        copy_files: [{ src: 'readme.md', dest: 'readme.md' }]
      }
    }
  };
  saveConfig(config);

  await init(['base', 'addon', destDir], {
    yes: true,
    skipPostConfig: true
  });

  // Since both templates have root readmes, both should be renamed preserving case
  assert.ok(!fs.existsSync(path.join(destDir, 'README.md')), 'Standard README.md should not exist');
  assert.ok(fs.existsSync(path.join(destDir, 'README_base.md')), 'README_base.md should exist');
  assert.ok(fs.existsSync(path.join(destDir, 'readme_addon.md')), 'readme_addon.md should exist');

  assert.strictEqual(fs.readFileSync(path.join(destDir, 'README_base.md'), 'utf-8'), '# Base Documentation');
  assert.strictEqual(fs.readFileSync(path.join(destDir, 'readme_addon.md'), 'utf-8'), '# Addon Documentation');

  cleanup(destDir, t1Root, t2Root, testHome);
});

test('single template root readme is not renamed', async () => {
  const destDir = path.join(process.cwd(), 'test-single-readme-dest');
  const t1Root = path.join(process.cwd(), 'test-single-readme-root');

  cleanup(destDir, t1Root, testHome);
  fs.mkdirSync(t1Root, { recursive: true });
  fs.writeFileSync(path.join(t1Root, 'README.md'), '# Single Readme');

  const config: PtConfig = {
    version: '3.0',
    templates: {
      'standalone': {
        description: 'Standalone',
        templateRoot: t1Root,
        folders: [],
        copy_files: [{ src: 'README.md', dest: 'README.md' }]
      }
    }
  };
  saveConfig(config);

  await init(['standalone', destDir], {
    yes: true,
    skipPostConfig: true
  });

  // Single readme remains README.md
  assert.ok(fs.existsSync(path.join(destDir, 'README.md')));
  assert.ok(!fs.existsSync(path.join(destDir, 'README_standalone.md')));

  cleanup(destDir, t1Root, testHome);
});

test('collision resolution: overwrite (default) vs newest', async () => {
  const destDir = path.join(process.cwd(), 'test-collision-dest');
  const t1Root = path.join(process.cwd(), 'test-collision-t1-root');
  const t2Root = path.join(process.cwd(), 'test-collision-t2-root');

  cleanup(destDir, t1Root, t2Root, testHome);
  fs.mkdirSync(t1Root, { recursive: true });
  fs.mkdirSync(t2Root, { recursive: true });

  fs.writeFileSync(path.join(t1Root, 'shared.txt'), 'content from t1');
  fs.writeFileSync(path.join(t2Root, 'shared.txt'), 'content from t2');

  const config: PtConfig = {
    version: '3.0',
    templates: {
      't1': {
        description: 'T1',
        templateRoot: t1Root,
        folders: [],
        copy_files: [{ src: 'shared.txt', dest: 'shared.txt' }]
      },
      't2': {
        description: 'T2',
        templateRoot: t2Root,
        folders: [],
        copy_files: [{ src: 'shared.txt', dest: 'shared.txt' }]
      }
    }
  };
  saveConfig(config);

  // Default: overwrite (t2 overwrites t1)
  await init(['t1', 't2', destDir], {
    yes: true,
    skipPostConfig: true
  });
  assert.strictEqual(fs.readFileSync(path.join(destDir, 'shared.txt'), 'utf-8'), 'content from t2');

  cleanup(destDir);

  // Now make t1 newer on disk
  const futureTime = (Date.now() + 100000) / 1000;
  fs.utimesSync(path.join(t1Root, 'shared.txt'), futureTime, futureTime);

  // Collision mode: newest (t1 is newer than t2, so after t1 writes, t2 is skipped because t2 is older)
  await init(['t1', 't2', destDir], {
    yes: true,
    skipPostConfig: true,
    collision: 'newest'
  });
  assert.strictEqual(fs.readFileSync(path.join(destDir, 'shared.txt'), 'utf-8'), 'content from t1');

  cleanup(destDir, t1Root, t2Root, testHome);
});

test('direct JSON template files in variadic slots', async () => {
  const destDir = path.join(process.cwd(), 'test-direct-json-dest');
  const json1 = path.join(process.cwd(), 'test-mod-1.json');
  const json2 = path.join(process.cwd(), 'test-mod-2.json');

  cleanup(destDir, json1, json2, testHome);

  fs.writeFileSync(json1, JSON.stringify({
    name: 'json-module-1',
    description: 'JSON Mod 1',
    folders: [{ name: 'mod1-folder', info: 'mod1' }]
  }));

  fs.writeFileSync(json2, JSON.stringify({
    name: 'json-module-2',
    description: 'JSON Mod 2',
    folders: [{ name: 'mod2-folder', info: 'mod2' }]
  }));

  await init([json1, json2, destDir], {
    yes: true,
    skipPostConfig: true
  });

  assert.ok(fs.existsSync(path.join(destDir, 'mod1-folder')));
  assert.ok(fs.existsSync(path.join(destDir, 'mod2-folder')));

  cleanup(destDir, json1, json2, testHome);
});

test('--json flag outputs structured result', async () => {
  const destDir = path.join(process.cwd(), 'test-json-output-dest');
  const t1Root = path.join(process.cwd(), 'test-json-t1-root');
  const t2Root = path.join(process.cwd(), 'test-json-t2-root');

  cleanup(destDir, t1Root, t2Root, testHome);
  fs.mkdirSync(t1Root, { recursive: true });
  fs.mkdirSync(t2Root, { recursive: true });

  fs.writeFileSync(path.join(t1Root, 'README.md'), '# Base');
  fs.writeFileSync(path.join(t2Root, 'readme.md'), '# Addon');

  const config: PtConfig = {
    version: '3.0',
    templates: {
      'base': {
        description: 'Base',
        templateRoot: t1Root,
        folders: [],
        copy_files: [{ src: 'README.md', dest: 'README.md' }]
      },
      'addon': {
        description: 'Addon',
        templateRoot: t2Root,
        folders: [],
        copy_files: [{ src: 'readme.md', dest: 'readme.md' }]
      }
    }
  };
  saveConfig(config);

  // Capture stdout
  const originalLog = console.log;
  let loggedOutput = '';
  console.log = (str: string) => {
    loggedOutput += str;
  };

  try {
    await init(['base', 'addon', destDir], {
      yes: true,
      skipPostConfig: true,
      json: true
    });
  } finally {
    console.log = originalLog;
  }

  const parsed = JSON.parse(loggedOutput);
  assert.strictEqual(parsed.status, 'success');
  assert.deepStrictEqual(parsed.templates, ['base', 'addon']);
  assert.strictEqual(parsed.dest, path.resolve(destDir));
  assert.deepStrictEqual(parsed.readmes, ['README_base.md', 'readme_addon.md']);

  cleanup(destDir, t1Root, t2Root, testHome);
});
