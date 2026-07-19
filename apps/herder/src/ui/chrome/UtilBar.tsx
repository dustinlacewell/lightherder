/* Below the globals: the housekeeping actions (clear/new/copy/paste/
   midi) as a vertical strip of icon buttons, its own pane. */

import { useCallback, useState } from 'react';
import * as midi from '../../midi';

interface UtilBarProps {
  onClear: () => void;
  onNew: () => void;
  onCopy: () => Promise<boolean>;
  onPaste: () => Promise<boolean>;
  midiLogOpen: boolean;
  setMidiLogOpen: (v: boolean) => void;
  sessionOpen: boolean;
  setSessionOpen: (v: boolean) => void;
}

/* small glyphs for the top-right util bar — same stroke language as
   the device icons (KindIcon), just not device-shaped */
const UICON = { viewBox: '0 0 14 14', fill: 'none', stroke: 'currentColor', strokeWidth: 1.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
const ICONS = {
  clear: <svg {...UICON}><path d="M3 3.8 H11 M5 3.8 V2.4 H9 V3.8 M4 3.8 L4.6 11.2 A1 1 0 0 0 5.6 12.1 H8.4 A1 1 0 0 0 9.4 11.2 L10 3.8" /></svg>,
  new: <svg {...UICON}><rect x="2.5" y="1.5" width="9" height="11" rx="1" /><path d="M7 5.2 V9.8 M4.7 7.5 H9.3" /></svg>,
  copy: <svg {...UICON}><rect x="1.5" y="4.5" width="7.5" height="8" rx="1" /><path d="M4.5 4 V2.5 A1 1 0 0 1 5.5 1.5 H11 A1 1 0 0 1 12 2.5 V9 A1 1 0 0 1 11 10 H9.7" /></svg>,
  paste: <svg {...UICON}><rect x="2.5" y="2.8" width="9" height="10" rx="1" /><path d="M5.2 2.8 V1.8 A0.8 0.8 0 0 1 6 1 H8 A0.8 0.8 0 0 1 8.8 1.8 V2.8" /><path d="M4.8 6.6 H9.2 M4.8 8.8 H9.2 M4.8 11 H7.4" /></svg>,
  midi: <svg {...UICON}><circle cx="7" cy="7" r="5.3" /><circle cx="7" cy="4.4" r="0.75" fill="currentColor" stroke="none" /><circle cx="4.6" cy="8.6" r="0.75" fill="currentColor" stroke="none" /><circle cx="9.4" cy="8.6" r="0.75" fill="currentColor" stroke="none" /></svg>,
  /* two figures sharing a link — a live room */
  session: <svg {...UICON}><circle cx="4.4" cy="5" r="1.8" /><circle cx="9.6" cy="5" r="1.8" /><path d="M1.8 12 A2.6 2.6 0 0 1 7 12 M7 12 A2.6 2.6 0 0 1 12.2 12" /></svg>,
};

/* a button whose icon flashes ✓/✗ with its async outcome */
function FlashBtn({ icon, title, action }: { icon: keyof typeof ICONS; title: string; action: () => Promise<boolean> }) {
  const [state, setState] = useState<'' | 'ok' | 'err'>('');
  return (
    <button
      className={`ubtn${state === 'ok' ? ' lit' : ''}${state === 'err' ? ' err' : ''}`}
      title={title}
      onClick={async () => {
        const ok = await action();
        setState(ok ? 'ok' : 'err');
        setTimeout(() => setState(''), 900);
      }}
    >{state === 'ok' ? '✓' : state === 'err' ? '✗' : ICONS[icon]}</button>
  );
}

/* connects on first click (Web MIDI needs a user gesture); once
   connected, toggles the log panel. Right-click any bound knob to
   learn or unbind a CC. */
function MidiButton({ logOpen, setLogOpen }: { logOpen: boolean; setLogOpen: (v: boolean) => void }) {
  const [state, setState] = useState<'off' | 'on' | 'denied'>('off');
  const [count, setCount] = useState(0);
  const click = useCallback(async () => {
    if (state === 'off') {
      const ok = await midi.initMidi();
      setState(ok ? 'on' : 'denied');
      if (ok) setCount(midi.inputNames().length);
      return;
    }
    if (state === 'on') setLogOpen(!logOpen);
  }, [state, logOpen, setLogOpen]);
  return (
    <button
      className={`ubtn${state === 'on' ? ' lit' : ''}${state === 'denied' ? ' err' : ''}`}
      title={state === 'on'
        ? `MIDI connected — ${count} device${count === 1 ? '' : 's'}. Click to ${logOpen ? 'hide' : 'show'} the log. Right-click any knob to learn or unbind a CC.`
        : state === 'denied' ? 'MIDI unavailable — no Web MIDI support or access was refused'
        : 'Connect a MIDI controller'}
      onClick={click}
    >{ICONS.midi}{state === 'on' && <span className="ubtn-badge">{count}</span>}</button>
  );
}

export function UtilBar({ onClear, onNew, onCopy, onPaste, midiLogOpen, setMidiLogOpen, sessionOpen, setSessionOpen }: UtilBarProps) {
  return (
    <div className="utilbar">
      <button className="ubtn" title="Blank every screen (C)" onClick={onClear}>{ICONS.clear}</button>
      <button className="ubtn" title="Empty bench" onClick={onNew}>{ICONS.new}</button>
      <FlashBtn icon="copy" title="Copy the whole patch to the clipboard as JSON" action={onCopy} />
      <FlashBtn icon="paste" title="Replace the bench with a patch pasted from the clipboard" action={onPaste} />
      <MidiButton logOpen={midiLogOpen} setLogOpen={setMidiLogOpen} />
      <button
        className={`ubtn${sessionOpen ? ' lit' : ''}`}
        title={`${sessionOpen ? 'Hide' : 'Show'} the session panel — host or join a live room`}
        onClick={() => setSessionOpen(!sessionOpen)}
      >{ICONS.session}</button>
    </div>
  );
}
