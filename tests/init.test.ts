import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';
import path from 'path';

// Force a temporary home directory for testing before importing anything from the CLI
const testHome = path.join(process.cwd(), '.test-home-init');
process.env.HOME = testHome;

import { init } from '../src/commands/initCommand.js';

test('direct JSON template initialization via --file', async () => {
  const jsonFilePath = path.join(process.cwd(), 'test-direct-template.json');
  const projectDest = path.join(process.cwd(), 'test-scaffolded-project');

  // Ensure clean state
  if (fs.existsSync(jsonFilePath)) {
    fs.unlinkSync(jsonFilePath);
  }
  if (fs.existsSync(projectDest)) {
    fs.rmSync(projectDest, { recursive: true, force: true });
  }

  // Create a mock template JSON configuration
  const mockTemplate = {
    name: 'direct-json-test',
    description: 'A mock template for direct JSON scaffolding test',
    folders: [
      {
        name: 'src',
        info: 'contains sources',
        children: [
          { name: 'components', info: 'reusable components' },
          { name: 'utils', info: 'utility functions' }
        ]
      },
      {
        name: 'docs',
        info: 'documentation folder'
      }
    ]
  };

  fs.writeFileSync(jsonFilePath, JSON.stringify(mockTemplate, null, 2));

  // Run the init command with the --file option
  // targetName (1st arg) is omitted/undefined, destPath (2nd arg) is our projectDest, file option is provided
  await init(undefined, projectDest, {
    file: jsonFilePath,
    yes: true,
    skipPostConfig: true
  });

  // Verify structure was created successfully
  assert.ok(fs.existsSync(projectDest), 'Project destination folder should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src')), 'src directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src/components')), 'src/components directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'src/utils')), 'src/utils directory should exist');
  assert.ok(fs.existsSync(path.join(projectDest, 'docs')), 'docs directory should exist');

  // Verify metadata file .info.md was created
  assert.ok(fs.existsSync(path.join(projectDest, '.info.md')), '.info.md file should exist');
  const infoContent = fs.readFileSync(path.join(projectDest, '.info.md'), 'utf-8');
  assert.ok(infoContent.includes('direct-json-test'), 'Should contain template name');
  assert.ok(infoContent.includes('mock template'), 'Should contain description');

  // Clean up
  if (fs.existsSync(jsonFilePath)) {
    fs.unlinkSync(jsonFilePath);
  }
  if (fs.existsSync(projectDest)) {
    fs.rmSync(projectDest, { recursive: true, force: true });
  }
  if (fs.existsSync(testHome)) {
    fs.rmSync(testHome, { recursive: true, force: true });
  }
});
