import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import * as authApi from '../services/authService.js';

const AuthContext = createContext(null);

const SIGNED_OUT = { status: 'unauthenticated', user: null };

/**
 * Holds the signed-in user. The JWT itself lives in an HTTP-only cookie that JavaScript cannot
 * read, so on load we ask the server who we are (GET /api/auth/me).
 */
export function AuthProvider({ children }) {
  const [state, setState] = useState({ status: 'loading', user: null });

  useEffect(() => {
    let cancelled = false;
    authApi
      .fetchCurrentUser()
      .then((user) => {
        if (!cancelled) setState({ status: 'authenticated', user });
      })
      .catch(() => {
        if (!cancelled) setState(SIGNED_OUT);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (credentials) => {
    const user = await authApi.login(credentials);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  // Every sign-in method ends the same way: remember the user (the JWT is in the HTTP-only cookie).
  const establish = useCallback((user) => {
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  // Registration: step 1 only emails a code (nobody is signed in yet); step 2 signs in.
  const completeRegistration = useCallback(async (details) => establish(await authApi.verifyRegistration(details)), [establish]);
  const loginWithCode = useCallback(async (details) => establish(await authApi.verifyLoginCode(details)), [establish]);
  const completeGoogleLink = useCallback(async (details) => establish(await authApi.verifyGoogleLink(details)), [establish]);

  /** Resolves { user, isNewUser } when signed in, or { verification } when an emailed code is still needed. */
  const loginWithGoogle = useCallback(
    async (credential) => {
      const result = await authApi.signInWithGoogle(credential);
      if (result.user) establish(result.user);
      return result;
    },
    [establish],
  );

  // If the request fails the error propagates and the user stays signed in, because the cookie
  // may still be valid.
  const logout = useCallback(async () => {
    await authApi.logout();
    setState(SIGNED_OUT);
  }, []);

  // Lets the profile page refresh the signed-in user after a name change.
  const updateUser = useCallback((user) => {
    setState((current) => (current.status === 'authenticated' ? { ...current, user } : current));
  }, []);

  const value = useMemo(
    () => ({ ...state, login, completeRegistration, loginWithCode, loginWithGoogle, completeGoogleLink, logout, updateUser }),
    [state, login, completeRegistration, loginWithCode, loginWithGoogle, completeGoogleLink, logout, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
