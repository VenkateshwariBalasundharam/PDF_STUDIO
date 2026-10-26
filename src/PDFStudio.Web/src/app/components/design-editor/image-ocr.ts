// Reads text from a picture (OCR) so the Editor can put editable boxes over it.
// tesseract.js is loaded only when the person clicks the button.
export interface OcrLine {
  text: string;
  x: number; y: number; w: number; h: number; // pixels in the picture's own size
  bg: string;    // background colour around the text
  color: string; // text colour
  conf: number;
}

export const OCR_LANGS: { code: string; label: string }[] = [
  { code: 'eng', label: 'English' },
  { code: 'hin', label: 'Hindi' },
  { code: 'tam', label: 'Tamil' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'spa', label: 'Spanish' },
  { code: 'eng+hin', label: 'English + Hindi' },
  { code: 'eng+tam', label: 'English + Tamil' }
];

const hex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('Could not read the picture.'));
    i.src = src;
  });
}

/** Most common colour in a box = background; the pixels furthest from it = text colour. */
export function sampleColors(d: Uint8ClampedArray, cw: number, ch: number, x0: number, y0: number, x1: number, y1: number): { bg: string; color: string } {
  x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
  x1 = Math.min(cw, Math.ceil(x1)); y1 = Math.min(ch, Math.ceil(y1));
  const counts = new Map<number, number>();
  const px: number[] = [];
  const step = Math.max(1, Math.floor(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  for (let y = y0; y < y1; y += step) for (let x = x0; x < x1; x += step) {
    const i = (y * cw + x) * 4;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    px.push(r, g, b);
    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    counts.set(q, (counts.get(q) ?? 0) + 1);
  }
  if (!px.length) return { bg: '#ffffff', color: '#0f172a' };
  let bestQ = 0, best = -1;
  counts.forEach((n, q) => { if (n > best) { best = n; bestQ = q; } });
  // average the real pixels that fall in the winning bucket for a clean background colour
  let br = 0, bg = 0, bb = 0, bn = 0;
  for (let i = 0; i < px.length; i += 3) {
    const q = ((px[i] >> 4) << 8) | ((px[i + 1] >> 4) << 4) | (px[i + 2] >> 4);
    if (q === bestQ) { br += px[i]; bg += px[i + 1]; bb += px[i + 2]; bn++; }
  }
  br /= bn; bg /= bn; bb /= bn;
  const dist: { d: number; i: number }[] = [];
  for (let i = 0; i < px.length; i += 3) dist.push({ d: Math.abs(px[i] - br) + Math.abs(px[i + 1] - bg) + Math.abs(px[i + 2] - bb), i });
  dist.sort((a, b) => b.d - a.d);
  const top = dist.slice(0, Math.max(1, Math.ceil(dist.length * 0.08)));
  let tr = 0, tg = 0, tb = 0;
  for (const t of top) { tr += px[t.i]; tg += px[t.i + 1]; tb += px[t.i + 2]; }
  tr /= top.length; tg /= top.length; tb /= top.length;
  // if the text barely differs from the background, fall back to readable dark/light text
  const contrast = Math.abs(tr - br) + Math.abs(tg - bg) + Math.abs(tb - bb);
  if (contrast < 90) {
    const lum = 0.299 * br + 0.587 * bg + 0.114 * bb;
    return { bg: hex(br, bg, bb), color: lum > 140 ? '#0f172a' : '#ffffff' };
  }
  return { bg: hex(br, bg, bb), color: hex(tr, tg, tb) };
}

export async function ocrImage(src: string, lang: string, onProgress: (text: string, pct: number) => void): Promise<{ lines: OcrLine[]; width: number; height: number }> {
  const img = await loadImage(src);
  const width = img.naturalWidth, height = img.naturalHeight;
  if (!width || !height) throw new Error('This picture has no size to read.');
  // work at a size OCR handles well
  const k = Math.min(1, 3000 / Math.max(width, height));
  const cw = Math.round(width * k), ch = Math.round(height * k);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
  ctx.drawImage(img, 0, 0, cw, ch);
  const pixels = ctx.getImageData(0, 0, cw, ch).data;

  onProgress('Loading the text reader...', 0);
  const T: any = await import('tesseract.js');
  const createWorker = T.createWorker ?? T.default?.createWorker;
  const worker = await createWorker(lang, 1, {
    logger: (m: any) => {
      if (m?.status) onProgress(String(m.status).replace(/_/g, ' '), typeof m.progress === 'number' ? m.progress : 0);
    }
  });
  try {
    const { data } = await worker.recognize(canvas);
    const lines: OcrLine[] = [];
    for (const l of (data.lines ?? []) as any[]) {
      const text = String(l.text ?? '').replace(/\s+/g, ' ').trim();
      const bb = l.bbox;
      if (!text || !bb || (l.confidence ?? 0) < 45) continue;
      const w = bb.x1 - bb.x0, h = bb.y1 - bb.y0;
      if (w < 4 || h < 4) continue;
      const c = sampleColors(pixels, cw, ch, bb.x0, bb.y0, bb.x1, bb.y1);
      lines.push({ text, x: bb.x0 / k, y: bb.y0 / k, w: w / k, h: h / k, bg: c.bg, color: c.color, conf: l.confidence ?? 0 });
    }
    return { lines, width, height };
  } finally {
    try { await worker.terminate(); } catch { /* ignore */ }
  }
}
