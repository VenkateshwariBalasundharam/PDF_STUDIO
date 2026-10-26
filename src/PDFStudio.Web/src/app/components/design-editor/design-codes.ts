// Barcode (Code 128) and QR code generators. Pure TypeScript, no dependencies, so they work offline.

// ============================== Code 128 ==============================
const C128 = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];
const START_B = 104, START_C = 105, STOP = 106;

/** Returns the bar pattern as modules (true = bar), or null when there is nothing to encode. */
export function code128Modules(input: string): boolean[] | null {
  if (!input) return null;
  // Keep printable ASCII only; anything else becomes "?"
  const text = Array.from(input).map(ch => { const c = ch.charCodeAt(0); return c >= 32 && c <= 126 ? ch : '?'; }).join('');
  const values: number[] = [];
  if (/^\d+$/.test(text) && text.length >= 4 && text.length % 2 === 0) {
    values.push(START_C);
    for (let i = 0; i < text.length; i += 2) values.push(parseInt(text.slice(i, i + 2), 10));
  } else {
    values.push(START_B);
    for (const ch of text) values.push(ch.charCodeAt(0) - 32);
  }
  let sum = values[0];
  for (let i = 1; i < values.length; i++) sum += values[i] * i;
  values.push(sum % 103, STOP);

  const out: boolean[] = [];
  for (const v of values) {
    const p = C128[v];
    for (let i = 0; i < p.length; i++) {
      const n = Number(p[i]);
      for (let k = 0; k < n; k++) out.push(i % 2 === 0);
    }
  }
  return out;
}

export interface BarcodeStyle { w: number; h: number; color: string; bg: string; showText: boolean; text: string; }

export function barcodeSvg(data: string, s: BarcodeStyle): string {
  const mods = code128Modules(data);
  const bgRect = s.bg ? `<rect width="${s.w}" height="${s.h}" fill="${s.bg}"/>` : '';
  if (!mods) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" style="display:block">${bgRect}`
      + `<text x="${s.w / 2}" y="${s.h / 2}" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" fill="#94a3b8">Barcode data is empty</text></svg>`;
  }
  const quiet = 10, total = mods.length + quiet * 2, mw = s.w / total;
  const textH = s.showText ? Math.min(22, Math.max(12, s.h * 0.2)) : 0;
  const barH = Math.max(4, s.h - textH - 4);
  let d = '';
  let i = 0;
  while (i < mods.length) {
    if (!mods[i]) { i++; continue; }
    let j = i; while (j < mods.length && mods[j]) j++;
    d += `M${((quiet + i) * mw).toFixed(3)} 2h${((j - i) * mw).toFixed(3)}v${barH.toFixed(2)}h-${((j - i) * mw).toFixed(3)}z`;
    i = j;
  }
  const label = s.showText
    ? `<text x="${s.w / 2}" y="${s.h - 4}" text-anchor="middle" font-family="'Courier New',monospace" font-size="${Math.round(textH * 0.78)}" fill="${s.color}">${s.text}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" style="display:block">${bgRect}<path d="${d}" fill="${s.color}" shape-rendering="crispEdges"/>${label}</svg>`;
}

// ============================== QR code ==============================
// Byte mode, error-correction level M, versions 1 to 15 (up to 412 bytes).
// Per version: [ecc codewords per block, blocks in group 1, data codewords in group-1 block, blocks in group 2, data codewords in group-2 block]
const QR_M: number[][] = [
  [], [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0], [16, 4, 27, 0, 0],
  [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44], [30, 1, 50, 4, 51], [22, 6, 36, 2, 37],
  [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42]
];
const QR_ALIGN: number[][] = [
  [], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50],
  [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]
];
export const QR_MAX_BYTES = 412;

const EXP: number[] = new Array(512), LOG: number[] = new Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 0x100) x ^= 0x11d; }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const gmul = (a: number, b: number) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];

