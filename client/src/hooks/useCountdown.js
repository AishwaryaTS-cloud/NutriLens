import { useCallback, useEffect, useState } from 'react';
import { secondsUntil } from './otp.js';

/** Counts down whole seconds from a starting value; restart(n) begins again from n. */
export function useCountdown(initialSeconds = 0) {
  const [deadline, setDeadline] = useState(() => Date.now() + initialSeconds * 1000);
  const [remaining, setRemaining] = useState(initialSeconds);

  useEffect(() => {
    const tick = () => {
      const left = secondsUntil(deadline, Date.now());
      setRemaining(left);
      if (left === 0) clearInterval(id);
    };
    const id = setInterval(tick, 250);
    tick();
    return () => clearInterval(id);
  }, [deadline]);

  const restart = useCallback((seconds) => setDeadline(Date.now() + seconds * 1000), []);
  return { remaining, restart };
}
