import { useState, useEffect, useRef, useCallback } from 'react';
import { cacheGet, cacheSet } from '../services/appCache';

export function useSupabaseCache<T>(key: string, initialValue: T): [T, (val: T) => void, boolean] {
  const [value, setValue] = useState<T>(initialValue);
  const [loaded, setLoaded] = useState(false);
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
    setLoaded(false);
    cacheGet<T>(key).then(v => {
      if (keyRef.current === key) {
        if (v !== null) setValue(v);
        setLoaded(true);
      }
    });
  }, [key]);

  // useCallback is CRITICAL here — without it, every render creates a new `set` reference,
  // which destabilises handleSync's useCallback deps, which causes the sync useEffect to
  // fire on every render (infinite loop that repeatedly overwrites revenue with $0).
  const set = useCallback((newVal: T) => {
    setValue(newVal);
    cacheSet(key, newVal);
  }, [key]);

  return [value, set, loaded];
}
