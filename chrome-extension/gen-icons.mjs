// Generate Cerebro-branded square PNG icons for the Chrome extension.
// Zero dependencies — manual PNG encoding via Node's built-in zlib.
//
//   node gen-icons.mjs
//
// Outputs icons/icon-{16,32,48,128}.png

import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, 'icons');
mkdirSync(OUT_DIR, { recursive: true });

const BG = [23, 63, 53];      // --moss-green  #173F35
const FG = [224, 236, 137];   // --pistachio   #E0EC89

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const rowBytes = width * 3;
  const raw = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + rowBytes)] = 0;
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 3;
      const dst = y * (1 + rowBytes) + 1 + x * 3;
      raw[dst]     = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
    }
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Soft "C" mark (ring with a right-side gap)
function renderIcon(size) {
  const px = new Uint8Array(size * size * 3);
  const cx = size / 2;
  const cy = size / 2;
  const margin = Math.max(1, Math.round(size * 0.15));
  const rOuter = (size / 2) - margin;
  const rInner = rOuter * 0.62;
  const gapHalf = Math.PI * 0.18;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const r = Math.sqrt(dx * dx + dy * dy);
      const theta = Math.atan2(dy, dx);
      const inRing = r >= rInner && r <= rOuter && Math.abs(theta) > gapHalf;
      const i = (y * size + x) * 3;
      const c = inRing ? FG : BG;
      px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2];
    }
  }
  return encodePNG(size, size, px);
}

const SIZES = [16, 32, 48, 128];
for (const size of SIZES) {
  const buf = renderIcon(size);
  const path = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, buf);
  console.log(`wrote ${path}  (${buf.length} bytes)`);
}
console.log('\nDone.');
