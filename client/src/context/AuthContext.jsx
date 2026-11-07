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

  const register = useCallback(async (details) => {
    const user = await authApi.register(details);
    setState({ status: 'authenticated', user });
    return user;
  }, []);

  // If the request fails the error propagates and the user stays signed in, because the cookie
  // may still be valid.
  const logout = useCallback(async () => {
    await authApi.logout();
    setState(SIGNED_OUT);
  }, []);

  const value = useMemo(() => ({ ...state, login, register, logout }), [state, login, register, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
