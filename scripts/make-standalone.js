import fs from 'node:fs';
import path from 'node:path';

const distPath = path.resolve(process.cwd(), 'dist/index.html');
const rootIndexHtml = path.resolve(process.cwd(), 'index.html');
const devIndexHtml = path.resolve(process.cwd(), 'index.dev.html');

// 1. Keep a backup of dev index.html if not already backed up
if (fs.existsSync(rootIndexHtml) && !fs.existsSync(devIndexHtml)) {
  const currentRoot = fs.readFileSync(rootIndexHtml, 'utf8');
  if (currentRoot.includes('/src/main.jsx')) {
    fs.writeFileSync(devIndexHtml, currentRoot, 'utf8');
  }
}

if (!fs.existsSync(distPath)) {
  console.error('dist/index.html does not exist. Run npm run build first.');
  process.exit(1);
}

let html = fs.readFileSync(distPath, 'utf8');

// Clean up any modulepreload links
html = html.replace(/<link\s+rel="modulepreload"[^>]*>/gi, '');

// Extract the script tag and its content
const scriptMatch = html.match(/<script[\s\S]*?<\/script>/i);

if (scriptMatch) {
  const originalScript = scriptMatch[0];
  // Remove type="module" and crossorigin so file:/// protocol doesn't trigger CORS error
  let cleanScript = originalScript
    .replace(/<script\s+type="module"\s+crossorigin>/i, '<script>')
    .replace(/<script\s+defer>/i, '<script>');

  // Remove the script from <head>
  html = html.replace(originalScript, '');

  // Place the script right before </body> so <div id="root"> exists when React mounts!
  if (html.includes('</body>')) {
    html = html.replace('</body>', `${cleanScript}\n</body>`);
  } else {
    html += `\n${cleanScript}`;
  }
}

// Write to both dist/index.html and the root index.html!
fs.writeFileSync(distPath, html, 'utf8');
fs.writeFileSync(rootIndexHtml, html, 'utf8');

console.log('Successfully updated index.html with self-contained, offline-ready bundle!');
