// Locks a finished PDF with an open password (AES-256) entirely in the browser, using qpdf compiled to WebAssembly.
// The password never leaves the browser. qpdf.js / qpdf.wasm are copied to assets/qpdf by angular.json.

let loading: Promise<any> | null = null;

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Could not load ' + src));
    document.head.appendChild(s);
  });
}

async function qpdf(): Promise<any> {
  if (!loading) {
    loading = (async () => {
      const w = window as any;
      if (typeof w.Module !== 'function') await loadScript('assets/qpdf/qpdf.js');
      if (typeof w.Module !== 'function') throw new Error('The PDF locking library did not start.');
      return w.Module({
        locateFile: (u: string) => (u.endsWith('.wasm') ? 'assets/qpdf/qpdf.wasm' : u),
        noInitialRun: true, print: () => {}, printErr: () => {}
      });
    })();
    loading.catch(() => { loading = null; });
  }
  return loading;
}

/** Returns a copy of the PDF that asks for `password` before it can be opened. */
export async function lockPdf(pdf: Blob, password: string): Promise<Blob> {
  const q = await qpdf();
  const id = Math.random().toString(36).slice(2);
  const inp = `/in-${id}.pdf`, out = `/out-${id}.pdf`;
  q.FS.writeFile(inp, new Uint8Array(await pdf.arrayBuffer()));
  try {
    const owner = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
    const rc = q.callMain(['--encrypt', password, owner, '256', '--print=full', '--modify=none', '--extract=y', '--', inp, out]);
    if (rc !== 0 && rc !== 3) throw new Error('Locking the PDF failed (code ' + rc + ').');
    const bytes: Uint8Array = q.FS.readFile(out);
    return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  } finally {
    try { q.FS.unlink(inp); } catch { /* ignore */ }
    try { q.FS.unlink(out); } catch { /* ignore */ }
  }
}
