import fs from 'node:fs';
import path from 'node:path';

const rootIndexHtml = path.resolve(process.cwd(), 'index.html');
const devIndexHtml = path.resolve(process.cwd(), 'index.dev.html');

// 1. Keep a backup of dev index.html if not already backed up
if (fs.existsSync(rootIndexHtml) && !fs.existsSync(devIndexHtml)) {
  const currentRoot = fs.readFileSync(rootIndexHtml, 'utf8');
  if (currentRoot.includes('/src/main.tsx') || currentRoot.includes('/src/main.jsx')) {
    fs.writeFileSync(devIndexHtml, currentRoot, 'utf8');
  }
}

const distIndexHtml = path.resolve(process.cwd(), 'dist/index.html');
const distDevIndexHtml = path.resolve(process.cwd(), 'dist/index.dev.html');

let distPath = distIndexHtml;
if (!fs.existsSync(distPath) && fs.existsSync(distDevIndexHtml)) {
  distPath = distDevIndexHtml;
}

if (!fs.existsSync(distPath)) {
  console.error('Neither dist/index.html nor dist/index.dev.html exists.');
  process.exit(1);
}

let html = fs.readFileSync(distPath, 'utf8');

// Clean up any modulepreload links
html = html.replace(/<link\s+rel="modulepreload"[^>]*>/gi, '');

// Find <script...> and </script> using index positions to avoid regex string-replace $ hazards
const scriptStartIdx = html.indexOf('<script');
const scriptEndIdx = html.indexOf('</script>');

if (scriptStartIdx !== -1 && scriptEndIdx !== -1) {
  const scriptTagEndIdx = html.indexOf('>', scriptStartIdx);
  const scriptContent = html.slice(scriptTagEndIdx + 1, scriptEndIdx);

  // Remove the script from its original location
  html = html.slice(0, scriptStartIdx) + html.slice(scriptEndIdx + '</script>'.length);

  // Find </body>
  const bodyEndIdx = html.lastIndexOf('</body>');
  const safeScriptTag = `\n<script>\n${scriptContent}\n</script>\n`;

  if (bodyEndIdx !== -1) {
    html = html.slice(0, bodyEndIdx) + safeScriptTag + html.slice(bodyEndIdx);
  } else {
    html += safeScriptTag;
  }
}

// Ensure dist directory exists
const distDir = path.resolve(process.cwd(), 'dist');
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Write to dist/index.html, dist/index.dev.html, and the root index.html
fs.writeFileSync(distIndexHtml, html, 'utf8');
fs.writeFileSync(distDevIndexHtml, html, 'utf8');
fs.writeFileSync(rootIndexHtml, html, 'utf8');

console.log('Successfully updated index.html safely with string slicing!');

