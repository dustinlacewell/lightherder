/* The receive path — Web MIDI access and message decode. Every
   message is logged so the monitor really shows everything; CC and
   pad-pressure messages additionally feed learn mode and drive their
   bound targets. */

import { bindingFor, boundTargets, completeLearn } from './bindings';
import { pushLog } from './log';
import { resolveTarget } from './targets';
import type { MidiSourceKind } from './types';

/* status bytes we recognize; anything else (note on/off, pitch bend,
   channel pressure, sysex...) still gets logged so the monitor really
   shows everything, but can't be learned or bound. */
const STATUS_CC = 0xb0;             // control change: [cc, value]
const STATUS_POLY_PRESSURE = 0xa0;  // per-note aftertouch: [note, pressure] — a struck pad
const STATUS_NOTE_ON = 0x90;
const STATUS_NOTE_OFF = 0x80;

let access: MIDIAccess | null = null;

function handleMessage(e: MIDIMessageEvent): void {
  const data = e.data;
  if (!data || data.length < 2) return;
  const status = data[0], d1 = data[1], d2 = data.length > 2 ? data[2] : 0;
  const status4 = status & 0xf0, channel = status & 0x0f;

  let kind: MidiSourceKind | 'note' | 'other';
  let num: number, value: number;
  if (status4 === STATUS_CC) { kind = 'cc'; num = d1; value = d2; }
  else if (status4 === STATUS_POLY_PRESSURE) { kind = 'pad'; num = d1; value = d2; }
  else if (status4 === STATUS_NOTE_ON || status4 === STATUS_NOTE_OFF) { kind = 'note'; num = d1; value = d2; }
  else { kind = 'other'; num = d1; value = d2; }

  if (kind !== 'cc' && kind !== 'pad') {
    pushLog({ t: performance.now(), channel, kind, num, value, targets: [], learned: false });
    return;
  }

  const learned = completeLearn(kind, channel, num, value);
  if (learned) {
    pushLog({ t: performance.now(), channel, kind, num, value, targets: [learned], learned: true });
    return;
  }

  /* one source can drive any number of targets, each in its own mode;
     a target with no mounted knob falls back to the model write */
  const hits = boundTargets(kind, channel, num);
  if (hits) for (const name of hits) {
    const t = resolveTarget(name);
    /* binary-offset decode (delta = value - 64), except 64 itself is a
       step down — hardware that speaks 64/65 uses it that way. A pad
       always carries absolute pressure, never a step. */
    if (kind === 'cc' && bindingFor(name)?.mode === 'relative') t?.onStep(value === 64 ? -1 : value - 64);
    else t?.onValue(value / 127);
  }
  pushLog({ t: performance.now(), channel, kind, num, value, targets: hits ? [...hits] : [], learned: false });
}

function attach(input: MIDIInput): void {
  input.onmidimessage = handleMessage;
}

/** ask the browser for MIDI access and start listening on every input
    port (present and future). Resolves false if Web MIDI isn't
    available or the user refused access. */
export async function initMidi(): Promise<boolean> {
  if (!navigator.requestMIDIAccess) return false;
  try {
    access = await navigator.requestMIDIAccess();
  } catch {
    return false;
  }
  for (const input of access.inputs.values()) attach(input);
  access.onstatechange = (e) => {
    const port = e.port;
    if (port?.type === 'input' && port.state === 'connected') attach(port as MIDIInput);
  };
  return true;
}

export function midiAvailable(): boolean {
  return access !== null;
}

export function inputNames(): string[] {
  if (!access) return [];
  return Array.from(access.inputs.values(), i => i.name ?? 'MIDI device');
}
