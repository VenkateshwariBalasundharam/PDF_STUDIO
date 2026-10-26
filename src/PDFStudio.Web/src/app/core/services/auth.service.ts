import { Injectable, signal } from '@angular/core';
import { UserSession } from '../models/api.models';
import { LOCAL_USERS, LocalUser } from './local-users';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly STORAGE_KEY = 'pdfstudio_session';
  private readonly API_KEY_STORAGE = 'pdfstudio_api_key';
  private readonly USERS_STORAGE = 'pdfstudio_registered_users';
  private readonly OVERRIDES_STORAGE = 'pdfstudio_user_password_overrides';

  public currentSession = signal<UserSession | null>(this.loadSession());
  public apiKey = signal<string>(localStorage.getItem(this.API_KEY_STORAGE) || 'pdf_live_default_demo_key');

  /** True when someone has signed in. */
  public isLoggedIn(): boolean {
    return !!this.currentSession();
  }

  /** Checks if an email is associated with an Administrator account. */
  public isUserAdmin(email: string): boolean {
    const e = (email ?? '').trim().toLowerCase();
    if (!e) return false;
    if (e.startsWith('admin@') || e.includes('admin')) return true;
    const user = this.allUsers().find(u => u.email.toLowerCase() === e);
    return (user?.role ?? '').toLowerCase() === 'admin';
  }

  /**
   * Generates a dynamic one-time password for regular users.
   * Admins are strictly disallowed from using generated passwords.
   */
  public async generateUserPassword(email: string): Promise<{ success: boolean; password?: string; error?: string }> {
    const e = (email ?? '').trim().toLowerCase();
    if (!e) {
      return { success: false, error: 'Please enter your user email address.' };
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }
    if (this.isUserAdmin(e)) {
      return {
        success: false,
        error: 'Password generation is only available for regular users, not for Admin. Admin must use their master password.'
      };
    }

    // Generate a secure readable password with letters and numbers (e.g. User#592814)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const newPassword = `User#${code}`;

    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const saltHex = bytesToHex(saltBytes);
    const hashHex = await pbkdf2Hex(newPassword, saltBytes);

    // Save in password overrides
    const overrides = this.passwordOverrides();
    overrides[e] = { salt: saltHex, hash: hashHex };
    try {
      localStorage.setItem(this.OVERRIDES_STORAGE, JSON.stringify(overrides));
    } catch {
      return { success: false, error: 'Browser storage is full or restricted.' };
    }

    // If account doesn't exist in registered users or LOCAL_USERS, create it automatically as a User
    if (!this.allUsers().some(u => u.email.toLowerCase() === e)) {
      const newUser: LocalUser = {
        userId: 'u-' + crypto.randomUUID().slice(0, 8),
        email: e,
        name: e.split('@')[0],
        role: 'User',
        tenantId: LOCAL_USERS[0]?.tenantId ?? '11111111-1111-1111-1111-111111111111',
        salt: saltHex,
        hash: hashHex
      };
      try {
        localStorage.setItem(this.USERS_STORAGE, JSON.stringify([...this.registeredUsers(), newUser]));
      } catch {}
    }

    return { success: true, password: newPassword };
  }

  /** Checks the email and password against the local accounts. Returns an error message, or null on success. */
  public async login(email: string, password: string): Promise<string | null> {
    const user = this.allUsers().find(u => u.email.toLowerCase() === (email ?? '').trim().toLowerCase());
    // Always run the hash so a wrong email and a wrong password take the same time and give the same message.
    const salt = user ? hexToBytes(user.salt) : new Uint8Array(16);
    const hash = await pbkdf2Hex(password ?? '', salt);
    if (!user || !safeEqual(hash, user.hash)) return 'Incorrect email or password.';
    this.saveSession({
      token: 'local-' + crypto.randomUUID(), userId: user.userId, email: user.email, role: user.role, tenantId: user.tenantId
    });
    return null;
  }

  /** Accounts created with Sign up (kept in this browser only), plus the built-in ones. */
  private registeredUsers(): LocalUser[] {
    try {
      const arr = JSON.parse(localStorage.getItem(this.USERS_STORAGE) || '[]');
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }

  private passwordOverrides(): Record<string, { salt: string; hash: string }> {
    try {
      const raw = localStorage.getItem(this.OVERRIDES_STORAGE);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }

  private allUsers(): LocalUser[] {
    const overrides = this.passwordOverrides();
    const base = [...LOCAL_USERS, ...this.registeredUsers()];
    return base.map(u => {
      const ov = overrides[u.email.toLowerCase()];
      if (ov) {
        return { ...u, salt: ov.salt, hash: ov.hash };
      }
      return u;
    });
  }

  /** Creates a normal (User role) account and signs it in. Returns an error message, or null on success. */
  public async register(name: string, email: string, password: string): Promise<string | null> {
    const n = (name ?? '').trim();
    const e = (email ?? '').trim().toLowerCase();
    if (n.length < 2) return 'Enter your name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return 'Enter a valid email address.';
    if ((password ?? '').length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return 'Use a password of at least 8 characters with a letter and a number.';
    }
    if (this.allUsers().some(u => u.email.toLowerCase() === e)) return 'An account with this email already exists. Sign in instead.';
    const saltBytes = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2Hex(password, saltBytes);
    const user: LocalUser = {
      userId: 'u-' + crypto.randomUUID().slice(0, 8), email: e, name: n, role: 'User',
      tenantId: LOCAL_USERS[0]?.tenantId ?? '11111111-1111-1111-1111-111111111111',
      salt: bytesToHex(saltBytes), hash
    };
    try { localStorage.setItem(this.USERS_STORAGE, JSON.stringify([...this.registeredUsers(), user])); }
    catch { return 'Could not save the account: this browser blocks or has no room for local storage.'; }
    this.saveSession({ token: 'local-' + crypto.randomUUID(), userId: user.userId, email: user.email, role: user.role, tenantId: user.tenantId });
    return null;
  }

  /** True only for accounts with the Admin role. */
  public isAdmin(): boolean {
    return (this.currentSession()?.role ?? '').toLowerCase() === 'admin';
  }

  public getSession(): UserSession | null {
    return this.currentSession();
  }

  public getTenantId(): string {
    return this.currentSession()?.tenantId || '11111111-1111-1111-1111-111111111111';
  }

  public getApiKey(): string {
    return this.apiKey();
  }

  public setApiKey(key: string): void {
    this.apiKey.set(key);
    localStorage.setItem(this.API_KEY_STORAGE, key);
  }

  public saveSession(session: UserSession): void {
    this.currentSession.set(session);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(session));
  }

  public logout(): void {
    this.currentSession.set(null);
    localStorage.removeItem(this.STORAGE_KEY);
  }

  private loadSession(): UserSession | null {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}


function bytesToHex(b: Uint8Array): string {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

async function pbkdf2Hex(password: string, salt: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Sign-in needs a secure page. Open the app on localhost or over https.');
  const key = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations: 150000, hash: 'SHA-256' }, key, 256));
  return Array.from(bits, b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
