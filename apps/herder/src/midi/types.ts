/* The MIDI patchbay's shared vocabulary. */

/* mode: an 'absolute' CC carries position (0-127 → the param's range);
   a 'relative' CC comes from an endless encoder and carries direction
   only — 65 and up means step up, 64 and below means step down.
   (Binary-offset encoders send 63/65; this also covers hardware that
   sends 64/65.) A 'pad' binding ignores mode — it's always a pressure
   stream driving onValue directly, never a stepper. */
export type MidiMode = 'absolute' | 'relative';

/* a binding's source is either a CC number or a pad's note number
   (from polyphonic key pressure — aftertouch on a struck pad, note
   identifies which one). Same shape, different keyspace, so one CC
   and one pad can share a number without colliding. */
export type MidiSourceKind = 'cc' | 'pad';

export interface MidiBinding { channel: number; num: number; kind: MidiSourceKind; target: string; mode: MidiMode }

export interface MidiLogEntry {
  id: number;         // monotonic — a stable row key while the ring shifts
  t: number;          // performance.now() at receipt
  channel: number;
  kind: MidiSourceKind | 'note' | 'other';   // 'note' = on/off, logged but never bindable
  num: number;         // CC number, or note number for pad/note messages
  value: number;       // 0-127 raw (CC value, pad pressure, or note velocity)
  targets: string[];   // every bound target it drove (one message may fan out to many)
  learned: boolean;    // this message is the one that just bound a target
}

export type Listener = (v: number) => void;

/* onValue receives absolute position 0..1; onStep receives signed
   encoder detents (+1 per step up, -1 per step down) for the knob to
   scale however it scales a wheel notch */
export interface Target { onValue: Listener; onStep: (steps: number) => void }
