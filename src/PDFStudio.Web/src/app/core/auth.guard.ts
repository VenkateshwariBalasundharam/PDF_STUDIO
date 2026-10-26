import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './services/auth.service';

/** Lets only Admin accounts in; everyone else goes back to the dashboard. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isAdmin() ? true : inject(Router).createUrlTree(['/dashboard']);
};

/** Sends anyone who is not signed in to the login page. */
export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.isLoggedIn() ? true : inject(Router).createUrlTree(['/login']);
};
