import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

async function publishHereNow() {
  const keyPath = path.join(os.homedir(), '.herenow', 'credentials');
  if (!fs.existsSync(keyPath)) {
    throw new Error(`here.now credentials not found at ${keyPath}`);
  }
  const apiKey = fs.readFileSync(keyPath, 'utf8').trim();

  const filePath = path.resolve('index.html');
  if (!fs.existsSync(filePath)) {
    throw new Error('index.html not found. Run npm run build first.');
  }

  const fileBuffer = fs.readFileSync(filePath);
  const size = fileBuffer.length;
  const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const stateDir = path.resolve('.herenow');
  const stateFile = path.join(stateDir, 'state.json');
  let state = { publishes: {} };
  if (fs.existsSync(stateFile)) {
    try { state = JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch {}
  }

  // Get primary slug if already exists
  const existingSlug = Object.keys(state.publishes || {})[0] || 'oaken-lasso-3vh8';
  const existingVersion = state.publishes?.[existingSlug]?.versionId;

  console.log(`[here.now] Publishing index.html (${size} bytes) to slug: ${existingSlug}...`);

  const url = existingSlug ? `https://here.now/api/v1/publish/${existingSlug}` : 'https://here.now/api/v1/publish';
  const method = existingSlug ? 'PUT' : 'POST';

  const bodyPayload = {
    files: [{
      path: 'index.html',
      size,
      contentType: 'text/html',
      hash
    }],
    viewer: {
      title: 'BingeLog — Movie & TV Tracker',
      description: 'BingeLog library tracker with compact view controls, book tracking, and multi-source metadata.'
    }
  };

  if (existingVersion) {
    bodyPayload.baseVersionId = existingVersion;
  }

  const createRes = await fetch(url, {
    method,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'x-herenow-client': 'antigravity/publish',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(bodyPayload)
  });

  if (!createRes.ok) {
    const errText = await createRes.text();
    throw new Error(`Create/Update failed (${createRes.status}): ${errText}`);
  }

  const createData = await createRes.json();
  const slug = createData.slug || existingSlug;
  const siteUrl = createData.siteUrl || `https://${slug}.here.now/`;

  const uploads = createData.upload?.uploads || [];
  for (const up of uploads) {
    const ct = up.headers?.['Content-Type'] || 'text/html';
    execSync(`curl.exe -sS -X PUT ${JSON.stringify(up.url)} -H ${JSON.stringify(`Content-Type: ${ct}`)} --data-binary @${JSON.stringify(filePath)}`, { stdio: 'inherit' });
  }

  const finRes = await fetch(createData.upload.finalizeUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'x-herenow-client': 'antigravity/publish',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      versionId: createData.upload.versionId
    })
  });

  if (!finRes.ok) {
    const finErr = await finRes.text();
    throw new Error(`Finalize failed (${finRes.status}): ${finErr}`);
  }

  const finData = await finRes.json();
  const finalUrl = finData.siteUrl || siteUrl;
  console.log(`[here.now] SUCCESS! Live URL: ${finalUrl}`);

  if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
  state.publishes = state.publishes || {};
  state.publishes[slug] = {
    versionId: finData.versionId || createData.upload.versionId,
    path: filePath,
    siteUrl: finalUrl,
    publishedAt: new Date().toISOString()
  };
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));

  return finalUrl;
}

publishHereNow().catch(err => {
  console.error(err);
  process.exit(1);
});
