/**
 * Apryse WebViewer needs its runtime files (workers, WASM, UI) served as
 * static files. This copies them from node_modules into public/lib/webviewer.
 * Runs automatically after "npm install".
 */
import fs from 'node:fs';
import path from 'node:path';

const source = path.resolve('node_modules/@pdftron/webviewer/public');
const target = path.resolve('public/lib/webviewer');

if (!fs.existsSync(source)) {
  console.log('[copy-webviewer] @pdftron/webviewer not installed yet, skipping.');
  process.exit(0);
}

fs.rmSync(target, { recursive: true, force: true });
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true });
console.log('[copy-webviewer] WebViewer files copied to public/lib/webviewer');
