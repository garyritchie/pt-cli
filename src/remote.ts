// src/remote.ts (New File)
import fs from 'fs';
import path from 'path';
import os from 'os';
import { Readable } from 'stream';
import { finished } from 'stream/promises';
import { extract } from 'tar'; // You'll need: npm install tar

export async function downloadAndExtract(url: string): Promise<string> {
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

    // Extract tarball
    await extract({ file: dest, cwd: tempDir });
    
    // Find the actual content folder (archives usually wrap content in a folder)
    const dirs = fs.readdirSync(tempDir).filter(f => fs.statSync(path.join(tempDir, f)).isDirectory());
    return path.join(tempDir, dirs[0]); 
}