import { useState, useEffect, useRef } from 'react';
import { cacheGet, cacheSet } from '../services/appCache';

export function useSupabaseCache<T>(key: string, initialValue: T): [T, (val: T) => void] {
  const [value, setValue] = useState<T>(initialValue);
  const loaded = useRef(false);

  useEffect(() => {
    cacheGet<T>(key).then(v => {
      if (v !== null) setValue(v);
      loaded.current = true;
    });
  }, [key]);

  function set(newVal: T) {
    setValue(newVal);
    cacheSet(key, newVal);
  }

  return [value, set];
}