function rsGenerator(deg: number): number[] {
  let g = [1];
  for (let i = 0; i < deg; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) { next[j] ^= g[j]; next[j + 1] ^= gmul(g[j], EXP[i]); }
    g = next;
  }
  return g; // highest degree first, leading coefficient 1
}

function rsRemainder(data: number[], deg: number): number[] {
  const gen = rsGenerator(deg);
  const res = new Array(deg).fill(0);
  for (const b of data) {
    const factor = b ^ res[0];
    res.shift(); res.push(0);
    if (factor !== 0) for (let i = 0; i < deg; i++) res[i] ^= gmul(gen[i + 1], factor);
  }
  return res;
}

function utf8(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    let c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function dataCapacity(v: number): number {
  const [, g1, d1, g2, d2] = QR_M[v];
  return g1 * d1 + g2 * d2;
}

/** Returns the QR module matrix (true = dark) or null if the text is empty or too long. */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = utf8(text);
  if (!bytes.length) return null;
  let version = 0;
  for (let v = 1; v <= 15; v++) {
    const cc = v < 10 ? 8 : 16;
    if (4 + cc + bytes.length * 8 <= dataCapacity(v) * 8) { version = v; break; }
  }
  if (!version) return null;

  // ----- bit stream -----
  const bits: number[] = [];
  const push = (val: number, len: number) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const capBits = dataCapacity(version) * 8;
  push(0, Math.min(4, capBits - bits.length));
  while (bits.length % 8) bits.push(0);
  const cw: number[] = [];
  for (let i = 0; i < bits.length; i += 8) { let b = 0; for (let k = 0; k < 8; k++) b = (b << 1) | bits[i + k]; cw.push(b); }
  for (let pad = 0xec; cw.length < dataCapacity(version); pad ^= 0xec ^ 0x11) cw.push(pad);

  // ----- blocks + error correction -----
  const [ecPer, g1, d1, g2, d2] = QR_M[version];
  const blocks: number[][] = [];
  let pos = 0;
  for (let i = 0; i < g1; i++) { blocks.push(cw.slice(pos, pos + d1)); pos += d1; }
  for (let i = 0; i < g2; i++) { blocks.push(cw.slice(pos, pos + d2)); pos += d2; }
  const ecs = blocks.map(b => rsRemainder(b, ecPer));
  const final: number[] = [];
  const maxLen = Math.max(d1, d2);
  for (let i = 0; i < maxLen; i++) for (const b of blocks) if (i < b.length) final.push(b[i]);
  for (let i = 0; i < ecPer; i++) for (const e of ecs) final.push(e[i]);

  // ----- matrix with function patterns -----
  const size = 17 + 4 * version;
  const mod: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn: boolean[][] = Array.from({ length: size }, () => new Array(size).fill(false));
  const setFn = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true; };

  for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
  const finder = (cx: number, cy: number) => {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      setFn(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = QR_ALIGN[version];
  for (let a = 0; a < al.length; a++) for (let b = 0; b < al.length; b++) {
    if ((a === 0 && b === 0) || (a === 0 && b === al.length - 1) || (a === al.length - 1 && b === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(al[b] + dx, al[a] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const bit = (v: number, i: number) => ((v >>> i) & 1) !== 0;
  const drawFormat = (mask: number) => {
    const data = (0 << 3) | mask; // level M = 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bitsF = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i++) setFn(8, i, bit(bitsF, i));
    setFn(8, 7, bit(bitsF, 6)); setFn(8, 8, bit(bitsF, 7)); setFn(7, 8, bit(bitsF, 8));
    for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(bitsF, i));
    for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(bitsF, i));
    for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(bitsF, i));
    setFn(8, size - 8, true);
  };
  drawFormat(0);
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const vbits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const a = size - 11 + (i % 3), b = Math.floor(i / 3), d = bit(vbits, i);
      setFn(a, b, d); setFn(b, a, d);
    }
  }

  // ----- place data -----
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) for (let j = 0; j < 2; j++) {
      const x = right - j, upward = ((right + 1) & 2) === 0, y = upward ? size - 1 - vert : vert;
      if (!fn[y][x] && k < final.length * 8) { mod[y][x] = bit(final[k >>> 3], 7 - (k & 7)); k++; }
    }
  }

  // ----- choose best mask -----
  const maskFn = [
    (i: number, j: number) => (i + j) % 2 === 0, (i: number) => i % 2 === 0, (_: number, j: number) => j % 3 === 0,
    (i: number, j: number) => (i + j) % 3 === 0, (i: number, j: number) => (Math.floor(i / 2) + Math.floor(j / 3)) % 2 === 0,
    (i: number, j: number) => ((i * j) % 2) + ((i * j) % 3) === 0, (i: number, j: number) => (((i * j) % 2) + ((i * j) % 3)) % 2 === 0,
    (i: number, j: number) => (((i + j) % 2) + ((i * j) % 3)) % 2 === 0
  ];
  let best: boolean[][] | null = null, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const cand = mod.map(r => r.slice());
    const saveMod = mod.map(r => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && maskFn[m](y, x)) cand[y][x] = !cand[y][x];
    // write format bits for this mask into the candidate
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mod[y][x] = cand[y][x];
    drawFormat(m);
    const done = mod.map(r => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mod[y][x] = saveMod[y][x];
    const sc = penalty(done);
    if (sc < bestScore) { bestScore = sc; best = done; }
  }
  return best;
}

