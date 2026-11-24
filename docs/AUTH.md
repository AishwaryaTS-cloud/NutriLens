# Authentication: email codes and Google sign-in

NutriLens signs people in with **email + password** (as before), **email codes** (a 6-digit code, no
password) and **Google**. All three end the same way: the same JWT in the same HTTP-only cookie, so
protected routes, logout and old sessions work exactly as they did.

> Free-tier limits and provider rules change. Figures here were checked in November 2026; confirm on
> each provider's own page before relying on a number.

## How it works

| Flow | Steps |
|---|---|
| **Sign up** | `POST /api/auth/register` validates the details, emails a code and creates **nothing**. `POST /api/auth/register/verify` with the right code creates the already-verified account and signs in. `POST /api/auth/register/resend` sends a new code. |
| **Email-code login** | `POST /api/auth/otp/request` (always answers the same, whether or not the email has an account; a code is sent only if it does) then `POST /api/auth/otp/verify`. Never creates accounts. |
| **Google** | `GET /api/auth/google/nonce`, then Google's button returns an ID token, then `POST /api/auth/google`. |
| **Google + existing unverified account** | The server emails a code first; `POST /api/auth/google/link/verify` completes the link. A password never counts as proof of the inbox. |

### Code rules
- 6 digits from the operating system's CSPRNG; valid **5 minutes**; **single use** (deleted atomically when used).
- Stored only as **HMAC-SHA-256** keyed with `OTP_SECRET`, bound to the email and purpose. Never stored or returned in plaintext, never logged.
- **5 wrong guesses** destroy the code. **60-second** resend cooldown (enforced on the server).
- Rate limits: per IP, per email per hour, one send per minute per email, and per-IP / per-email limits on checking codes. Email limits apply whether or not the account exists.
- A MongoDB TTL index removes expired challenges; expiry is also checked exactly on every use.

### Google rules
- Google Identity Services returns a signed **ID token**; the server verifies it with `google-auth-library` (signature, issuer, audience = your client ID, expiry), then checks `email_verified === true` and the **nonce**.
- The nonce is random, single-use, expires after 10 minutes, is bound to the browser by an HTTP-only cookie and stored only as a hash, so a stolen token cannot be replayed.
- Only the scopes `openid email profile` are used. **There is no client secret in this flow**, and nothing secret is in the browser.
- Linking policy:
  - Google id already linked: sign in.
  - New email: create a verified, passwordless account.
  - Existing account with a **verified** email: link (both sides proved the same inbox). The password keeps working.
  - Existing account with an **unverified** email (for example one created before email codes existed): **do not link** until the owner enters a code emailed to that address.
  - Existing account linked to a *different* Google account: refused (409).

### Existing users
Nothing is migrated or deleted. Old accounts load with safe defaults (`emailVerified: false`, no `googleId`) and keep their password hash, profile, preferences and saved scans. Old session cookies stay valid (the token format is unchanged). A legacy account becomes verified the first time its owner proves the inbox (an email-code login or a confirmed Google link).

## 1. Gmail App Password (local development)
1. Sign in to the Google account that will send the emails. Turn on **2-Step Verification** (Google Account > Security).
2. Open **App passwords** (Google Account > Security, or search "App passwords"). If you don't see it, 2-Step Verification is off, the account is managed by an organisation that disabled it, or it uses Advanced Protection.
3. Create one (name it "NutriLens"). Google shows a 16-character password in four groups. Copy it.
4. In `.env`:
   ```
   EMAIL_PROVIDER=gmail
   EMAIL_FROM=you@gmail.com
   SMTP_USER=you@gmail.com
   SMTP_PASS=abcd efgh ijkl mnop
   OTP_SECRET=<48+ random characters>
   ```
