/* Web MIDI API — not in TypeScript's DOM lib. The minimal surface
   midi.ts actually touches. */

interface MIDIMessageEvent extends Event {
  data: Uint8Array | null;
}

interface MIDIPort extends EventTarget {
  name: string | null;
  type: 'input' | 'output';
  state: 'connected' | 'disconnected';
}

interface MIDIInput extends MIDIPort {
  onmidimessage: ((e: MIDIMessageEvent) => void) | null;
}

interface MIDIConnectionEvent extends Event {
  port: MIDIPort | null;
}

interface MIDIAccess extends EventTarget {
  inputs: Map<string, MIDIInput>;
  onstatechange: ((e: MIDIConnectionEvent) => void) | null;
}

interface Navigator {
  requestMIDIAccess?: () => Promise<MIDIAccess>;
}
