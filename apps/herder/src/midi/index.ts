/* The MIDI patchbay — a controller as another way to reach a knob.

     input     Web MIDI access and message decode
     bindings  the source→target table, learn mode, persistence
     targets   where bound messages land (knob setter or model write)
     log       the monitor's ring buffer

   The module knows nothing about React — targets register a plain
   (value0to1) callback and get called. */

export { initMidi, midiAvailable, inputNames } from './input';
export {
  isBound, bindingFor, toggleMode, isLearning, watchLearn, startLearn, cancelLearn,
  unbind, allBindings, pruneBindings, loadBindings,
} from './bindings';
export { registerTarget, unregisterTarget, onModelWrite, fireModelWrite } from './targets';
export { midiLog, watchLog, clearLog } from './log';
export type { MidiMode, MidiSourceKind, MidiBinding, MidiLogEntry } from './types';
