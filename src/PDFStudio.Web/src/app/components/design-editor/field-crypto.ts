// Sealed (encrypted) field values.
//
// A value is encrypted once with a random AES-256-GCM data key. That data key is then "wrapped" separately for each
// way of unlocking it: a passphrase (PBKDF2 -> AES-GCM) and/or any number of recipients (RSA-OAEP public keys).
// Anyone without a matching passphrase or private key only sees the masked text, never the value.
//
// Sealed text format: "PSENC2." + base64url(JSON envelope). Older "v1." passphrase-only text can still be opened.

export interface PassWrap { t: 'pass'; salt: string; iter: number; iv: string; k: string; }
export interface RsaWrap { t: 'rsa'; kid: string; label: string; k: string; }
export type Wrap = PassWrap | RsaWrap;
export interface Envelope { v: 2; iv: string; ct: string; keys: Wrap[]; }

export interface Recipient { label: string; pub: string; }       // pub = "PSPUB1...." public key text
export interface KeyPair { pub: string; priv: string; kid: string; }  // priv = "PSKEY1...." private key text

export const SEAL_PREFIX = 'PSENC2.';
/** Sealed text embedded in a PDF is wrapped like PSSEAL[PSENC2....] so it can be found again. */
export const SEAL_OPEN = 'PSSEAL[';
export const SEAL_CLOSE = ']';
const ITER = 150000;

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new Error('Encryption needs a secure page. Open the app on localhost or over https.');
  return s;
};

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(text: string): Uint8Array {
  const t = text.replace(/\s+/g, '');
  const b = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4));
  return Uint8Array.from(b, c => c.charCodeAt(0));
}
const bs = (u: Uint8Array) => u as unknown as BufferSource;
const enc = (s: string) => new TextEncoder().encode(s);
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function passKey(pass: string, salt: Uint8Array, iter: number, usage: 'encrypt' | 'decrypt'): Promise<CryptoKey> {
  const mat = await subtle().importKey('raw', bs(enc(pass)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', salt: bs(salt), iterations: iter, hash: 'SHA-256' },
    mat, { name: 'AES-GCM', length: 256 }, false, [usage]);
}

// ---------- keys ----------

async function kidOf(jwk: JsonWebKey): Promise<string> {
  const h = new Uint8Array(await subtle().digest('SHA-256', bs(enc(String(jwk.n)))));
  return b64url(h).slice(0, 10);
}

export async function generateKeyPair(): Promise<KeyPair> {
  const kp = await subtle().generateKey({ name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['encrypt', 'decrypt']);
  const pubJwk = await subtle().exportKey('jwk', kp.publicKey);
  const privJwk = await subtle().exportKey('jwk', kp.privateKey);
  return {
    pub: 'PSPUB1.' + b64url(enc(JSON.stringify({ kty: pubJwk.kty, n: pubJwk.n, e: pubJwk.e }))),
    priv: 'PSKEY1.' + b64url(enc(JSON.stringify(privJwk))),
    kid: await kidOf(pubJwk)
  };
}

function parseKey(text: string, prefix: string): JsonWebKey {
  const t = (text ?? '').trim();
  if (!t.startsWith(prefix)) throw new Error('This is not a valid ' + (prefix === 'PSPUB1.' ? 'public' : 'private') + ' key.');
  try { return JSON.parse(new TextDecoder().decode(unb64url(t.slice(prefix.length)))); }
  catch { throw new Error('This key text is damaged.'); }
}

/** Public key text -> short key id (shown so people can tell keys apart). */
export async function keyId(pub: string): Promise<string> { return kidOf(parseKey(pub, 'PSPUB1.')); }

// ---------- seal / open ----------

export async function seal(plain: string, opts: { pass?: string; recipients?: Recipient[] }): Promise<string> {
  const recips = opts.recipients ?? [];
  if (!opts.pass && recips.length === 0) throw new Error('Add a passphrase or at least one recipient first.');
  const raw = rnd(32), iv = rnd(12);
  const dk = await subtle().importKey('raw', bs(raw), 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: bs(iv) }, dk, bs(enc(plain))));
  const keys: Wrap[] = [];
  if (opts.pass) {
    const salt = rnd(16), wiv = rnd(12);
    const k = await passKey(opts.pass, salt, ITER, 'encrypt');
    const w = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv: bs(wiv) }, k, bs(raw)));
    keys.push({ t: 'pass', salt: b64url(salt), iter: ITER, iv: b64url(wiv), k: b64url(w) });
  }
  for (const r of recips) {
    const jwk = parseKey(r.pub, 'PSPUB1.');
    const pk = await subtle().importKey('jwk', { ...jwk, alg: 'RSA-OAEP-256', ext: true }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['encrypt']);
    const w = new Uint8Array(await subtle().encrypt({ name: 'RSA-OAEP' }, pk, bs(raw)));
    keys.push({ t: 'rsa', kid: await kidOf(jwk), label: r.label, k: b64url(w) });
  }
  const env: Envelope = { v: 2, iv: b64url(iv), ct: b64url(ct), keys };
  return SEAL_PREFIX + b64url(enc(JSON.stringify(env)));
}