Limits and honesty: a personal Gmail account is limited to roughly **500 emails a day** (check Google's current number), the mail is sent as your Gmail address, and **Render's free web services block SMTP ports (25, 465, 587)**, so this will time out there. Use Brevo in production.

## 2. Brevo account and sender verification (production)
1. Create a free account at brevo.com (no credit card; new accounts may be reviewed before sending is enabled).
2. **Senders, Domains & Dedicated IPs > Senders**: add the address you want to send from and click the verification link Brevo emails you. Without a domain you own, you can verify a Gmail address, but Brevo then sends it through its own domain, which can look less trustworthy and is more likely to reach spam. Authenticating your own domain (SPF/DKIM) gives the best deliverability.
3. Free plan: about **300 emails a day** (check the current number), shared by every code you send.

## 3. Brevo API key
1. **SMTP & API > API Keys > Generate a new API key**. Copy it immediately (Brevo shows it once).
2. Set it on your host as an environment variable (never in code or Git):
   ```
   EMAIL_PROVIDER=brevo
   EMAIL_FROM=<your verified sender>
   BREVO_API_KEY=<the key>
   OTP_SECRET=<48+ random characters>
   ```
The app calls `https://api.brevo.com/v3/smtp/email` over HTTPS (port 443), which Render's free tier allows.

## 4-7. Google Cloud: project, consent screen, client ID, origins
Free; no billing account is needed for sign-in.
1. <https://console.cloud.google.com/> > create a project (for example "NutriLens").
2. **Google Auth Platform / OAuth consent screen**: user type **External**; app name, support email and developer contact email. Scopes: only `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` (the defaults). These basic scopes need **no Google verification review**.
3. **Publishing status**: in **Testing**, only the test users you list can sign in and Google shows a "not verified" warning. Switch to **In production** so anyone can use it. With only the basic scopes this does not require a review, although Google may ask you to verify your app's branding before showing your logo/name.
4. **Credentials > Create credentials > OAuth client ID > Web application**.
5. **Authorized JavaScript origins** (no paths, no trailing slash): `http://localhost:5173` for development and your deployed frontend origin, e.g. `https://your-app.pages.dev`. **Authorized redirect URIs: leave empty** (this flow uses a button callback, not a redirect).
6. Copy the **Client ID** into both `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (frontend build). Do **not** create or use a client secret.

If you add a CSP header to the frontend host later, allow `https://accounts.google.com/gsi/` for scripts, frames, styles and connections.

## 8. Local setup
```
cp .env.example .env          # then fill in MONGODB_URI, JWT_SECRET, and the sections above
npm install
npm run dev                   # API on :4000, Vite on :5173 (proxies /api)
```
Without `EMAIL_PROVIDER` the app still starts: password login works and the email-code screens report that codes are unavailable. Without `GOOGLE_CLIENT_ID`/`VITE_GOOGLE_CLIENT_ID` the Google button is simply hidden. Restart Vite after changing a `VITE_` variable.

## 9. Production setup (Render + a static host)
- Server env: everything above, plus `NODE_ENV=production`, `CLIENT_ORIGIN=<frontend origin>`, `COOKIE_SECURE=true`, and **`TRUST_PROXY=1`** (one proxy hop on Render). Without it every visitor shares the proxy's address and the IP rate limits would lock everyone out together.
- Frontend build env: `VITE_API_BASE_URL`, `VITE_GOOGLE_CLIENT_ID`.
- If the frontend and API are on **different sites**, cookies need `COOKIE_SAME_SITE=none` + `COOKIE_SECURE=true`, and browsers that block third-party cookies will block the login cookie (this was already true before). A custom domain with both on the same site avoids it.
- Add your production origin to the Google client's Authorized JavaScript origins.

## 10. Test email codes
1. Configure a provider, start the app, open `/register`, fill the form and press **Continue**.
2. Check the inbox (and spam). Enter the code, then you land on onboarding.
3. Log out; on `/login` choose **Email code**, enter the address, enter the code.
4. Try the edges: wrong code (clear message), five wrong codes (must request a new one), wait for the countdown to resend, use an old code after resending (fails), wait 5 minutes (expires).

## 11. Test Google sign-in
1. With the client ID set and `http://localhost:5173` in the authorized origins, open `/login` and press **Continue with Google**.
2. New Google account: you land on onboarding. Signing in again: dashboard.
3. Linking: register by email, verify, log out, then use Google with the same address: it links automatically (verified email). To see the confirmation-code path you need an account whose email was never verified (created before this feature).
4. In **Testing** status, add your Google account under Test users first.

## 12. Troubleshooting
| Symptom | Likely cause and fix |
|---|---|
| "Email codes aren't available" (`EMAIL_UNAVAILABLE`) | `EMAIL_PROVIDER` / `OTP_SECRET` missing or invalid. The server log says which variable. |
| Server refuses to start naming `SMTP_PASS`, `OTP_SECRET`, ... | The variable is missing or malformed. Values are never printed. |
| Gmail: authentication failed / 535 | Normal password used instead of an App Password, 2-Step Verification off, or `SMTP_USER` differs from `EMAIL_FROM`. |
| Works locally, times out on Render | SMTP ports are blocked on Render's free tier. Switch to `EMAIL_PROVIDER=brevo`. |
| Brevo 401/403 in the server log (`brevo_http:401`) | Wrong API key, sender not verified, or the account is not yet activated. |
| Codes arrive in spam | Expected with a Gmail sender through Brevo or a new sender. Authenticate your own domain. |
| "Too many attempts" for everyone in production | `TRUST_PROXY` is not set, so all visitors share one address. |
| No Google button | `VITE_GOOGLE_CLIENT_ID` missing at **build** time (rebuild/restart), or the Google script is blocked by an extension or CSP. |
| Google error `origin_mismatch` / "not a valid origin" | The exact page origin is not in Authorized JavaScript origins. |
| "Google sign-in didn't complete" (`GOOGLE_NONCE_INVALID`) | The nonce cookie was blocked or expired (10 minutes), or cookies are cross-site; see the production cookie note. |
| Google works for you but not for others | The consent screen is in Testing status: publish it or add them as test users. |

## What is tested, and what is not
- Automated server and client tests, including security properties (single-use, expiry, attempt limits, replay, forged and expired tokens, wrong audience/issuer, unverified email, unsafe linking).
- Google token checks run the **real** `google-auth-library` against tokens signed with locally generated keys.
- Browser tests drive the real UI with a mocked API and a **stub** of Google's script.
- Not tested here: real email delivery (Gmail/Brevo), a real Google sign-in, and the MongoDB integration tests in `server/tests/otpDb.test.js` (they need `TEST_MONGODB_URI`; see that file).

## Known limitations
- Rate-limit counters are in memory: they reset when the server restarts and are not shared between instances.
- JWT sessions cannot be revoked server-side (as before).
- A legacy account created by someone else with *your* email and a password they chose keeps that password after you verify the inbox (the same "pre-hijacking" risk any app has when verification is added later). Brand-new accounts cannot be pre-registered, because nothing exists until the email is verified.
- Free-tier email quotas apply to every code sent.
