// Local sign-in accounts. The project's database has no password-based login yet, so the app signs users in here.
// Passwords are stored only as salted PBKDF2-SHA256 hashes (150,000 rounds). To add or change a user, run the helper
// described in LOGIN.md and paste the new salt/hash here.
//
// Default accounts (change them before real use):
//   admin@pdfstudio.io  /  Admin@123   (Admin)
//   user@pdfstudio.io   /  User@123    (User)

export interface LocalUser {
  userId: string; email: string; name: string; role: string; tenantId: string; salt: string; hash: string;
}

const TENANT = '11111111-1111-1111-1111-111111111111';

export const LOCAL_USERS: LocalUser[] = [
  { userId: 'u-1001', email: 'admin@pdfstudio.io', name: 'Admin', role: 'Admin', tenantId: TENANT,
    salt: 'b86854b8fb9b7dd1b9365d5c7bd3315e', hash: '53a3a608d57fc25d16fe5cdef342bc3f8c92771373cee176d9d8c9a4b2188e67' },
  { userId: 'u-1002', email: 'user@pdfstudio.io', name: 'User', role: 'User', tenantId: TENANT,
    salt: 'cbf35606852802ab3aee60fbb247cb71', hash: '5a473fbcdf8e826aa53560e6822837008595ef6e4cfc8925232a09b923fdddd1' },
  { userId: 'u-1003', email: 'admin@example.com', name: 'Admin', role: 'Admin', tenantId: TENANT,
    salt: 'b86854b8fb9b7dd1b9365d5c7bd3315e', hash: '53a3a608d57fc25d16fe5cdef342bc3f8c92771373cee176d9d8c9a4b2188e67' },
  { userId: 'u-1004', email: 'user@example.com', name: 'User', role: 'User', tenantId: TENANT,
    salt: 'cbf35606852802ab3aee60fbb247cb71', hash: '5a473fbcdf8e826aa53560e6822837008595ef6e4cfc8925232a09b923fdddd1' }
];
