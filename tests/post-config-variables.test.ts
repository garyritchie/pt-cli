import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-post-config-vars');
process.env.HOME = testHome;

import { init } from '../src/commands/initCommand.js';
import { saveConfig, PtConfig } from '../src/config.js';
import { runPostConfig } from '../src/postconfig.js';

function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
}

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

test('post_config variable substitution: replaces variables in command, script, and description', async () => {
  const projectDest = path.join(process.cwd(), 'test-post-config-vars-project');
  const templateRoot = path.join(process.cwd(), 'test-post-config-vars-root');
  cleanup(projectDest, templateRoot, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });

  setupTestConfig('memory-field-tpl', {
    description: 'Memory field template',
    templateRoot: templateRoot,
    folders: [{ name: 'memories', info: '' }],
    variables: [
      { name: 'MEMORY_NAME', prompt: 'Memory Name:', required: true },
      { name: 'MEMORY_DIR', prompt: 'Memory Dir:', default: 'memories' }
    ],
    post_config: [
      {
        command: 'echo "Creating {{ MEMORY_NAME }} in {{ MEMORY_DIR }}" > result.txt',
        description: 'Create {{ MEMORY_NAME }}'
      }
    ]
  });

  await init('memory-field-tpl', projectDest, {
    yes: true,
    vars: 'MEMORY_NAME=test-agent,MEMORY_DIR=custom-memories'
  });

  // Verify post_config.sh and post_config.bat were written with substituted variables
  const shContent = fs.readFileSync(path.join(projectDest, 'post_config.sh'), 'utf-8');
  assert.ok(
    shContent.includes('echo "Creating test-agent in custom-memories" > result.txt'),
    `post_config.sh should have substituted command, got:\n${shContent}`
  );
  assert.ok(
    shContent.includes('echo "Running: Create test-agent"'),
    `post_config.sh should have substituted description, got:\n${shContent}`
  );
  assert.ok(!shContent.includes('{{ MEMORY_NAME }}'), 'post_config.sh should not contain {{ MEMORY_NAME }}');
  assert.ok(!shContent.includes('{{ MEMORY_DIR }}'), 'post_config.sh should not contain {{ MEMORY_DIR }}');

  const batContent = fs.readFileSync(path.join(projectDest, 'post_config.bat'), 'utf-8');
  assert.ok(
    batContent.includes('echo "Creating test-agent in custom-memories" > result.txt'),
    `post_config.bat should have substituted command, got:\n${batContent}`
  );
  assert.ok(
    batContent.includes('echo Running: Create test-agent'),
    `post_config.bat should have substituted description, got:\n${batContent}`
  );

  // Verify that the task actually executed and produced the output with substituted vars
  const resultTxt = fs.readFileSync(path.join(projectDest, 'result.txt'), 'utf-8');
  assert.strictEqual(resultTxt.trim(), 'Creating test-agent in custom-memories');

  cleanup(projectDest, templateRoot, testHome);
});

test('post_config variable substitution: variables from .env in parent directory', async () => {
  const parentDir = path.join(process.cwd(), 'test-post-config-env-parent');
  const projectDest = path.join(parentDir, 'test-post-config-env-project');
  const templateRoot = path.join(process.cwd(), 'test-post-config-env-root');
  cleanup(projectDest, templateRoot, parentDir, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });
  fs.mkdirSync(parentDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentDir, '.env'),
    'PROJECT_NAME=alpha\nMEMORY_DIR=agent_memories\n'
  );

  setupTestConfig('env-post-config-tpl', {
    description: 'Template with env vars in post_config',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'PROJECT_NAME', prompt: 'Project name:' },
      { name: 'MEMORY_DIR', prompt: 'Memory dir:', default: 'memories' }
    ],
    post_config: [
      {
        command: 'echo "name={{ PROJECT_NAME }} dir={{ MEMORY_DIR }}" > env_result.txt',
        description: 'Initialize {{ PROJECT_NAME }}'
      }
    ]
  });

  await init('env-post-config-tpl', projectDest, {
    yes: true
  });

  const shContent = fs.readFileSync(path.join(projectDest, 'post_config.sh'), 'utf-8');
  assert.ok(shContent.includes('name=alpha dir=agent_memories'));

  const envResult = fs.readFileSync(path.join(projectDest, 'env_result.txt'), 'utf-8');
  assert.strictEqual(envResult.trim(), 'name=alpha dir=agent_memories');

  cleanup(projectDest, templateRoot, parentDir, testHome);
});

test('post_config variable substitution: nested variable expansion in post_config', async () => {
  const parentDir = path.join(process.cwd(), 'test-post-config-nested-parent');
  const projectDest = path.join(parentDir, 'test-post-config-nested-project');
  const templateRoot = path.join(process.cwd(), 'test-post-config-nested-root');
  cleanup(projectDest, templateRoot, parentDir, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });
  fs.mkdirSync(parentDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentDir, '.env'),
    `prefix='rst_{{ project }}'\nproject=deep_nested\n`
  );

  setupTestConfig('nested-post-config-tpl', {
    description: 'Template with nested variable in post_config',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'prefix', prompt: 'Prefix:' },
      { name: 'project', prompt: 'Project:' }
    ],
    post_config: [
      {
        command: 'echo "{{ prefix }}" > nested_result.txt',
        description: 'Task for {{ prefix }}'
      }
    ]
  });

  await init('nested-post-config-tpl', projectDest, {
    yes: true
  });

  const shContent = fs.readFileSync(path.join(projectDest, 'post_config.sh'), 'utf-8');
  assert.ok(shContent.includes('echo "rst_deep_nested" > nested_result.txt'));
  assert.ok(shContent.includes('echo "Running: Task for rst_deep_nested"'));

  const nestedResult = fs.readFileSync(path.join(projectDest, 'nested_result.txt'), 'utf-8');
  assert.strictEqual(nestedResult.trim(), 'rst_deep_nested');

  cleanup(projectDest, templateRoot, parentDir, testHome);
});

