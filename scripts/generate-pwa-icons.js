import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ICON_TARGETS = [
  { file: 'icon-192.png', size: 192, maskable: false, purpose: 'any' },
  { file: 'icon-512.png', size: 512, maskable: false, purpose: 'any' },
  { file: 'icon-512-maskable.png', size: 512, maskable: true, purpose: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, maskable: false, purpose: 'apple-touch-icon' },
  { file: 'favicon-32.png', size: 32, maskable: false, purpose: 'favicon' }
];

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);

  const crcTarget = chunk.subarray(4, 8 + len);
  const crc = crc32(crcTarget);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

function roundedBoxDist(px, py, halfW, halfH, r) {
  const dx = Math.max(Math.abs(px) - (halfW - r), 0);
  const dy = Math.max(Math.abs(py) - (halfH - r), 0);
  return Math.sqrt(dx * dx + dy * dy) - r;
}

function pointInPlayTriangle(nx, ny) {
  // Centered play triangle inside film badge: vertices (-0.16, -0.22), (-0.16, 0.22), (0.24, 0.0)
  if (nx < -0.16 || nx > 0.24) return false;
  const progress = (nx - (-0.16)) / (0.24 - (-0.16)); // 0 at left edge, 1 at right tip
  const maxAbsY = 0.22 * (1 - progress);
  return Math.abs(ny) <= maxAbsY;
}

/**
 * Generates a crisp BingeLog PNG icon:
 * Deep #0d0d0f obsidian canvas with a #0a84ff rounded squircle badge and white play/film glyph.
 */
export function createPng(size, isMaskable = false) {
  const width = size;
  const height = size;

  const rawData = Buffer.alloc((width * 4 + 1) * height);
  const outerRadius = isMaskable ? 0 : size * 0.225;
  const cx = size / 2;
  const cy = size / 2;

  // Safe zone for maskable icons is 80% (0.1 to 0.9)
  const scale = isMaskable ? 0.72 : 0.86;

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - cx;
      const py = y + 0.5 - cy;

      let inOuter = true;
      if (!isMaskable) {
        const dOuter = roundedBoxDist(px, py, cx, cy, outerRadius);
        inOuter = dOuter <= 0;
      }

      if (!inOuter) {
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        rawData[offset++] = 0;
        continue;
      }

      // Deep #0d0d0f obsidian base background with subtle radial vignette
      const grad = (x + y) / (width + height);
      let r = Math.round(13 + grad * 6);
      let g = Math.round(13 + grad * 7);
      let b = Math.round(15 + grad * 12);

      // Normalized coordinates (-1 to 1) scaled for badge safe zone
      const nx = px / (cx * scale);
      const ny = py / (cy * scale);

      // Inner #0a84ff rounded squircle badge
      const dBadge = roundedBoxDist(nx, ny, 0.82, 0.82, 0.34);
      if (dBadge <= 0) {
        // Vibrant #0a84ff brand blue with subtle top-left glassmorphic highlight
        const badgeGrad = Math.max(0, Math.min(1, (nx + ny + 1.6) / 3.2));
        r = Math.round(16 - badgeGrad * 10);
        g = Math.round(148 - badgeGrad * 28);
        b = Math.round(255 - badgeGrad * 12);

        // Subtle inner border glow
        if (dBadge > -0.035) {
          r = Math.min(255, r + 28);
          g = Math.min(255, g + 35);
          b = 255;
        }

        // White film frame & play glyph inside badge
        const inFilmOuter = roundedBoxDist(nx, ny, 0.52, 0.44, 0.10) <= 0;
        const inFilmInner = roundedBoxDist(nx, ny, 0.32, 0.34, 0.05) <= 0;

        // Sprocket holes along left and right film strip rails
        const inSprocketX = Math.abs(nx) >= 0.36 && Math.abs(nx) <= 0.46;
        const sprocketYCenters = [-0.24, 0.0, 0.24];
        const inSprocketHole =
          inSprocketX &&
          sprocketYCenters.some(sy => Math.abs(ny - sy) <= 0.065);

        const inPlay = pointInPlayTriangle(nx, ny);

        if ((inFilmOuter && !inFilmInner && !inSprocketHole) || inPlay) {
          const glyphShade = Math.round(248 + (1 - ny) * 7);
          r = Math.min(255, glyphShade);
          g = Math.min(255, glyphShade);
          b = 255;
        }
      }

      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = 255;
    }
  }

  const deflated = zlib.deflateSync(rawData);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

export function generatePwaIcons(rootDir = path.resolve(__dirname, '..')) {
  const publicIconsDir = path.join(rootDir, 'public', 'icons');
  fs.mkdirSync(publicIconsDir, { recursive: true });

  const distDir = path.join(rootDir, 'dist');
  const distIconsDir = path.join(distDir, 'icons');
  const shouldCopyDist = fs.existsSync(distDir);
  if (shouldCopyDist) {
    fs.mkdirSync(distIconsDir, { recursive: true });
  }

  const generated = [];
  for (const target of ICON_TARGETS) {
    const buf = createPng(target.size, target.maskable);
    const publicDest = path.join(publicIconsDir, target.file);
    fs.writeFileSync(publicDest, buf);
    if (shouldCopyDist) {
      fs.writeFileSync(path.join(distIconsDir, target.file), buf);
    }
    generated.push({
      ...target,
      path: publicDest,
      bytes: buf.length
    });
    console.log(`[PWA Icons] Generated public/icons/${target.file} (${target.size}x${target.size}, ${buf.length} bytes)`);
  }

  return generated;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMain) {
  generatePwaIcons();
}