export function readEnvelope(sealed: string): Envelope | null {
  const t = (sealed ?? '').trim();
  if (!t.startsWith(SEAL_PREFIX)) return null;
  try { return JSON.parse(new TextDecoder().decode(unb64url(t.slice(SEAL_PREFIX.length)))); } catch { return null; }
}

/** What can unlock this sealed text, without unlocking it. */
export function describeSeal(sealed: string): { pass: boolean; recipients: { kid: string; label: string }[]; legacy: boolean } {
  if ((sealed ?? '').trim().startsWith('v1.')) return { pass: true, recipients: [], legacy: true };
  const env = readEnvelope(sealed);
  return {
    pass: !!env?.keys.some(k => k.t === 'pass'),
    recipients: (env?.keys ?? []).filter((k): k is RsaWrap => k.t === 'rsa').map(k => ({ kid: k.kid, label: k.label })),
    legacy: false
  };
}

export async function open(sealed: string, cred: { pass?: string; privateKeys?: string[] }): Promise<string> {
  const t = (sealed ?? '').trim();
  if (t.startsWith('v1.')) {
    if (!cred.pass) throw new Error('This value needs a passphrase.');
    const all = unb64url(t.slice(3));
    const key = await passKey(cred.pass, all.slice(0, 16), ITER, 'decrypt');
    return new TextDecoder().decode(await subtle().decrypt({ name: 'AES-GCM', iv: bs(all.slice(16, 28)) }, key, bs(all.slice(28))));
  }
  const env = readEnvelope(t);
  if (!env) throw new Error('This is not sealed text.');
  let raw: Uint8Array | null = null;

  if (cred.pass) {
    for (const w of env.keys) {
      if (w.t !== 'pass') continue;
      try {
        const k = await passKey(cred.pass, unb64url(w.salt), w.iter, 'decrypt');
        raw = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: bs(unb64url(w.iv)) }, k, bs(unb64url(w.k))));
        break;
      } catch { /* wrong passphrase: try next */ }
    }
  }
  if (!raw) {
    for (const priv of cred.privateKeys ?? []) {
      let jwk: JsonWebKey;
      try { jwk = parseKey(priv, 'PSKEY1.'); } catch { continue; }
      const kid = await kidOf(jwk);
      const w = env.keys.find(x => x.t === 'rsa' && x.kid === kid);
      if (!w) continue;
      try {
        const pk = await subtle().importKey('jwk', { ...jwk, alg: 'RSA-OAEP-256' }, { name: 'RSA-OAEP', hash: 'SHA-256' }, false, ['decrypt']);
        raw = new Uint8Array(await subtle().decrypt({ name: 'RSA-OAEP' }, pk, bs(unb64url(w.k))));
        break;
      } catch { /* try next key */ }
    }
  }
  if (!raw) throw new Error('Access denied. The passphrase or key is not one this value was sealed for.');
  const dk = await subtle().importKey('raw', bs(raw), 'AES-GCM', false, ['decrypt']);
  return new TextDecoder().decode(await subtle().decrypt({ name: 'AES-GCM', iv: bs(unb64url(env.iv)) }, dk, bs(unb64url(env.ct))));
}

// ---------- masking ----------

/** "4111111111111234" with 4 visible -> "••••••••••••1234". Short values are masked completely. */
export function maskValue(plain: string, visible = 4, ch = '•'): string {
  const chars = Array.from(plain ?? '');
  if (chars.length === 0) return '';
  const keep = Math.max(0, Math.min(Math.floor(visible), Math.floor(chars.length / 2)));
  return ch.repeat(chars.length - keep) + (keep ? chars.slice(chars.length - keep).join('') : '');
}

// ---------- the signed-in user's own key pair (kept in this browser) ----------

const userKeyName = (userId: string) => 'pdfstudio-userkey-v1-' + userId;

export function loadUserKey(userId: string): KeyPair | null {
  try { const r = localStorage.getItem(userKeyName(userId)); return r ? JSON.parse(r) : null; } catch { return null; }
}
export function saveUserKey(userId: string, kp: KeyPair): void {
  try { localStorage.setItem(userKeyName(userId), JSON.stringify(kp)); } catch { /* storage blocked */ }
}
export async function ensureUserKey(userId: string): Promise<KeyPair> {
  return loadUserKey(userId) ?? (() => generateKeyPair().then(kp => { saveUserKey(userId, kp); return kp; }))();
}

/** Finds every sealed value inside text extracted from a PDF. */
export function findSealed(text: string): string[] {
  const flat = (text ?? '').replace(/\s+/g, '');
  const out: string[] = [];
  const re = /PSSEAL\[(PSENC2\.[A-Za-z0-9_-]+)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(flat))) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}
