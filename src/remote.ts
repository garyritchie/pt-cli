// src/remote.ts (New File)
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { extract } from 'tar'; // You'll need: npm install tar
import chalk from 'chalk';
import { isTrustedSource, logSecurityEvent, getSecurityPolicy } from './safety.js';
import { loadConfig, getConfigPath } from './config.js';

export async function downloadAndExtract(url: string, isJsonMode: boolean = false, allowUntrusted: boolean = false): Promise<string> {
    // Load security policy
    const configPath = getConfigPath();
    const config = loadConfig();
    const securityPolicy = config.security || {
        trustedSources: ['github.com/garyritchie', 'gitea.lyonritchie.com/garyritchie', 'github.com/lyonritchie', 'pt-gallery.lyonritchie.com'],
    };

    // SECURITY CHECK: Verify source is trusted (skipped when --allow-untrusted is passed)
    if (!allowUntrusted && !isTrustedSource(url, securityPolicy.trustedSources)) {
        if (isJsonMode) {
            // In JSON mode, output warning as JSON for GUI consumption.
            // The GUI will show a confirmation dialog and, if the user says YES,
            // re-run `pt learn <url> --json --yes --allow-untrusted`.
            console.log(JSON.stringify({
                type: 'security_warning',
                url: url,
                message: `Template from untrusted source: ${url}`,
                warning: 'Only use templates from trusted sources.',
                prompt: 'Continue anyway?',
                default: false
            }));
            process.exit(1);
        } else {
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
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt-template-'));
    let downloadUrl = url;

    // Strip trailing slash and .git suffix before converting to archive URL
    let cleanUrl = url.replace(/\/$/, '').replace(/\.git$/, '');

    // Direct template-JSON links (e.g. gallery catalog bodies): fetch the
    // body and stage it as .pt-template.json so the normal learn flow
    // auto-detects name, description, folders and friends from it.
    if (cleanUrl.endsWith('.pt-template.json') || cleanUrl.endsWith('.json')) {
        const jsonResponse = await fetch(url);
        if (!jsonResponse.ok) throw new Error(`Failed to fetch ${url}: ${jsonResponse.statusText}`);
        const text = await jsonResponse.text();
        if (text.length > 10 * 1024 * 1024) {
            throw new Error('Downloaded template JSON is too large (>10MB)');
        }
        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error(`URL looks like template JSON but did not parse: ${url}`);
        }
        if (!parsed || typeof parsed !== 'object' || !Array.isArray((parsed as any).folders)) {
            throw new Error(`Template JSON at ${url} has no folders array`);
        }
        fs.writeFileSync(path.join(tempDir, '.pt-template.json'), JSON.stringify(parsed, null, 2));
        logSecurityEvent('template_loaded', url, 'remote-json', 'success');
        return tempDir;
    }
        
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