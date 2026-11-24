import { useEffect, useRef, useState } from 'react';
import { fetchGoogleNonce } from '../services/authService.js';

/** The OAuth client ID is public by design (it is in every Google button). There is no client secret in this flow. */
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
export const isGoogleConfigured = Boolean(GOOGLE_CLIENT_ID);

const NONCE_REFRESH_MS = 8 * 60 * 1000; // the server's nonce lives 10 minutes; renew before it expires
let scriptPromise;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => {
      scriptPromise = undefined;
      reject(new Error('Google script failed to load'));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/**
 * "Continue with Google": Google's official button (Google Identity Services). Google returns a
 * signed ID token to onCredential(token); the server verifies it. Each sign-in uses a fresh
 * single-use nonce from our server, which is what stops a captured token from being replayed.
 */
export default function GoogleButton({ onCredential, disabled = false }) {
  const holder = useRef(null);
  const latest = useRef(onCredential);
  latest.current = onCredential;
  const [status, setStatus] = useState('loading'); // loading | ready | unavailable

  useEffect(() => {
    if (!isGoogleConfigured) return undefined;
    let cancelled = false;
    let timer;

    async function setup() {
      try {
        await loadGoogleScript();
        const nonce = await fetchGoogleNonce();
        if (cancelled || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          nonce,
          auto_select: false,
          callback: async (response) => {
            try {
              await latest.current(response.credential);
            } finally {
              if (!cancelled) setup(); // that nonce is spent: get a new one for the next attempt
            }
          },
        });
        holder.current.innerHTML = '';
        window.google.accounts.id.renderButton(holder.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.min(400, Math.max(200, Math.round(holder.current.parentElement?.clientWidth || 320))),
        });
        setStatus('ready');
        clearTimeout(timer);
        timer = setTimeout(() => !cancelled && setup(), NONCE_REFRESH_MS);
      } catch {
        if (!cancelled) setStatus('unavailable');
      }
    }

    setup();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!isGoogleConfigured) return null;
  return (
    <div className={`google-slot${disabled ? ' is-disabled' : ''}`}>
      <div ref={holder} className="google-slot__button" />
      {status === 'loading' && <span className="google-slot__loading">Loading Google sign-in…</span>}
      {status === 'unavailable' && (
        <p className="auth__note" role="status">
          Google sign-in isn’t available right now. You can still continue with your email.
        </p>
      )}
    </div>
  );
}