test('post_config variable substitution: multi-template deduplication with variables', async () => {
  const projectDest = path.join(process.cwd(), 'test-post-config-multi-project');
  const templateRoot1 = path.join(process.cwd(), 'test-post-config-multi-root1');
  const templateRoot2 = path.join(process.cwd(), 'test-post-config-multi-root2');
  cleanup(projectDest, templateRoot1, templateRoot2, testHome);

  fs.mkdirSync(templateRoot1, { recursive: true });
  fs.mkdirSync(templateRoot2, { recursive: true });

  const config: PtConfig = {
    version: '3.0',
    templates: {
      tplA: {
        description: 'Template A',
        templateRoot: templateRoot1,
        folders: [],
        variables: [{ name: 'COMMON_DIR', prompt: 'Common dir:', default: 'shared' }],
        post_config: [
          {
            command: 'echo "{{ COMMON_DIR }}" >> common.txt',
            description: 'Common task'
          }
        ]
      },
      tplB: {
        description: 'Template B',
        templateRoot: templateRoot2,
        folders: [],
        variables: [{ name: 'COMMON_DIR', prompt: 'Common dir:', default: 'shared' }],
        post_config: [
          {
            command: 'echo "{{ COMMON_DIR }}" >> common.txt',
            description: 'Common task'
          }
        ]
      }
    }
  };
  saveConfig(config);

  await init(['tplA', 'tplB', projectDest], {
    yes: true,
    vars: 'COMMON_DIR=my_shared_dir'
  });

  const shContent = fs.readFileSync(path.join(projectDest, 'post_config.sh'), 'utf-8');
  // Should deduplicate identical substituted tasks
  const occurrences = (shContent.match(/echo "my_shared_dir" >> common.txt/g) || []).length;
  assert.strictEqual(occurrences, 1, 'Duplicate task after variable substitution should be deduplicated to 1');

  cleanup(projectDest, templateRoot1, templateRoot2, testHome);
});

test('postconfig.ts: runPostConfig applies variable substitution', async () => {
  const projectDest = path.join(process.cwd(), 'test-postconfig-fn-project');
  cleanup(projectDest, testHome);
  fs.mkdirSync(projectDest, { recursive: true });

  const tasks = [
    {
      command: 'echo "{{ APP_ENV }}" > app.txt',
      description: 'Configure {{ APP_ENV }}'
    }
  ];

  await runPostConfig(
    projectDest,
    tasks,
    'my-app',
    { yes: true },
    { APP_ENV: 'staging' }
  );

  const appTxt = fs.readFileSync(path.join(projectDest, 'app.txt'), 'utf-8');
  assert.strictEqual(appTxt.trim(), 'staging');

  cleanup(projectDest, testHome);
});

test('post_config variable substitution: supports hyphenated variable names', async () => {
  const projectDest = path.join(process.cwd(), 'test-post-config-hyphen-project');
  const templateRoot = path.join(process.cwd(), 'test-post-config-hyphen-root');
  cleanup(projectDest, templateRoot, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });

  setupTestConfig('hyphen-var-tpl', {
    description: 'Hyphen var template',
    templateRoot: templateRoot,
    folders: [],
    variables: [{ name: 'memory-name', prompt: 'Memory Name:' }],
    post_config: [
      {
        command: 'echo "{{ memory-name }}" > hyphen_out.txt',
        description: 'Create {{ memory-name }}'
      }
    ]
  });

  await init('hyphen-var-tpl', projectDest, {
    yes: true,
    vars: 'memory-name=my-hyphen-mem'
  });

  const shContent = fs.readFileSync(path.join(projectDest, 'post_config.sh'), 'utf-8');
  assert.ok(shContent.includes('echo "my-hyphen-mem" > hyphen_out.txt'));

  const out = fs.readFileSync(path.join(projectDest, 'hyphen_out.txt'), 'utf-8');
  assert.strictEqual(out.trim(), 'my-hyphen-mem');

  cleanup(projectDest, templateRoot, testHome);
});

test('post_config variable substitution: --vars works even when template has no variables field', async () => {
  const projectDest = path.join(process.cwd(), 'test-post-config-novars-project');
  const templateRoot = path.join(process.cwd(), 'test-post-config-novars-root');
  cleanup(projectDest, templateRoot, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });

  setupTestConfig('novars-tpl', {
    description: 'No variables field template',
    templateRoot: templateRoot,
    folders: [],
    post_config: [
      {
        command: 'echo "hello {{ USER_VAR }}" > novars_out.txt',
        description: 'Run {{ USER_VAR }}'
      }
    ]
  });

  await init('novars-tpl', projectDest, {
    yes: true,
    vars: 'USER_VAR=world'
  });

  const shContent = fs.readFileSync(path.join(projectDest, 'post_config.sh'), 'utf-8');
  assert.ok(shContent.includes('echo "hello world" > novars_out.txt'));

  const out = fs.readFileSync(path.join(projectDest, 'novars_out.txt'), 'utf-8');
  assert.strictEqual(out.trim(), 'hello world');

  cleanup(projectDest, templateRoot, testHome);
});

