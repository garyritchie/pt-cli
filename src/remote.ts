// src/remote.ts (New File)
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { extract } from 'tar'; // You'll need: npm install tar
import chalk from 'chalk';
import { isTrustedSource, logSecurityEvent, getSecurityPolicy } from './safety.js';
import { loadConfig } from './config.js';

export async function downloadAndExtract(url: string): Promise<string> {
    // Load security policy
    const configPath = path.join(process.env.HOME || os.homedir(), '.pt', 'config.yaml');
    const config = loadConfig();
    const securityPolicy = config.security || {
        trustedSources: ['github.com/garyritchie', 'gitea.lyonritchie.com/garyritchie', 'github.com/lyonritchie'],
    };

    // SECURITY CHECK: Verify source is trusted
    if (!isTrustedSource(url, securityPolicy.trustedSources)) {
        console.log(chalk.yellow(`⚠️  Warning: Template from untrusted source: ${url}`));
        console.log(chalk.yellow('   Only use templates from trusted sources'));
        
        const inquirer = (await import('inquirer')).default;
        const response = await inquirer.prompt({
            type: 'confirm',
            name: 'proceed',
            message: chalk.red('Continue anyway?'),
            default: false
        });
        
        if (!response.proceed) {
            throw new Error('Download cancelled by user due to untrusted source');
        }
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-template-'));
    let downloadUrl = url;

    // Strip trailing slash and .git suffix before converting to archive URL
    let cleanUrl = url.replace(/\/$/, '').replace(/\.git$/, '');
    
    // Convert GitHub/Gitea URLs to Zip/Tarball endpoints
    if (url.includes('github.com')) {
        downloadUrl = cleanUrl + '/archive/refs/heads/main.tar.gz';
    } else if (url.includes('gitea')) {
        downloadUrl = cleanUrl + '/archive/main.tar.gz';
    }

    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Failed to fetch ${downloadUrl}: ${response.statusText}`);

    const dest = path.join(tempDir, 'template.tar.gz');
    const fileStream = fs.createWriteStream(dest);
    await finished(Readable.fromWeb(response.body as any).pipe(fileStream));

    // SECURITY: Validate downloaded file before extraction
    const stats = fs.statSync(dest);
    if (stats.size > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('Downloaded template is too large (>50MB)');
    }

    // Extract tarball
    await extract({ file: dest, cwd: tempDir });
    
    // Find the actual content folder (archives usually wrap content in a folder)
    const dirs = fs.readdirSync(tempDir).filter(f => fs.statSync(path.join(tempDir, f)).isDirectory());
    const extractedPath = path.join(tempDir, dirs[0]);
    
    // SECURITY: Log successful download
    logSecurityEvent('template_loaded', downloadUrl, 'remote', 'success');
    
    return extractedPath;
}