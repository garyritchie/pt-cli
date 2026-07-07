import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-env');
process.env.HOME = testHome;

// Import the init command to test the env scanning functionality
import { init } from '../src/commands/initCommand.js';
import { loadConfig, saveConfig, PtConfig, getConfigPath } from '../src/config.js';

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

test('init scans parent directories for .env files and pre-fills variables', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-parent-env');
  const projectDest = path.join(parentEnvDir, 'test-env-project');
  const templateRoot = path.join(process.cwd(), 'test-env-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ project_name }}\n\nBy {{ author }}\n'
  );

  // Set up config with template that has variables and copy_files
  setupTestConfig('env-tpl', {
    description: 'Template with variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'project_name', prompt: 'Project name:', required: true },
      { name: 'author', prompt: 'Author:', default: 'Unknown' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file containing matching variables
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `project_name=EnvProject\nauthor=EnvAuthor\n`
  );

  // Run init from within the parent directory
  await init('env-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify .env variables were used
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  assert.ok(readme.includes('EnvProject'), 'README should contain project_name from .env');
  assert.ok(readme.includes('EnvAuthor'), 'README should contain author from .env');
  assert.ok(!readme.includes('{{ project_name }}'), 'README should NOT contain variable placeholder');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('init --vars overrides .env variables', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-parent-override');
  const projectDest = path.join(parentEnvDir, 'test-override-project');
  const templateRoot = path.join(process.cwd(), 'test-override-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'config.txt'),
    'name={{ project_name }}\n'
  );

  // Set up config with template that has variables and copy_files
  setupTestConfig('override-tpl', {
    description: 'Template with variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'project_name', prompt: 'Project name:', required: true }
    ],
    copy_files: [
      { src: 'config.txt', dest: 'config.txt', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `project_name=EnvProject\n`
  );

  // Run init with --vars to override .env value
  await init('override-tpl', projectDest, {
    yes: true,
    skipPostConfig: true,
    vars: 'project_name=CLIProject'
  });

  // Verify --vars value was used instead of .env value
  const configContent = fs.readFileSync(path.join(projectDest, 'config.txt'), 'utf-8');
  assert.ok(configContent.includes('CLIProject'), 'config.txt should contain --vars value');
  assert.ok(!configContent.includes('EnvProject'), 'config.txt should NOT contain .env value');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('init uses .env from immediate parent directory', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-immediate-parent');
  const projectDest = path.join(parentEnvDir, 'test-immediate-parent-project');
  const templateRoot = path.join(process.cwd(), 'test-immediate-parent-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ project_name }}\n'
  );

  // Set up config with template that has variables and copy_files
  setupTestConfig('immediate-parent-tpl', {
    description: 'Template with variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'project_name', prompt: 'Project name:', required: true }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create immediate parent directory with .env file
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `project_name=ImmediateParent\n`
  );

  // Run init from within the parent directory
  await init('immediate-parent-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify .env variable was used
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  assert.ok(readme.includes('ImmediateParent'), 'README should contain project_name from immediate parent .env');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('init scans multiple parent directories for .env files', async () => {
  const topEnvDir = path.join(process.cwd(), 'test-multi-parent');
  const midEnvDir = path.join(topEnvDir, 'test-mid-env');
  const projectDest = path.join(midEnvDir, 'test-multi-parent-project');
  const templateRoot = path.join(process.cwd(), 'test-multi-parent-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ project_name }}\n\nBy {{ author }}\n'
  );

  // Set up config with template that has variables and copy_files
  setupTestConfig('multi-parent-tpl', {
    description: 'Template with variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'project_name', prompt: 'Project name:', required: true },
      { name: 'author', prompt: 'Author:', default: 'Unknown' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create nested directory structure with .env files at different levels
  fs.mkdirSync(topEnvDir, { recursive: true });
  fs.mkdirSync(midEnvDir, { recursive: true });
  
  // .env file at the top level with project_name
  fs.writeFileSync(
    path.join(topEnvDir, '.env'),
    `project_name=TopLevel\n`
  );
  
  // .env file at the middle level with author
  fs.writeFileSync(
    path.join(midEnvDir, '.env'),
    `author=MidLevelAuthor\n`
  );

  // Run init from the deepest directory
  await init('multi-parent-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify .env variables from different levels were used
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  assert.ok(readme.includes('TopLevel'), 'README should contain project_name from top level .env');
  assert.ok(readme.includes('MidLevelAuthor'), 'README should contain author from middle level .env');

  cleanup(projectDest, templateRoot, topEnvDir, midEnvDir, testHome);
});

test('init uses .env values with quoted strings', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-quoted-parent');
  const projectDest = path.join(parentEnvDir, 'test-quoted-strings-project');
  const templateRoot = path.join(process.cwd(), 'test-quoted-strings-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ project_name }}\n\nBy {{ author }}\n'
  );

  // Set up config with template that has variables and copy_files
  setupTestConfig('quoted-strings-tpl', {
    description: 'Template with variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'project_name', prompt: 'Project name:', required: true },
      { name: 'author', prompt: 'Author:', default: 'Unknown' }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file containing quoted strings
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `project_name="My Quoted Project"\nauthor='Quoted Author'\n`
  );

  // Run init from within the parent directory
  await init('quoted-strings-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify quoted strings were parsed correctly
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  assert.ok(readme.includes('My Quoted Project'), 'README should contain project_name without quotes');
  assert.ok(readme.includes('Quoted Author'), 'README should contain author without quotes');
  assert.ok(!readme.includes('"My Quoted Project"'), 'README should NOT contain quotes around project_name');
  assert.ok(!readme.includes("'Quoted Author'"), 'README should NOT contain quotes around author');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});

test('init uses .env values with comments and empty lines', async () => {
  const parentEnvDir = path.join(process.cwd(), 'test-comments-parent');
  const projectDest = path.join(parentEnvDir, 'test-comments-project');
  const templateRoot = path.join(process.cwd(), 'test-comments-tpl-root');
  cleanup(projectDest, templateRoot, testHome);

  // Create template root with a file containing variables
  fs.mkdirSync(templateRoot, { recursive: true });
  fs.writeFileSync(
    path.join(templateRoot, 'README.md'),
    '# {{ project_name }}\n'
  );

  // Set up config with template that has variables and copy_files
  setupTestConfig('comments-tpl', {
    description: 'Template with variables',
    templateRoot: templateRoot,
    folders: [],
    variables: [
      { name: 'project_name', prompt: 'Project name:', required: true }
    ],
    copy_files: [
      { src: 'README.md', dest: 'README.md', substitute_variables: true }
    ]
  });

  // Create parent directory with .env file containing comments and empty lines
  fs.mkdirSync(parentEnvDir, { recursive: true });
  fs.writeFileSync(
    path.join(parentEnvDir, '.env'),
    `# This is a comment\n\nproject_name=CommentProject\n\n# Another comment\n`
  );

  // Run init from within the parent directory
  await init('comments-tpl', projectDest, {
    yes: true,
    skipPostConfig: true
  });

  // Verify .env variable was used (comments and empty lines should be ignored)
  const readme = fs.readFileSync(path.join(projectDest, 'README.md'), 'utf-8');
  assert.ok(readme.includes('CommentProject'), 'README should contain project_name from .env');

  cleanup(projectDest, templateRoot, parentEnvDir, testHome);
});