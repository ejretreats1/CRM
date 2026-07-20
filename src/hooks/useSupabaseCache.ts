import { useState, useEffect, useRef } from 'react';
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

  function set(newVal: T) {
    setValue(newVal);
    cacheSet(key, newVal);
  }

  return [value, set, loaded];
}
