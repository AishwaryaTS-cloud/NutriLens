import { useCallback, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { toApiError } from '../services/apiError.js';
import { authErrorMessage } from './otp.js';

/**
 * Shared by the Login and Register pages: hands Google's ID token to the server and reports what
 * happened. `onSignedIn(isNewUser)` when a session starts; `onVerification(info)` when an existing
 * account's email must first be confirmed with a code before Google can be linked.
 */
export function useGoogleAuth({ onSignedIn, onVerification }) {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleCredential = useCallback(
    async (credential) => {
      setBusy(true);
      setError('');
      try {
        const result = await loginWithGoogle(credential);
        if (result.verification) {
          setBusy(false);
          onVerification(result.verification);
        } else {
          onSignedIn(result.isNewUser);
        }
      } catch (err) {
        setError(authErrorMessage(toApiError(err)));
        setBusy(false);
      }
    },
    [loginWithGoogle, onSignedIn, onVerification],
  );

  return { handleCredential, busy, error, clearError: () => setError('') };
}
