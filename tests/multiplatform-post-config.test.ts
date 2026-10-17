import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force an isolated home directory for testing
const testHome = path.join(process.cwd(), '.test-home-multiplatform');
process.env.HOME = testHome;

import { init } from '../src/commands/initCommand.js';
import { saveConfig, PtConfig } from '../src/config.js';

function cleanup(...paths: string[]) {
  for (const p of paths) {
    if (fs.existsSync(p)) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {}
    }
  }
}

test('multi-platform: untagged Linux template on Windows does not fail and creates folders', async () => {
  const projectDest = path.join(process.cwd(), 'test-mp-linux-on-win-dest');
  const templateRoot = path.join(process.cwd(), 'test-mp-linux-on-win-root');
  cleanup(projectDest, templateRoot, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });

  const config: PtConfig = {
    version: '3.0',
    templates: {
      'linux-style-template': {
        description: 'Template created on Linux with bash commands',
        templateRoot: templateRoot,
        folders: [
          { name: 'src', info: 'source folder' },
          { name: 'docs', info: 'documentation' }
        ],
        post_config: [
          {
            command: 'chmod +x build.sh',
            description: 'Make build script executable'
          },
          {
            command: 'export APP_ENV=production',
            description: 'Set environment variable'
          }
        ]
      }
    }
  };
  saveConfig(config);

  // Initialize on Windows (without --strict-post-config)
  await init('linux-style-template', projectDest, {
    yes: true,
    platform: 'windows',
    shell: 'powershell'
  });

  // Verify scaffolding was completely and successfully created
  assert.ok(fs.existsSync(projectDest), 'Project directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src')), 'src directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'docs')), 'docs directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, '.info.md')), '.info.md should exist');

  cleanup(projectDest, templateRoot, testHome);
});

test('multi-platform: mixed template executes powershell command on Windows and skips bash command', async () => {
  const projectDest = path.join(process.cwd(), 'test-mp-mixed-dest');
  const templateRoot = path.join(process.cwd(), 'test-mp-mixed-root');
  cleanup(projectDest, templateRoot, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });

  const config: PtConfig = {
    version: '3.0',
    templates: {
      'mixed-template': {
        description: 'Template with both Windows PowerShell and Linux Bash tasks',
        templateRoot: templateRoot,
        folders: [{ name: 'app', info: '' }],
        post_config: [
          {
            command: 'Set-Content -Path win_success.txt -Value "ran_powershell"',
            description: 'Create win flag file',
            platform: 'windows',
            shell: 'powershell'
          },
          {
            command: 'echo "ran_bash" > linux_success.txt',
            description: 'Create linux flag file',
            platform: 'posix',
            shell: 'bash'
          }
        ]
      }
    }
  };
  saveConfig(config);

  await init('mixed-template', projectDest, {
    yes: true,
    platform: 'windows',
    shell: 'powershell'
  });

  // Verify Windows PowerShell command ran and generated win_success.txt
  assert.ok(fs.existsSync(path.join(projectDest, 'win_success.txt')), 'win_success.txt should exist on Windows');
  const winContent = fs.readFileSync(path.join(projectDest, 'win_success.txt'), 'utf-8');
  assert.strictEqual(winContent.trim(), 'ran_powershell');

  // Verify Linux Bash command was skipped
  assert.ok(!fs.existsSync(path.join(projectDest, 'linux_success.txt')), 'linux_success.txt should not exist');

  cleanup(projectDest, templateRoot, testHome);
});

test('multi-platform: polymorphic command map selects correct branch based on target platform', async () => {
  const projectDest = path.join(process.cwd(), 'test-mp-poly-dest');
  const templateRoot = path.join(process.cwd(), 'test-mp-poly-root');
  cleanup(projectDest, templateRoot, testHome);

  fs.mkdirSync(templateRoot, { recursive: true });

  const config: PtConfig = {
    version: '3.0',
    templates: {
      'poly-template': {
        description: 'Template with polymorphic command',
        templateRoot: templateRoot,
        folders: [{ name: 'workspace', info: '' }],
        post_config: [
          {
            command: {
              powershell: 'Set-Content -Path poly_out.txt -Value "powershell_branch"',
              bash: 'echo "bash_branch" > poly_out.txt'
            },
            description: 'Run polymorphic command'
          }
        ]
      }
    }
  };
  saveConfig(config);

  await init('poly-template', projectDest, {
    yes: true,
    platform: 'windows',
    shell: 'powershell'
  });

  assert.ok(fs.existsSync(path.join(projectDest, 'poly_out.txt')), 'poly_out.txt should exist');
  const out = fs.readFileSync(path.join(projectDest, 'poly_out.txt'), 'utf-8');
  assert.strictEqual(out.trim(), 'powershell_branch');

  cleanup(projectDest, templateRoot, testHome);
});
