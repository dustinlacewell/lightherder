/* The transport strip: the wordmark, and — under ?debug — Freeze,
   Step and the tick counter, the frame-surgery tools for developing
   the engine. Step while running freezes first, so one key takes you
   from live performance into frame surgery. */

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { clearAllScreens, engineRef, setFrozen as relayFrozen, stepOnce, transport } from '../../runtime';
import { sessionStore } from '../../session';

/* Freeze/Step are frame-surgery tools for developing the engine, not
   for performance — hide them unless ?debug is in the URL */
const DEBUG = new URLSearchParams(location.search).has('debug');

/** the freeze switch as React state, mirrored into the runtime */
export function useFreeze(): { frozen: boolean; setFrozen: (f: boolean) => void; stepTick: () => void } {
  const [frozen, setFrozenState] = useState(false);
  /* a REMOTE freeze flips transport.frozen through the ephemera relay,
     bumping the session version but not this local state — so re-read the
     runtime switch on every session-version change and mirror it into the
     button's lit state (invariant (e)). A no-op with no session (the version
     never bumps), and local toggles still drive setFrozenState directly. */
  const ver = useSyncExternalStore(sessionStore.subscribe, sessionStore.version);
  useEffect(() => { setFrozenState(transport.frozen); }, [ver]);
  /* the runtime setter both flips the switch and relays the ephemeron;
     React state mirrors it for the button's lit state */
  const setFrozen = useCallback((f: boolean) => { relayFrozen(f); setFrozenState(f); }, []);
  const stepTick = useCallback(() => {
    if (!transport.frozen) { relayFrozen(true); setFrozenState(true); }
    stepOnce();
  }, []);
  return { frozen, setFrozen, stepTick };
}

export function Transport({ frozen, setFrozen, stepTick }: {
  frozen: boolean; setFrozen: (f: boolean) => void; stepTick: () => void;
}) {
  const toggleFreeze = useCallback(() => setFrozen(!frozen), [setFrozen, frozen]);
  const clear = useCallback(() => clearAllScreens(), []);

  /* the tick counter — lap arithmetic in plain sight, debug only */
  const [ticks, setTicks] = useState(0);
  useEffect(() => {
    if (!DEBUG) return;
    const iv = setInterval(() => setTicks(engineRef.current?.ticks ?? 0), 120);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const el = e.target as HTMLElement;
      /* stepping must work even with a button focused (you just clicked Step) */
      if (e.key === '.') { stepTick(); return; }
      if (el.closest('input, textarea, .knob') || el.tagName === 'BUTTON') return;
      if (e.key.toLowerCase() === 'f') toggleFreeze();
      else if (e.key.toLowerCase() === 'c') clear();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [toggleFreeze, clear, stepTick]);

  return (
    <header className="transport">
      <h1 className="wordmark">
        Herder
        <span className="sub">inspired by <a href="https://www.thelightherder.com/" target="_blank" rel="noopener noreferrer">Dave Blair’s Light Herder</a></span>
      </h1>
      {DEBUG && (
        <button className={`tkey${frozen ? ' lit' : ''}`} title="Hold every loop still (F)" onClick={toggleFreeze}>Freeze</button>
      )}
      {DEBUG && (
        <button className="tkey" title="Advance exactly one video frame (.) — freezes first if running. One press = one hop of light through every device" onClick={stepTick}>Step</button>
      )}
      {DEBUG && (
        <span className="ticks" title="Video frames since boot — count a lap by stepping until a copy returns">{ticks}</span>
      )}
    </header>
  );
}
