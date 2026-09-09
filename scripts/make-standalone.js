import fs from 'node:fs';
import path from 'node:path';

const distPath = path.resolve(process.cwd(), 'dist/index.html');
const rootHtmlPath = path.resolve(process.cwd(), 'BingeLog.html');

if (!fs.existsSync(distPath)) {
  console.error('dist/index.html does not exist. Run npm run build first.');
  process.exit(1);
}

let html = fs.readFileSync(distPath, 'utf8');

// Replace module script tag with standard classic defer script so file:/// works in any browser
html = html.replace(/<script\s+type="module"\s+crossorigin>/i, '<script defer>');
// Also clean up any modulepreload links if present
html = html.replace(/<link\s+rel="modulepreload"[^>]*>/gi, '');

// Update dist/index.html and write root BingeLog.html
fs.writeFileSync(distPath, html, 'utf8');
fs.writeFileSync(rootHtmlPath, html, 'utf8');

console.log('Successfully created standalone offline BingeLog.html and updated dist/index.html!');
