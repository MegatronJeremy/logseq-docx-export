// Draws icon.png (128x128): a white page with a folded corner and text lines on a teal rounded square.
// Original artwork, no third-party marks. Pure node (zlib), no dependencies.
import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
const N = 128, px = Buffer.alloc(N * N * 4);
const set = (x, y, r, g, b, a = 255) => { const i = (y * N + x) * 4; px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a; };
const inRound = (x, y, x0, y0, x1, y1, r) => {
  if (x < x0 || x >= x1 || y < y0 || y >= y1) return false;
  const cx = Math.min(Math.max(x, x0 + r), x1 - r - 1), cy = Math.min(Math.max(y, y0 + r), y1 - r - 1);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
};
for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
  if (!inRound(x, y, 0, 0, N, N, 24)) { set(x, y, 0, 0, 0, 0); continue; }
  set(x, y, 20, 110, 120);
  if (x >= 34 && x < 94 && y >= 20 && y < 108 && !(x >= 74 && y < 40 && (x - 74) + (40 - y) > 20 + 0 && x - 74 > 40 - y)) set(x, y, 255, 255, 255);
  if (x >= 74 && x < 94 && y >= 20 && y < 40 && x - 74 <= 40 - y) set(x, y, 20, 110, 120); // cut triangle
  if (x >= 74 && x < 94 && y >= 20 && y < 40 && x - 74 > 40 - y) set(x, y, 190, 225, 228); // fold flap
  for (const ly of [52, 64, 76, 88]) if (y >= ly && y < ly + 5 && x >= 44 && x < (ly === 88 ? 70 : 84)) set(x, y, 20, 110, 120);
}
const raw = Buffer.alloc((N * 4 + 1) * N);
for (let y = 0; y < N; y++) { raw[y * (N * 4 + 1)] = 0; px.copy(raw, y * (N * 4 + 1) + 1, y * N * 4, (y + 1) * N * 4); }
const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4); ihdr[8] = 8; ihdr[9] = 6;
writeFileSync("icon.png", Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]));
console.log("wrote icon.png");
