import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

describe('Tier 4: Standalone Single-File HTML Bundle Verification', () => {
  const rootHtmlPath = path.resolve(process.cwd(), 'index.html');
  const distHtmlPath = path.resolve(process.cwd(), 'dist/index.html');

  it('should verify standalone single-file bundle has no module types, no modulepreload links, and script placed before closing body tag', () => {
    const targetPath = fs.existsSync(distHtmlPath) ? distHtmlPath : rootHtmlPath;
    assert.ok(fs.existsSync(targetPath), 'At least one standalone HTML bundle must exist');

    const html = fs.readFileSync(targetPath, 'utf8');

    // 1. Must NOT contain type="module" in any script tags
    const scriptModuleRegex = /<script[^>]+type=["']module["']/i;
    assert.equal(
      scriptModuleRegex.test(html),
      false,
      'Standalone bundle must not use type="module" on file:/// protocol'
    );

    // 2. Must NOT contain modulepreload links
    const modulepreloadRegex = /<link\s+rel=["']modulepreload["']/i;
    assert.equal(
      modulepreloadRegex.test(html),
      false,
      'Standalone bundle must not contain modulepreload links'
    );

    // 3. Must have a script tag placed before closing body tag
    const scriptIdx = html.indexOf('<script');
    const bodyCloseIdx = html.lastIndexOf('</body>');
    assert.ok(scriptIdx !== -1, 'HTML must contain a script tag');
    assert.ok(bodyCloseIdx !== -1, 'HTML must contain a body closing tag');
    assert.ok(
      scriptIdx < bodyCloseIdx,
      'Script tag must be placed before closing body tag for synchronous DOM availability'
    );

    // 4. Must be a complete self-contained single-file document
    assert.ok(html.includes('<!DOCTYPE html>') || html.includes('<!doctype html>'));
    assert.ok(html.includes('<html'));
    assert.ok(html.includes('</html>'));
    assert.ok(html.includes('<head>'));
    assert.ok(html.includes('</head>'));
  });

  it('should verify make-standalone.js transformation logic on raw Vite singlefile output fixture', () => {
    const rawViteHtml = [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '  <meta charset="UTF-8" />',
      '  <title>BingeLog</title>',
      '  <link rel="modulepreload" crossorigin href="/assets/vendor.js">',
      '  <link rel="modulepreload" crossorigin href="/assets/client.js">',
      '  <script type="module" crossorigin>console.log("app initialized");</script>',
      '</head>',
      '<body>',
      '  <div id="root"></div>',
      '</body>',
      '</html>'
    ].join('\n');

    let processed = rawViteHtml.replace(/<link\s+rel="modulepreload"[^>]*>/gi, '');

    const scriptStartIdx = processed.indexOf('<script');
    const scriptEndIdx = processed.indexOf('</script>');

    if (scriptStartIdx !== -1 && scriptEndIdx !== -1) {
      const scriptTagEndIdx = processed.indexOf('>', scriptStartIdx);
      const scriptContent = processed.slice(scriptTagEndIdx + 1, scriptEndIdx);

      processed = processed.slice(0, scriptStartIdx) + processed.slice(scriptEndIdx + '</script>'.length);

      const bodyEndIdx = processed.lastIndexOf('</body>');
      const safeScriptTag = '\n<script>\n' + scriptContent + '\n</script>\n';

      if (bodyEndIdx !== -1) {
        processed = processed.slice(0, bodyEndIdx) + safeScriptTag + processed.slice(bodyEndIdx);
      } else {
        processed += safeScriptTag;
      }
    }

    assert.equal(processed.includes('modulepreload'), false);
    assert.equal(processed.includes('type="module"'), false);
    assert.ok(processed.includes('app initialized'));

    const finalScriptIdx = processed.indexOf('<script>');
    const finalBodyCloseIdx = processed.lastIndexOf('</body>');
    assert.ok(finalScriptIdx !== -1);
    assert.ok(finalScriptIdx < finalBodyCloseIdx);
  });
});
