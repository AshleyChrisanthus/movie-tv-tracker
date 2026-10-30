// Standalone, zero-dependency client-side QR Code Generator (SVG)
// ISO/IEC 18004 compliant QR Code Matrix & SVG renderer (ported from App-Directory/src/modules/sync/qr.ts)

export interface QRCodeOptions {
  padding?: number;
  size?: number;
  color?: string;
  background?: string;
}

// Galois field tables for GF(256) with primitive polynomial 0x11d
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF256_EXP[i] = x;
    GF256_LOG[x] = i;
    x <<= 1;
    if (x & 256) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) {
    GF256_EXP[i] = GF256_EXP[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return GF256_EXP[GF256_LOG[x] + GF256_LOG[y]];
}

function rsCompute(data: Uint8Array, ecCount: number): Uint8Array {
  let gen = new Uint8Array([1]);
  for (let i = 0; i < ecCount; i++) {
    const nextGen = new Uint8Array(gen.length + 1);
    for (let j = 0; j < gen.length; j++) {
      nextGen[j] ^= gfMul(gen[j], GF256_EXP[i]);
      nextGen[j + 1] ^= gen[j];
    }
    gen = nextGen;
  }

  const res = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const coef = data[i] ^ res[0];
    for (let j = 0; j < ecCount - 1; j++) {
      res[j] = res[j + 1] ^ gfMul(gen[j], coef);
    }
    res[ecCount - 1] = gfMul(gen[ecCount - 1], coef);
  }
  return res;
}

// Version table definitions (Version 1-14, EC level M)
// Version -> [size, totalDataBytes, ecBytesPerBlock, numBlocks]
const VERSION_SPECS: Record<number, [number, number, number, number]> = {
  1: [21, 16, 10, 1],
  2: [25, 28, 16, 1],
  3: [29, 44, 26, 1],
  4: [33, 64, 18, 2],
  5: [37, 86, 24, 2],
  6: [41, 108, 16, 4],
  7: [45, 124, 18, 4],
  8: [49, 154, 22, 4],
  9: [53, 182, 22, 5],
  10: [57, 216, 26, 5],
  11: [61, 252, 28, 5],
  12: [65, 282, 26, 8],
  13: [69, 331, 24, 9],
  14: [73, 365, 20, 13]
};

const ALIGNMENT_PATTERN_POS: Record<number, number[]> = {
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
  10: [6, 28, 50],
  11: [6, 30, 54],
  12: [6, 32, 58],
  13: [6, 34, 62],
  14: [6, 26, 46, 66]
};

