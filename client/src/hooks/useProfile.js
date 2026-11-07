import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchProfile } from '../services/profileService.js';
import { toApiError } from '../services/apiError.js';

/** Loads the signed-in user's profile and the option lists. */
export function useProfile() {
  const [state, setState] = useState({ status: 'loading', profile: null, options: null, error: null });
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latestRequest.current;
    setState((current) => ({ ...current, status: current.profile ? 'refreshing' : 'loading', error: null }));
    try {
      const { profile, options } = await fetchProfile();
      if (id !== latestRequest.current) return;
      setState({ status: 'ready', profile, options, error: null });
    } catch (err) {
      if (id !== latestRequest.current) return;
      setState((current) => ({ ...current, status: 'error', error: toApiError(err) }));
    }
  }, []);

  useEffect(() => {
    load();
    return () => {
      latestRequest.current += 1; // ignore results that arrive after unmount
    };
  }, [load]);

  const setProfile = useCallback((profile) => {
    setState((current) => ({ ...current, profile, status: 'ready', error: null }));
  }, []);

  return { ...state, reload: load, setProfile };
}
