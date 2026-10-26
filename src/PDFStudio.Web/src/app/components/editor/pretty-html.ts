// Pretty-prints the HTML that the Visual editor generates, so the Code Editor shows readable,
// indented code instead of one very long line.
//
// Whitespace is only ever added BETWEEN elements or inside tags / style attributes, never inside an
// element that holds text (text boxes use white-space:pre-wrap), so the rendered page is identical.

const VOID = new Set(['img', 'br', 'hr', 'input', 'meta', 'link', 'source', 'area', 'base', 'col', 'embed', 'wbr']);
const TOKEN = /<!--[\s\S]*?-->|<style\b[\s\S]*?<\/style>|<\/?[a-zA-Z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+|</g;
const MAX_INLINE_TAG = 90;

const pad = (n: number) => '  '.repeat(n);

function fmtStyleBlock(t: string, d: number): string[] {
  const m = /^(<style\b[^>]*>)([\s\S]*?)(<\/style>)$/i.exec(t);
  if (!m || m[2].includes('@')) return [pad(d) + t];            // leave @media etc. untouched
  const rules = m[2].split('}').map(s => s.trim()).filter(Boolean).map(r => {
    const k = r.indexOf('{');
    return k < 0 ? pad(d + 1) + r : pad(d + 1) + r.slice(0, k).trim() + ' { ' + r.slice(k + 1).trim() + ' }';
  });
  return [pad(d) + m[1], ...rules, pad(d) + m[3]];
}

function fmtTag(tag: string, d: number): string[] {
  if (tag.length <= MAX_INLINE_TAG) return [pad(d) + tag];
  const m = /^<([^\s\/>]+)([\s\S]*?)(\/?)>$/.exec(tag);
  if (!m) return [pad(d) + tag];
  const lines = [pad(d) + '<' + m[1]];
  for (const a of m[2].matchAll(/([^\s=\/"']+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g)) {
    const name = a[1], val = a[2];
    if (val === undefined) { lines.push(pad(d + 1) + name); continue; }
    if (name.toLowerCase() === 'style' && val.length > 2 && !/url\(/i.test(val)) {
      const q = val[0];
      lines.push(pad(d + 1) + 'style=' + q);
      for (const decl of val.slice(1, -1).split(';').map(s => s.trim()).filter(Boolean)) lines.push(pad(d + 2) + decl + ';');
      lines.push(pad(d + 1) + q);
    } else {
      lines.push(pad(d + 1) + name + '=' + val);
    }
  }
  lines[lines.length - 1] += m[3] ? '/>' : '>';
  return lines;
}

export function prettyHtml(src: string): string {
  const toks = src.match(TOKEN) ?? [];
  const out: string[] = [];
  let depth = 0;
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (/^<style\b/i.test(t)) { out.push(...fmtStyleBlock(t, depth)); i++; continue; }
    if (t.startsWith('<!--')) { out.push(pad(depth) + t); i++; continue; }
    if (t.startsWith('</')) { depth = Math.max(0, depth - 1); out.push(pad(depth) + t); i++; continue; }
    if (/^<[a-zA-Z]/.test(t)) {
      const name = /^<([a-zA-Z][\w:-]*)/.exec(t)![1].toLowerCase();
      if (t.endsWith('/>') || VOID.has(name)) { out.push(...fmtTag(t, depth)); i++; continue; }
      const nxt = toks[i + 1];
      if (nxt !== undefined && !/^<(?![a-zA-Z])/.test(nxt) && !nxt.startsWith('<') && nxt.trim() !== '') {
        // Element holds text: keep its whole content on the same line as its tag, untouched.
        let level = 1, j = i + 1;
        for (; j < toks.length && level > 0; j++) {
          const u = toks[j];
          if (u.startsWith('</')) level--;
          else if (/^<[a-zA-Z]/.test(u) && !u.endsWith('/>') && !VOID.has(/^<([a-zA-Z][\w:-]*)/.exec(u)![1].toLowerCase())) level++;
        }
        const lines = fmtTag(t, depth);
        lines[lines.length - 1] += toks.slice(i + 1, j).join('');
        out.push(...lines);
        i = j;
        continue;
      }
      out.push(...fmtTag(t, depth));
      depth++;
      i++;
      continue;
    }
    if (t.trim() !== '') out.push(pad(depth) + t.trim());          // stray text between elements
    i++;
  }
  return out.join('\n');
}
