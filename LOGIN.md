# Sign-in

The app opens on a login page. Every other page needs a signed-in user, and the top bar has a **Sign out** button.

Default accounts (change them before real use):

| Email | Password | Role |
|---|---|---|
| admin@pdfstudio.io | Admin@123 | Admin |
| user@pdfstudio.io | User@123 | User |

Accounts live in `src/PDFStudio.Web/src/app/core/services/local-users.ts`. Passwords are stored only as salted
PBKDF2-SHA256 hashes (150,000 rounds).

## Adding or changing a user

Save this as `hash.mjs`, edit the email/password list, run `node hash.mjs`, and paste the printed salt and hash
into `local-users.ts`:

```js
import { webcrypto as c } from 'node:crypto';
const h = async (pw, salt) => {
  const k = await c.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const b = new Uint8Array(await c.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 150000, hash: 'SHA-256' }, k, 256));
  return Buffer.from(b).toString('hex');
};
for (const pw of ['NewPassword123']) {
  const salt = c.getRandomValues(new Uint8Array(16));
  console.log('salt:', Buffer.from(salt).toString('hex'), 'hash:', await h(pw, salt));
}
```

## Limits

This is a sign-in for the web app only. The check runs in the browser, so it keeps casual users out but is not
server-side security. The API still uses its development token. For real protection, the API needs its own
login endpoint and user passwords in the database.
