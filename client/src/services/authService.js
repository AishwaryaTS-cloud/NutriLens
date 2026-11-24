import { api } from './api.js';

/** Calls that sign someone in return the public user object ({ id, name, email, createdAt }). */

// ---------- Registration with an email code (two steps; no account exists until step 2) ----------

/** Step 1: validates the details and emails a six-digit code. Returns { email, expiresInSeconds, resendAvailableInSeconds }. */
export async function startRegistration({ name, email, password }) {
  const { data } = await api.post('/auth/register', { name, email, password });
  return data;
}

export async function resendRegistrationCode(email) {
  const { data } = await api.post('/auth/register/resend', { email });
  return data;
}

/** Step 2: the right code creates the verified account and starts the session. */
export async function verifyRegistration({ email, code }) {
  const { data } = await api.post('/auth/register/verify', { email, code });
  return data.user;
}

// ---------- Password login (unchanged) ----------

export async function login({ email, password }) {
  const { data } = await api.post('/auth/login', { email, password });
  return data.user;
}

// ---------- Passwordless login with an email code ----------

/** The answer is the same whether or not the email has an account. */
export async function requestLoginCode(email) {
  const { data } = await api.post('/auth/otp/request', { email });
  return data;
}

export async function verifyLoginCode({ email, code }) {
  const { data } = await api.post('/auth/otp/verify', { email, code });
  return data.user;
}

// ---------- Google ----------

/** A single-use nonce (the server also sets a cookie) that Google puts inside the ID token. */
export async function fetchGoogleNonce() {
  const { data } = await api.get('/auth/google/nonce');
  return data.nonce;
}

/**
 * Sends Google's ID token to the server, which verifies it.
 * Returns { user, isNewUser } when signed in, or { verification } when an existing account's
 * email must be confirmed with a code before Google can be linked.
 */
export async function signInWithGoogle(credential) {
  const { data, status } = await api.post('/auth/google', { credential });
  if (status === 202) return { verification: data };
  return { user: data.user, isNewUser: Boolean(data.isNewUser) };
}

export async function resendGoogleLinkCode(email) {
  const { data } = await api.post('/auth/google/link/resend', { email });
  return data;
}

export async function verifyGoogleLink({ email, code }) {
  const { data } = await api.post('/auth/google/link/verify', { email, code });
  return data.user;
}

export async function logout() {
  await api.post('/auth/logout');
}

export async function fetchCurrentUser() {
  const { data } = await api.get('/auth/me');
  return data.user;
}
