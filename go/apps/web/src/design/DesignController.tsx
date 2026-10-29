import { useEffect } from 'react';
import { designHolen } from './design.js';

const TAKT_MS = 60_000;

/** Holt das Design-Schema beim Start und danach jede Minute (design.ts). */
export default function DesignController(): null {
  useEffect(() => {
    void designHolen();
    const t = window.setInterval(() => void designHolen(), TAKT_MS);
    return () => window.clearInterval(t);
  }, []);
  return null;
}
