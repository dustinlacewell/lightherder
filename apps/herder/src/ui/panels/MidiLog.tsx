/* The MIDI monitor — a scrolling log of incoming CC messages, so a
   controller's knob can be identified by ear (turn it, watch a line
   appear) before or without using per-knob learn mode. */

import { useEffect, useRef, useState } from 'react';
import * as midi from '../../midi';
import { addShield } from '../../runtime';

function sourceLabel(kind: midi.MidiLogEntry['kind'], num: number): string {
  switch (kind) {
    case 'cc': return `CC${num}`;
    case 'pad': return `pad${num}`;
    case 'note': return `note${num}`;
    default: return `?${num}`;
  }
}

export function MidiLog({ onClose }: { onClose: () => void }) {
  const [, bump] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const entries = midi.midiLog();
  const lastId = entries.at(-1)?.id;

  /* a turning knob streams hundreds of CCs a second — coalesce them
     into at most one re-render per animation frame */
  useEffect(() => {
    let raf = 0;
    const off = midi.watchLog(() => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; bump(x => x + 1); });
    });
    return () => { off(); if (raf) cancelAnimationFrame(raf); };
  }, []);
  useEffect(() => {
    const el = bodyRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);

  return (
    <aside className="midilog" ref={el => { if (el) addShield(el); }}>
      <header className="midilog-head">
        <span className="dev-name">MIDI log</span>
        <button className="dev-btn nodrag" title="Clear the log" onClick={() => midi.clearLog()}>⟲</button>
        <button className="dev-btn nodrag" title="Close" onClick={onClose}>×</button>
      </header>
      <div className="midilog-body" ref={bodyRef}>
        {entries.length === 0 && <div className="midilog-empty">waiting for MIDI…</div>}
        {entries.map(e => (
          <div key={e.id} className={`midilog-row${e.learned ? ' learned' : ''}${e.targets.length ? ' matched' : ''}`}>
            <span className="midilog-ch">ch{e.channel + 1}</span>
            <span className="midilog-cc">{sourceLabel(e.kind, e.num)}</span>
            <span className="midilog-val">{e.value}</span>
            <span className="midilog-target">{e.learned ? `learned → ${e.targets[0]}` : e.targets.join(', ')}</span>
          </div>
        ))}
      </div>
    </aside>
  );
}
