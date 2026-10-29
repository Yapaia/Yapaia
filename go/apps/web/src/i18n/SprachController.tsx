import { useEffect } from 'react';
import { spracheHolen } from './index.js';

const TAKT_MS = 60_000;

/** Holt die Sprache beim Start und danach jede Minute (i18n/index.ts). */
export default function SprachController(): null {
  useEffect(() => {
    void spracheHolen();
    const t = window.setInterval(() => void spracheHolen(), TAKT_MS);
    return () => window.clearInterval(t);
  }, []);
  return null;
}
