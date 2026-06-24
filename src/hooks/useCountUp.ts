import { useEffect, useRef, useState } from "react";

type UseCountUpOptions = {
  durationMs?: number;
  /** Animate from 0 on first mount instead of from previous value. */
  fromZeroOnMount?: boolean;
};

/**
 * Lightweight count-up animation without external deps.
 * Animates whenever `target` changes.
 */
export function useCountUp(target: number, opts: UseCountUpOptions = {}) {
  const { durationMs = 650, fromZeroOnMount = true } = opts;
  const [value, setValue] = useState<number>(() => (fromZeroOnMount ? 0 : target));
  const rafRef = useRef<number | null>(null);
  const prevRef = useRef<number>(fromZeroOnMount ? 0 : target);
  const mountedRef = useRef(false);

  useEffect(() => {
    const start = mountedRef.current ? prevRef.current : (fromZeroOnMount ? 0 : target);
    const end = Number.isFinite(target) ? target : 0;
    const startTime = performance.now();

    mountedRef.current = true;
    prevRef.current = end;

    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const tick = (now: number) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (end - start) * eased;
      setValue(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, fromZeroOnMount]);

  return value;
}
