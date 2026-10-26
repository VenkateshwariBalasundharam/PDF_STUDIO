import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="page-wrap">
      <div class="login-card">
        <!-- Brand Header: [📄] PDFStudio -->
        <div class="brand-header">
          <svg class="brand-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <line x1="10" y1="9" x2="8" y2="9"></line>
          </svg>
          <span class="brand-title">PDFStudio</span>
        </div>

        <p class="mode-sub" *ngIf="mode === 'signup'">Create your account</p>

        <!-- ========================================== -->
        <!-- 1. SIGN IN MODE                            -->
        <!-- ========================================== -->
        <form *ngIf="mode === 'signin'" (ngSubmit)="submit()" autocomplete="on">
          <!-- Work Email -->
          <label class="field-label" for="email">Work Email</label>
          <div class="input-wrapper email-wrapper" [class.input-error]="emailError">
            <span class="prefix-icon">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </span>
            <span class="icon-divider"></span>
            <input
              id="email"
              name="email"
              type="email"
              autocomplete="username"
              [(ngModel)]="email"
              (input)="onEmailChange()"
              (keydown.enter)="$event.preventDefault(); onGenerateClick()"
              required
              autofocus
              placeholder="name@company.com">
          </div>

          <!-- Email Error Message -->
          <div class="email-error-text" *ngIf="emailError">
            {{ emailError }}
          </div>

          <!-- Enter Password Label & Inline Generate Link -->
          <div class="pw-label-bar">
            <label class="field-label" for="pw">Enter Password</label>
            <button
              *ngIf="hasEmail"
              type="button"
              class="inline-gen-btn"
              (click)="onGenerateClick()"
              title="Generate password for user">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Generate</span>
            </button>
          </div>

          <!-- Password Input with Eye Toggle & Lock Icon -->
          <div class="input-wrapper pw-wrapper">
            <input
              id="pw"
              name="password"
              [type]="showPassword ? 'text' : 'password'"
              autocomplete="current-password"
              [(ngModel)]="password"
              (input)="onPasswordInput()"
              required
              placeholder="Type shown password">
            <button
              type="button"
              class="eye-toggle-btn"
              (click)="showPassword = !showPassword"
              [title]="showPassword ? 'Hide password' : 'Show password'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
            <span class="lock-badge">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </span>
          </div>

          <!-- Password Generated Notification Cards -->
          <div class="password-generated-section" *ngIf="generatedPassword">
            <div class="blue-card-password">
              <span class="pw-label">Your Password: </span>
              <span class="pw-val">{{ generatedPassword }}</span>
              <button type="button" class="btn-copy-tiny" (click)="copyPassword()" [title]="copied ? 'Copied' : 'Copy'">
                {{ copied ? '✓' : '📋' }}
              </button>
            </div>
            <div class="green-card-notice">
              New password generated. Enter the shown password
            </div>
          </div>

          <!-- General Error Alert -->
          <div class="general-error-alert" *ngIf="error" role="alert">
            {{ error }}
          </div>

          <!-- Row 1: [ ->] Login ] (left) & [ ⚙ Generate Password ] (right) -->
          <div class="actions-row">
            <button
              type="submit"
              class="btn-login-half"
              [class.full-width]="!hasEmail"
              [disabled]="busy || !email || !password">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 3h8a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H9"></path>
                <polyline points="10 17 15 12 10 7"></polyline>
                <line x1="15" y1="12" x2="3" y2="12"></line>
              </svg>
              <span>Login</span>
            </button>

            <!-- Generate Password button (only shows "Generate Password") -->
            <button
              *ngIf="hasEmail"
              type="button"
              class="btn-generate-dashed-half"
              (click)="onGenerateClick()"
              [disabled]="busy">
              <svg class="gen-ico" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Generate Password</span>
            </button>
          </div>

          <!-- Row 2: [ 👤+ Create an account ] Full Width -->
          <button
            type="button"
            class="btn-create-account-full"
            (click)="setMode('signup')">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <span>Create an account</span>
          </button>

          <!-- Footer Row: Forgot password? on left, Reset on right -->
          <div class="footer-row">
            <button type="button" class="forgot-link" (click)="onForgotPasswordClick()">
              Forgot password?
            </button>
            <button type="button" class="reset-link-btn" (click)="resetForm()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M23 4v6h-6"></path>
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
              </svg>
              <span>Reset</span>
            </button>
          </div>
        </form>

        <!-- ========================================== -->
        <!-- 2. SIGN UP MODE FOR NEW USERS              -->
        <!-- ========================================== -->
        <form *ngIf="mode === 'signup'" (ngSubmit)="submit()" autocomplete="on">
          <!-- Full Name -->
          <label class="field-label" for="su-name">Full Name</label>
          <div class="input-wrapper name-wrapper" [class.input-error]="nameError">
            <span class="prefix-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                <circle cx="12" cy="7" r="4"></circle>
              </svg>
            </span>
            <span class="icon-divider"></span>
            <input
              id="su-name"
              name="name"
              type="text"
              autocomplete="name"
              [(ngModel)]="name"
              (input)="nameError = ''"
              required
              autofocus
              placeholder="Your full name">
          </div>
          <div class="email-error-text" *ngIf="nameError">
            {{ nameError }}
          </div>

          <!-- Work Email -->
          <label class="field-label" for="su-email">Work Email</label>
          <div class="input-wrapper email-wrapper" [class.input-error]="emailError">
            <span class="prefix-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                <polyline points="22,6 12,13 2,6"></polyline>
              </svg>
            </span>
            <span class="icon-divider"></span>
            <input
              id="su-email"
              name="email"
              type="email"
              autocomplete="username"
              [(ngModel)]="email"
              (input)="emailError = ''"
              required
              placeholder="name@company.com">
          </div>
          <div class="email-error-text" *ngIf="emailError">
            {{ emailError }}
          </div>

          <!-- Create Password -->
          <label class="field-label" for="su-pw">Create Password</label>
          <div class="input-wrapper pw-wrapper" [class.input-error]="passwordError">
            <input
              id="su-pw"
              name="password"
              [type]="showPassword ? 'text' : 'password'"
              autocomplete="new-password"
              [(ngModel)]="password"
              (input)="onSignupPasswordChange()"
              required
              placeholder="At least 8 chars, letter & number">
            <button
              type="button"
              class="suffix-icon-btn"
              (click)="showPassword = !showPassword"
              [title]="showPassword ? 'Hide password' : 'Show password'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </button>
          </div>
          <!-- Message shown for Create Password -->
          <div class="general-error-alert" *ngIf="passwordError" role="alert">
            {{ passwordError }}
          </div>
          <div class="pw-rule-hint" *ngIf="!passwordError">At least 8 characters, with a letter and a number.</div>

          <!-- Confirm Password -->
          <label class="field-label" for="su-confirm">Confirm Password</label>
          <div class="input-wrapper pw-wrapper" [class.input-error]="confirmError">
            <input
              id="su-confirm"
              name="confirm"
              [type]="showConfirmPassword ? 'text' : 'password'"
              autocomplete="new-password"
              [(ngModel)]="confirm"
              (input)="confirmError = ''"
              required
              placeholder="Re-enter password">
            <button
              type="button"
              class="suffix-icon-btn"
              (click)="showConfirmPassword = !showConfirmPassword"
              [title]="showConfirmPassword ? 'Hide password' : 'Show password'">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </button>
          </div>
          <!-- Message shown for Confirm Password -->
          <div class="general-error-alert" *ngIf="confirmError" role="alert">
            {{ confirmError }}
          </div>

          <!-- General Error Alert -->
          <div class="general-error-alert" *ngIf="error" role="alert">
            {{ error }}
          </div>

          <!-- Create Account Submit Button in Royal Blue -->
          <button
            type="submit"
            class="btn-login-main mt-4"
            [disabled]="busy || !name || !email || !password || !confirm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
              <circle cx="8.5" cy="7" r="4"></circle>
              <line x1="20" y1="8" x2="20" y2="14"></line>
              <line x1="23" y1="11" x2="17" y2="11"></line>
            </svg>
            <span>{{ busy ? 'Creating account…' : 'Create Account' }}</span>
          </button>

          <!-- Back to Login Button -->
          <button
            type="button"
            class="btn-back-login"
            (click)="setMode('signin')">
            ← Back to Login
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [`
    .page-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
      background: #eef4fc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    }

    .login-card {
      width: 100%;
      max-width: 375px;
      background: #ffffff;
      border: 1px solid rgba(219, 234, 254, 0.85);
      border-radius: 26px;
      padding: 2.2rem 1.85rem 1.7rem;
      box-shadow: 0 16px 42px rgba(37, 99, 235, 0.08);
      display: flex;
      flex-direction: column;
      gap: 0.55rem;
      box-sizing: border-box;
    }

    .brand-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      margin-bottom: 0.85rem;
    }
    .brand-icon { flex-shrink: 0; }
    .brand-title {
      font-size: 1.55rem;
      font-weight: 800;
      color: #0f172a;
      letter-spacing: -0.025em;
    }

    .mode-sub {
      text-align: center;
      font-size: 0.88rem;
      color: #64748b;
      margin: -0.4rem 0 0.6rem;
    }

    .field-label {
      display: block;
      font-size: 0.82rem;
      font-weight: 700;
      color: #0f172a;
      margin-top: 0.45rem;
      margin-bottom: 0.35rem;
    }

    .pw-label-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 0.45rem;
      margin-bottom: 0.35rem;
    }
    .pw-label-bar .field-label { margin: 0; }
    .inline-gen-btn {
      background: none;
      border: none;
      color: #2563eb;
      font-size: 0.78rem;
      font-weight: 700;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 0;
    }
    .inline-gen-btn:hover { text-decoration: underline; color: #1d4ed8; }

    .input-wrapper {
      display: flex;
      align-items: center;
      background: #f8fafc;
      border: 1.5px solid #dbeafe;
      border-radius: 12px;
      overflow: hidden;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .input-wrapper:focus-within {
      border-color: #2563eb;
      background: #ffffff;
      box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.15);
    }
    .input-wrapper.input-error {
      border-color: #ef4444;
      box-shadow: 0 0 0 1px #ef4444;
    }

    .prefix-icon {
      padding: 0 0.5rem 0 0.85rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #2563eb;
    }
    .icon-divider {
      width: 1px;
      height: 20px;
      background: #e2e8f0;
      margin-right: 0.35rem;
    }

    .input-wrapper input {
      flex: 1;
      width: 100%;
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      background: transparent !important;
      padding: 0.7rem 0.85rem;
      font-size: 0.92rem;
      color: #0f172a;
      box-sizing: border-box;
    }
    .input-wrapper input:focus,
    .input-wrapper input:active {
      border: none !important;
      outline: none !important;
      box-shadow: none !important;
      background: transparent !important;
    }
    .input-wrapper input::-ms-reveal,
    .input-wrapper input::-ms-clear {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
      pointer-events: none !important;
    }
    .input-wrapper input::placeholder {
      color: #94a3b8;
    }

    .eye-toggle-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.6rem 0.4rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
    }
    .eye-toggle-btn:hover { color: #1e293b; }

    .lock-badge {
      padding: 0.6rem 0.75rem 0.6rem 0.35rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #2563eb;
    }

    .suffix-icon-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 0.6rem 0.85rem;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #2563eb;
    }
    .suffix-icon-btn:hover { color: #1d4ed8; }

    .email-error-text {
      color: #dc2626;
      font-size: 0.82rem;
      font-weight: 500;
      margin-top: 0.35rem;
      margin-bottom: 0.2rem;
    }
    .pw-rule-hint {
      font-size: 0.72rem;
      color: #64748b;
      margin-top: 0.2rem;
    }

    .password-generated-section {
      margin-top: 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      animation: fadeIn 0.2s ease-in-out;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .blue-card-password {
      background: #eff6ff;
      border: 1.5px solid #bfdbfe;
      border-radius: 12px;
      padding: 0.65rem 0.85rem;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      color: #1d4ed8;
      font-size: 0.9rem;
      font-weight: 700;
      word-break: break-all;
    }
    .blue-card-password .pw-val {
      font-family: monospace;
      font-size: 0.96rem;
      letter-spacing: 0.04em;
    }
    .btn-copy-tiny {
      background: #dbeafe;
      border: 1px solid #bfdbfe;
      border-radius: 6px;
      padding: 0.15rem 0.4rem;
      font-size: 0.75rem;
      cursor: pointer;
      margin-left: 4px;
    }
    .btn-copy-tiny:hover { background: #bfdbfe; }

    .green-card-notice {
      background: #ecfdf5;
      border: 1.5px solid #a7f3d0;
      border-radius: 12px;
      padding: 0.65rem 0.85rem;
      text-align: center;
      color: #065f46;
      font-size: 0.84rem;
      font-weight: 600;
      line-height: 1.35;
    }

    .general-error-alert {
      margin-top: 0.5rem;
      padding: 0.55rem 0.75rem;
      border-radius: 8px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      font-size: 0.82rem;
      line-height: 1.4;
    }

    /* Row 1 Actions: Login on left & Dashed Generate Password on right */
    .actions-row {
      display: flex;
      gap: 10px;
      margin-top: 0.95rem;
      width: 100%;
    }

    .btn-login-half {
      flex: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0.72rem 0.85rem;
      font-size: 0.94rem;
      font-weight: 700;
      border-radius: 12px;
      border: none;
      cursor: pointer;
      background: #2563eb;
      color: #ffffff;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.28);
      transition: background 0.15s ease;
    }
    .btn-login-half.full-width {
      width: 100%;
    }
    .btn-login-half:hover:not(:disabled) {
      background: #1d4ed8;
    }
    .btn-login-half:disabled {
      background: #93c5fd;
      box-shadow: none;
      cursor: default;
    }

    /* Dashed button: ONLY says "Generate Password" with gear icon */
    .btn-generate-dashed-half {
      flex: 1.15;
      padding: 0.72rem 0.65rem;
      background: #eff6ff;
      border: 1.5px dashed #2563eb;
      border-radius: 12px;
      color: #1d4ed8;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      font-size: 0.86rem;
      font-weight: 700;
      white-space: nowrap;
      animation: fadeIn 0.15s ease-in-out;
      transition: background 0.15s ease;
    }
    .btn-generate-dashed-half:hover {
      background: #dbeafe;
    }
    .gen-ico {
      flex-shrink: 0;
    }

    /* Row 2: Full width Create an Account button */
    .btn-create-account-full {
      margin-top: 0.65rem;
      width: 100%;
      padding: 0.72rem;
      background: #ffffff;
      border: 1.5px solid #dbeafe;
      border-radius: 12px;
      color: #2563eb;
      font-size: 0.92rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .btn-create-account-full:hover {
      background: #eff6ff;
      border-color: #bfdbfe;
    }

    /* Footer Row: Forgot password? on left, Reset on right */
    .footer-row {
      margin-top: 0.85rem;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .forgot-link {
      background: none;
      border: none;
      color: #2563eb;
      font-size: 0.82rem;
      font-weight: 600;
      cursor: pointer;
      padding: 0;
    }
    .forgot-link:hover {
      text-decoration: underline;
    }
    .reset-link-btn {
      background: none;
      border: none;
      color: #334155;
      font-size: 0.86rem;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 0;
    }
    .reset-link-btn:hover {
      color: #0f172a;
    }

    .btn-login-main {
      width: 100%;
      padding: 0.72rem;
      border: none;
      border-radius: 12px;
      background: #2563eb;
      color: #ffffff;
      font-size: 0.94rem;
      font-weight: 700;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 7px;
    }
    .mt-4 { margin-top: 1rem; }
    .btn-back-login {
      margin-top: 0.65rem;
      width: 100%;
      padding: 0.68rem;
      border: 1.5px solid #dbeafe;
      border-radius: 12px;
      background: #ffffff;
      color: #334155;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .btn-back-login:hover { background: #f8fafc; }
  `]
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);

  mode: 'signin' | 'signup' = 'signin';

  name = '';
  email = '';
  password = '';
  confirm = '';
  showPassword = false;
  showConfirmPassword = false;

  busy = false;
  emailError = '';
  passwordError = '';
  confirmError = '';
  nameError = '';
  error = '';
  generatedPassword = '';
  copied = false;

  get hasEmail(): boolean {
    return !!(this.email && this.email.trim().length > 0);
  }

  get isLoginActive(): boolean {
    return !!(this.hasEmail && this.password?.trim());
  }

  constructor() {
    if (this.auth.isLoggedIn()) {
      this.router.navigateByUrl('/dashboard');
    }
  }

  setMode(m: 'signin' | 'signup'): void {
    this.mode = m;
    this.error = '';
    this.emailError = '';
    this.passwordError = '';
    this.confirmError = '';
    this.nameError = '';
    this.password = '';
    this.confirm = '';
    this.generatedPassword = '';
  }

  onSignupPasswordChange(): void {
    if (this.passwordError) {
      if (this.password.length >= 8 && /[A-Za-z]/.test(this.password) && /\d/.test(this.password)) {
        this.passwordError = '';
      }
    }
  }

  onEmailChange(): void {
    if (this.hasEmail) {
      this.emailError = '';
    } else {
      this.generatedPassword = '';
    }
  }

  onPasswordInput(): void {
    this.error = '';
  }

  onForgotPasswordClick(): void {
    if (!this.hasEmail) {
      this.emailError = 'Enter your work email first';
      return;
    }
    this.onGenerateClick();
  }

  copyPassword(): void {
    if (!this.generatedPassword) return;
    try {
      navigator.clipboard.writeText(this.generatedPassword);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2500);
    } catch {}
  }

  async onGenerateClick(): Promise<void> {
    this.error = '';
    this.emailError = '';

    if (!this.hasEmail) {
      this.emailError = 'Enter your work email first';
      return;
    }

    const cleanEmail = this.email.trim().toLowerCase();

    // Guard: Only for regular users, not for Admin
    if (this.auth.isUserAdmin(cleanEmail)) {
      this.error = 'Password generation is only available for regular users, not for Admin. Admin must use their master password.';
      return;
    }

    this.busy = true;
    try {
      const res = await this.auth.generateUserPassword(cleanEmail);
      if (!res.success || !res.password) {
        this.error = res.error || 'Could not generate password.';
        return;
      }

      this.generatedPassword = res.password;
      this.password = res.password;

      try {
        await navigator.clipboard.writeText(res.password);
      } catch {}
    } catch (e: any) {
      this.error = e?.message || 'Password generation failed.';
    } finally {
      this.busy = false;
    }
  }

  resetForm(): void {
    this.email = '';
    this.password = '';
    this.name = '';
    this.confirm = '';
    this.emailError = '';
    this.passwordError = '';
    this.confirmError = '';
    this.nameError = '';
    this.error = '';
    this.generatedPassword = '';
    this.copied = false;
    this.showPassword = false;
    this.showConfirmPassword = false;
  }

  async submit(): Promise<void> {
    if (this.busy) return;
    this.error = '';
    this.emailError = '';
    this.passwordError = '';
    this.confirmError = '';
    this.nameError = '';

    if (this.mode === 'signup') {
      if (!this.name || this.name.trim().length < 2) {
        this.nameError = 'Please enter your full name.';
        return;
      }
      if (!this.email || !this.email.trim()) {
        this.emailError = 'Please enter your work email.';
        return;
      }
      if (!this.password || this.password.length < 8 || !/[A-Za-z]/.test(this.password) || !/\d/.test(this.password)) {
        this.passwordError = 'Use a password of at least 8 characters with a letter and a number.';
        return;
      }
      if (this.password !== this.confirm) {
        this.confirmError = 'The two passwords do not match.';
        return;
      }
    } else {
      if (!this.hasEmail) {
        this.emailError = 'Enter your work email first';
        return;
      }
      if (!this.password) {
        this.error = 'Please enter your password.';
        return;
      }
    }

    this.busy = true;
    try {
      const err = this.mode === 'signin'
        ? await this.auth.login(this.email, this.password)
        : await this.auth.register(this.name, this.email, this.password);

      if (err) {
        const lower = err.toLowerCase();
        if (lower.includes('password') || lower.includes('characters')) {
          this.passwordError = err;
        } else if (lower.includes('email')) {
          this.emailError = err;
        } else if (lower.includes('name')) {
          this.nameError = err;
        } else {
          this.error = err;
        }
        return;
      }
      this.router.navigateByUrl('/dashboard');
    } catch (e: any) {
      this.error = e?.message || (this.mode === 'signin' ? 'Sign-in failed.' : 'Account creation failed.');
    } finally {
      this.busy = false;
    }
  }
}
