/* The monitor's ring buffer — every incoming message, recognized or
   not, so a controller's knob can be identified by ear (turn it,
   watch a line appear). */

import type { MidiLogEntry } from './types';

const LOG_MAX = 200;
const log: MidiLogEntry[] = [];
const logWatchers = new Set<() => void>();
let logSeq = 0;

/** receive-side: append one entry, shifting the ring */
export function pushLog(entry: Omit<MidiLogEntry, 'id'>): void {
  log.push({ id: logSeq++, ...entry });
  if (log.length > LOG_MAX) log.shift();
  for (const cb of logWatchers) cb();
}

export function midiLog(): readonly MidiLogEntry[] {
  return log;
}

export function watchLog(cb: () => void): () => void {
  logWatchers.add(cb);
  return () => logWatchers.delete(cb);
}

export function clearLog(): void {
  log.length = 0;
  for (const cb of logWatchers) cb();
}