export function generateQrMatrix(text: string): boolean[][] {
  const encoder = new TextEncoder();
  const rawBytes = encoder.encode(text);

  let chosenVersion = 1;
  while (chosenVersion <= 14) {
    const spec = VERSION_SPECS[chosenVersion];
    const maxDataBytes = spec[1];
    const countBits = chosenVersion <= 9 ? 8 : 16;
    const requiredBits = 4 + countBits + rawBytes.length * 8;
    if (requiredBits <= maxDataBytes * 8) {
      break;
    }
    chosenVersion++;
  }

  if (chosenVersion > 14) {
    throw new Error('QR payload exceeds supported version 14 capacity');
  }

  const [dim, totalDataBytes, ecBytesPerBlock, numBlocks] = VERSION_SPECS[chosenVersion];
  const countBits = chosenVersion <= 9 ? 8 : 16;

  // 1. Bitstream assembly
  const bits: number[] = [];
  function pushBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  pushBits(rawBytes.length, countBits);
  for (let i = 0; i < rawBytes.length; i++) {
    pushBits(rawBytes[i], 8);
  }

  // Terminator (up to 4 zeroes)
  const maxBits = totalDataBytes * 8;
  const termLen = Math.min(4, maxBits - bits.length);
  pushBits(0, termLen);

  // Pad to byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  // Pad bytes (0xEC, 0x11)
  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bits.length < maxBits) {
    pushBits(padBytes[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to byte array
  const dataBytes = new Uint8Array(totalDataBytes);
  for (let i = 0; i < totalDataBytes; i++) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i * 8 + b];
    }
    dataBytes[i] = byteVal;
  }

  // Interleave blocks and compute EC
  const dataBytesPerBlock = Math.floor(totalDataBytes / numBlocks);
  const blocksData: Uint8Array[] = [];
  const blocksEc: Uint8Array[] = [];

  let offset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const isLong = b >= numBlocks - (totalDataBytes % numBlocks);
    const bLen = dataBytesPerBlock + (isLong ? 1 : 0);
    const slice = dataBytes.slice(offset, offset + bLen);
    offset += bLen;
    blocksData.push(slice);
    blocksEc.push(rsCompute(slice, ecBytesPerBlock));
  }

  // Interleave data bytes
  const finalCodewords: number[] = [];
  const maxBDataLen = dataBytesPerBlock + (totalDataBytes % numBlocks ? 1 : 0);
  for (let i = 0; i < maxBDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < blocksData[b].length) {
        finalCodewords.push(blocksData[b][i]);
      }
    }
  }
  // Interleave EC bytes
  for (let i = 0; i < ecBytesPerBlock; i++) {
    for (let b = 0; b < numBlocks; b++) {
      finalCodewords.push(blocksEc[b][i]);
    }
  }

  // 2. Initialize matrix
  const matrix: (boolean | null)[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => null)
  );
  const isFunction: boolean[][] = Array.from({ length: dim }, () =>
    Array.from({ length: dim }, () => false)
  );

  function setModule(r: number, c: number, val: boolean) {
    matrix[r][c] = val;
    isFunction[r][c] = true;
  }

  // Finder patterns
  function placeFinder(top: number, left: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBorder = r === 0 || r === 6 || c === 0 || c === 6;
        const isCenter = r >= 2 && r <= 4 && c >= 2 && c <= 4;
        setModule(top + r, left + c, isBorder || isCenter);
      }
    }
    // Separators
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          const rr = top + r;
          const cc = left + c;
          if (rr >= 0 && rr < dim && cc >= 0 && cc < dim) {
            setModule(rr, cc, false);
          }
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, dim - 7);
  placeFinder(dim - 7, 0);

  // Timing patterns
  for (let i = 8; i < dim - 8; i++) {
    if (matrix[6][i] === null) setModule(6, i, i % 2 === 0);
    if (matrix[i][6] === null) setModule(i, 6, i % 2 === 0);
  }

  // Dark module
  setModule(4 * chosenVersion + 9, 8, true);

  // Alignment patterns
  if (chosenVersion >= 2) {
    const posList = ALIGNMENT_PATTERN_POS[chosenVersion];
    for (const r of posList) {
      for (const c of posList) {
        if (isFunction[r][c]) continue;
        for (let dr = -2; dr <= 2; dr++) {
          for (let dc = -2; dc <= 2; dc++) {
            const isBorder = Math.abs(dr) === 2 || Math.abs(dc) === 2;
            const isCenter = dr === 0 && dc === 0;
            setModule(r + dr, c + dc, isBorder || isCenter);
          }
        }
      }
    }
  }

  // Reserve format info area
  const markFunc = (r: number, c: number) => {
    isFunction[r][c] = true;
  };

  for (let i = 0; i < 9; i++) {
    markFunc(8, i);
    markFunc(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    markFunc(8, dim - 1 - i);
    markFunc(dim - 1 - i, 8);
  }

  // 3. Place data bits
  let bitIdx = 0;
  const totalBitLen = finalCodewords.length * 8;
  let upwards = true;

  for (let right = dim - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: dim }, (_, i) => dim - 1 - i)
      : Array.from({ length: dim }, (_, i) => i);

    for (const r of rows) {
      for (const col of [right, right - 1]) {
        if (!isFunction[r][col]) {
          let bit = false;
          if (bitIdx < totalBitLen) {
            const byte = finalCodewords[Math.floor(bitIdx / 8)];
            const bShift = 7 - (bitIdx % 8);
            bit = ((byte >> bShift) & 1) === 1;
            bitIdx++;
          }
          matrix[r][col] = bit;
        }
      }
    }
    upwards = !upwards;
  }

  // 4. Masking & Format Info (Mask pattern 0: (row + col) % 2 === 0, EC level M)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];

  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      if (!isFunction[r][c]) {
        const mask = (r + c) % 2 === 0;
        matrix[r][c] = matrix[r][c] !== mask;
      }
    }
  }

  // Write format info
  for (let i = 0; i < 6; i++) matrix[8][i] = formatBits[i] === 1;
  matrix[8][7] = formatBits[6] === 1;
  matrix[8][8] = formatBits[7] === 1;
  matrix[7][8] = formatBits[8] === 1;
  for (let i = 9; i < 15; i++) matrix[14 - i][8] = formatBits[i] === 1;

  for (let i = 0; i < 8; i++) matrix[dim - 1 - i][8] = formatBits[i] === 1;
  for (let i = 8; i < 15; i++) matrix[8][dim - 15 + i] = formatBits[i] === 1;

  return matrix.map((row) => row.map((cell) => cell === true));
}

/**
 * Render a QR Code as an SVG string.
 */
export function generateQrSvg(text: string, options: QRCodeOptions = {}): string {
  const matrix = generateQrMatrix(text);
  const dim = matrix.length;
  const padding = options.padding !== undefined ? options.padding : 3;
  const totalDim = dim + padding * 2;
  const color = options.color || '#ffffff';
  const bg = options.background || '#0f172a';

  let pathData = '';
  for (let r = 0; r < dim; r++) {
    for (let c = 0; c < dim; c++) {
      if (matrix[r][c]) {
        const x = c + padding;
        const y = r + padding;
        pathData += `M${x},${y}h1v1h-1z `;
      }
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="100%" height="100%" shape-rendering="crispEdges">
      <rect width="${totalDim}" height="${totalDim}" fill="${bg}" rx="6" />
      <path d="${pathData.trim()}" fill="${color}" />
    </svg>
  `.trim();
}