function penalty(m: boolean[][]): number {
  const n = m.length;
  let score = 0;
  const runs = (line: boolean[]) => {
    let s = 0, run = 1;
    for (let i = 1; i < n; i++) {
      if (line[i] === line[i - 1]) run++; else { if (run >= 5) s += 3 + (run - 5); run = 1; }
    }
    if (run >= 5) s += 3 + (run - 5);
    return s;
  };
  const pat = (line: boolean[]) => {
    let s = 0;
    const str = line.map(b => (b ? '1' : '0')).join('');
    for (const p of ['10111010000', '00001011101']) {
      let idx = str.indexOf(p);
      while (idx !== -1) { s += 40; idx = str.indexOf(p, idx + 1); }
    }
    return s;
  };
  for (let y = 0; y < n; y++) { score += runs(m[y]) + pat(m[y]); }
  for (let x = 0; x < n; x++) { const col = m.map(r => r[x]); score += runs(col) + pat(col); }
  for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
    if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) score += 3;
  }
  let dark = 0;
  for (const r of m) for (const c of r) if (c) dark++;
  score += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
  return score;
}

export interface QrStyle { w: number; h: number; color: string; bg: string; }

export function qrSvg(data: string, s: QrStyle): string {
  const m = qrMatrix(data);
  const bgRect = s.bg ? `<rect width="${s.w}" height="${s.h}" fill="${s.bg}"/>` : '';
  if (!m) {
    const msg = data ? 'Too much data for a QR code' : 'QR data is empty';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" style="display:block">${bgRect}`
      + `<rect x="1" y="1" width="${s.w - 2}" height="${s.h - 2}" fill="none" stroke="#94a3b8" stroke-dasharray="4 3"/>`
      + `<text x="${s.w / 2}" y="${s.h / 2}" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" fill="#94a3b8">${msg}</text></svg>`;
  }
  const n = m.length, quiet = 4, total = n + quiet * 2, side = Math.min(s.w, s.h), u = side / total;
  const ox = (s.w - side) / 2, oy = (s.h - side) / 2;
  let d = '';
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!m[y][x]) { x++; continue; }
      let e = x; while (e < n && m[y][e]) e++;
      d += `M${(ox + (quiet + x) * u).toFixed(3)} ${(oy + (quiet + y) * u).toFixed(3)}h${((e - x) * u).toFixed(3)}v${u.toFixed(3)}h-${((e - x) * u).toFixed(3)}z`;
      x = e;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s.w}" height="${s.h}" viewBox="0 0 ${s.w} ${s.h}" style="display:block">${bgRect}<path d="${d}" fill="${s.color}" shape-rendering="crispEdges"/></svg>`;
}
