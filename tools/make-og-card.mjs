#!/usr/bin/env node
/**
 * Make the Open Graph card, apps/web/public/brand/og-card.png.
 *
 * The script needs no dependency and no browser. It draws a small bitmap font
 * on a gradient. Run it again after a change to the copy.
 *   node tools/make-og-card.mjs
 */
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const WIDTH = 1200;
const HEIGHT = 630;
const OUT = "apps/web/public/brand/og-card.png";

const GLYPHS = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01110"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
};

const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);

function blend(x, y, red, green, blue, alpha) {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT || alpha <= 0) {
    return;
  }
  const at = (y * WIDTH + x) * 3;
  const a = Math.min(1, alpha);
  pixels[at] = Math.round(pixels[at] * (1 - a) + red * a);
  pixels[at + 1] = Math.round(pixels[at + 1] * (1 - a) + green * a);
  pixels[at + 2] = Math.round(pixels[at + 2] * (1 - a) + blue * a);
}

for (let y = 0; y < HEIGHT; y += 1) {
  for (let x = 0; x < WIDTH; x += 1) {
    const depth = y / HEIGHT;
    const base = [14 + depth * 4, 17 + depth * 9, 22 + depth * 12];
    const distance = Math.hypot(x - 930, y - 80) / 640;
    const glow = Math.max(0, 1 - distance) ** 2 * 0.5;
    blend(x, y, base[0] + 14 * glow, base[1] + 150 * glow, base[2] + 168 * glow, 1);
  }
}

function text(value, x, y, scale, color) {
  let cursor = x;
  for (const letter of value) {
    const glyph = GLYPHS[letter] ?? GLYPHS[" "];
    for (let row = 0; row < glyph.length; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (glyph[row][column] !== "1") {
          continue;
        }
        for (let dy = 0; dy < scale; dy += 1) {
          for (let dx = 0; dx < scale; dx += 1) {
            blend(cursor + column * scale + dx, y + row * scale + dy, color[0], color[1], color[2], 1);
          }
        }
      }
    }
    cursor += (5 + 1) * scale;
  }
}

text("KEYRIG", 96, 116, 12, [34, 211, 238]);
text("ONE KEY. EVERY MODEL.", 96, 250, 6, [244, 247, 251]);
text("YOUR KEYS STAY IN THIS BROWSER.", 96, 340, 3, [159, 176, 198]);
text("EVERY ANSWER SHOWS ITS MODEL AND ITS COST.", 96, 384, 3, [159, 176, 198]);

for (let y = 0; y < 4; y += 1) {
  for (let x = 0; x < 132; x += 1) {
    blend(96 + x, 460 + y, 240, 180, 41, 1);
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
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
header.writeUInt32BE(WIDTH, 0);
header.writeUInt32BE(HEIGHT, 4);
header[8] = 8;
header[9] = 2;
header[10] = 0;
header[11] = 0;
header[12] = 0;

const scanlines = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
for (let y = 0; y < HEIGHT; y += 1) {
  scanlines[y * (WIDTH * 3 + 1)] = 0;
  pixels.copy(scanlines, y * (WIDTH * 3 + 1) + 1, y * WIDTH * 3, (y + 1) * WIDTH * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", header),
  chunk("IDAT", deflateSync(scanlines, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

writeFileSync(OUT, png);
console.log(`${OUT}: ${WIDTH}x${HEIGHT}, ${png.length} bytes`);
