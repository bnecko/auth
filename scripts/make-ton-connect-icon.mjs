// Regenerates public/ton-connect-icon.png, the app icon TON Connect wallets
// show while asking the user to approve a connection. Wallets want a square
// raster, so the SVG favicon cannot be reused.
//
// Writes the PNG by hand rather than through an image library: the mark is
// three straight strokes, and a build asset is not worth a dependency that
// ships native binaries. Run: node scripts/make-ton-connect-icon.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIZE = 180;
const SAMPLES = 4; // supersampling per axis, to get smooth edges
const BACKGROUND = [11, 18, 32]; // #0b1220, the brand's near-black
const MARK = [237, 242, 255];

// The bottleneck mark in its own 20x20 coordinate space, as line segments.
const STROKE_RADIUS = 1.1;
const SEGMENTS = [
  [3, 1, 3, 7],
  [3, 7, 8, 12],
  [8, 12, 8, 19],
  [17, 1, 17, 7],
  [17, 7, 12, 12],
  [12, 12, 12, 19],
  [8, 12, 12, 12],
];

function distanceToSegment(px, py, [x1, y1, x2, y2]) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.min(1, Math.max(0, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

// Fraction of the canvas left clear around the mark. Without it the strokes,
// which run the full height of their own coordinate space, sit flush against
// the edges and read as cropped once a wallet rounds the corners.
const PADDING = 0.14;

// Fraction of this pixel covered by the mark, sampled on a subgrid.
function coverage(x, y) {
  const inset = SIZE * PADDING;
  const scale = 20 / (SIZE - inset * 2);
  let hits = 0;
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const mx = (x + (sx + 0.5) / SAMPLES - inset) * scale;
      const my = (y + (sy + 0.5) / SAMPLES - inset) * scale;
      if (SEGMENTS.some(segment => distanceToSegment(mx, my, segment) <= STROKE_RADIUS)) hits++;
    }
  }
  return hits / (SAMPLES * SAMPLES);
}

// Raw RGB scanlines, each prefixed with filter type 0.
const raw = Buffer.alloc(SIZE * (SIZE * 3 + 1));
let offset = 0;
for (let y = 0; y < SIZE; y++) {
  raw[offset++] = 0;
  for (let x = 0; x < SIZE; x++) {
    const alpha = coverage(x, y);
    for (let channel = 0; channel < 3; channel++) {
      raw[offset++] = Math.round(BACKGROUND[channel] * (1 - alpha) + MARK[channel] * alpha);
    }
  }
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

const header = Buffer.alloc(13);
header.writeUInt32BE(SIZE, 0);
header.writeUInt32BE(SIZE, 4);
header[8] = 8; // bit depth
header[9] = 2; // colour type: truecolour

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const out = fileURLToPath(new URL("../public/ton-connect-icon.png", import.meta.url));
writeFileSync(out, png);
console.log("wrote", out, png.length, "bytes");
