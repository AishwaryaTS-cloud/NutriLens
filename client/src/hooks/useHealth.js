import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchHealth } from '../services/healthService.js';
import { deriveConnectionView } from './healthView.js';

const RETRY_DELAY_MS = 1500;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function useHealth() {
  const [result, setResult] = useState(null); // { health, latencyMs }
  const [isError, setIsError] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [elapsedMs, setElapsedMs] = useState(0);
  const latestRequest = useRef(0);

  const load = useCallback(async () => {
    const id = ++latestRequest.current;
    setIsFetching(true);
    setIsError(false);

    // One quick retry smooths over a momentary failure while the API is starting.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const next = await fetchHealth();
        if (id !== latestRequest.current) return;
        setResult(next);
        setIsFetching(false);
        return;
      } catch {
        if (id !== latestRequest.current) return;
        if (attempt === 0) await wait(RETRY_DELAY_MS);
        if (id !== latestRequest.current) return;
      }
    }
    setIsError(true);
    setIsFetching(false);
  }, []);

  useEffect(() => {
    load();
    return () => {
      latestRequest.current += 1; // ignore results that arrive after unmount
    };
  }, [load]);

  // While the very first check is pending, track how long it has taken.
  useEffect(() => {
    if (!isFetching || result) return undefined;
    const startedAt = Date.now();
    setElapsedMs(0);
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 500);
    return () => clearInterval(timer);
  }, [isFetching, result]);

  const view = deriveConnectionView({ isError, health: result?.health, elapsedMs });

  return {
    view,
    health: result?.health,
    latencyMs: result?.latencyMs,
    isFetching,
    recheck: load,
  };
}
