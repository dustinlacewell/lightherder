/* The binding table and learn mode. Any number of targets may share
   one source — a single fader (or pad) can sweep a whole row of
   knobs. Learn mode watches for the next CC or pad hit and binds it
   to whichever target asked; only one target ever listens at a time.

   Bindings live in their own localStorage entry (not the patch JSON):
   node ids are patch-specific, so a rebuild (New/Piece/Duo/paste)
   invalidates whichever bindings no longer resolve — `pruneBindings`
   is the app's hook to call after one. */

import { targetResolves } from './targets';
import type { MidiBinding, MidiMode, MidiSourceKind } from './types';

const bindings = new Map<string, MidiBinding>();   // target -> binding
const bySource = new Map<string, Set<string>>();   // "kind:channel:num" -> every target it drives

let learning: string | null = null;
let onLearned: ((b: MidiBinding | null) => void) | null = null;

/* knobs subscribe to their own target's learn-state flips, so a knob
   whose arm gets stolen by another knob's right-click still knows to
   drop its "learning" dot — not just the one that stole it */
const learnWatchers = new Map<string, Set<() => void>>();

function notifyLearnChange(target: string): void {
  for (const cb of learnWatchers.get(target) ?? []) cb();
}

const sourceKey = (kind: MidiSourceKind, channel: number, num: number) => `${kind}:${channel}:${num}`;

function sourceAdd(kind: MidiSourceKind, channel: number, num: number, target: string): void {
  const k = sourceKey(kind, channel, num);
  let set = bySource.get(k);
  if (!set) bySource.set(k, set = new Set());
  set.add(target);
}

function sourceRemove(b: MidiBinding): void {
  const k = sourceKey(b.kind, b.channel, b.num);
  const set = bySource.get(k);
  if (!set) return;
  set.delete(b.target);
  if (!set.size) bySource.delete(k);
}

/* ---- lookups (the receive path) ----------------------------------------- */

/** every target bound to this source, if any */
export function boundTargets(kind: MidiSourceKind, channel: number, num: number): ReadonlySet<string> | undefined {
  return bySource.get(sourceKey(kind, channel, num));
}

export function isBound(target: string): boolean {
  return bindings.has(target);
}

export function bindingFor(target: string): MidiBinding | null {
  return bindings.get(target) ?? null;
}

/** flip a bound target between absolute and relative — the manual
    override for when learn guessed the controller's dialect wrong */
export function toggleMode(target: string): void {
  const b = bindings.get(target);
  if (!b) return;
  b.mode = b.mode === 'relative' ? 'absolute' : 'relative';
  saveBindings();
}

/* ---- learn mode --------------------------------------------------------- */

export function isLearning(target: string): boolean {
  return learning === target;
}

/** subscribe to this target's learn-state flipping on or off, however
    it happens (armed, cancelled, bound, or stolen by another target) */
export function watchLearn(target: string, cb: () => void): () => void {
  let set = learnWatchers.get(target);
  if (!set) learnWatchers.set(target, set = new Set());
  set.add(cb);
  return () => { set!.delete(cb); if (!set!.size) learnWatchers.delete(target); };
}

/** arm learn mode for one target; the next CC message anywhere binds
    to it. Calling again (same or different target) cancels the prior
    arm — only one target ever listens at a time. */
export function startLearn(target: string, onDone?: (b: MidiBinding | null) => void): void {
  const prev = learning;
  learning = target;
  onLearned = onDone ?? null;
  if (prev && prev !== target) notifyLearnChange(prev);
  notifyLearnChange(target);
}

export function cancelLearn(): void {
  const prev = learning;
  learning = null;
  onLearned = null;
  if (prev) notifyLearnChange(prev);
}

/** receive-side: if learn is armed, bind this source to the waiting
    target and return it; null when nobody is listening. The first
    value guesses the dialect — 64/65 as an opening value is an
    encoder's step-down/step-up, not a plausible position from a fader
    mid-move (shift+right-click on the knob overrides a wrong guess).
    A pad's pressure stream is never relative. */
export function completeLearn(kind: MidiSourceKind, channel: number, num: number, value: number): string | null {
  if (!learning) return null;
  const target = learning;
  learning = null;
  unbind(target);
  const mode: MidiMode = kind === 'cc' && (value === 64 || value === 65) ? 'relative' : 'absolute';
  const b: MidiBinding = { channel, num, kind, target, mode };
  bindings.set(target, b);
  sourceAdd(kind, channel, num, target);
  onLearned?.(b);
  onLearned = null;
  notifyLearnChange(target);
  saveBindings();
  return target;
}

/* ---- the table ---------------------------------------------------------- */

export function unbind(target: string): void {
  const b = bindings.get(target);
  if (!b) return;
  bindings.delete(target);
  sourceRemove(b);
  saveBindings();
}

/** the whole binding set, for inspection */
export function allBindings(): MidiBinding[] {
  return Array.from(bindings.values());
}

function setBindings(list: MidiBinding[]): void {
  bindings.clear();
  bySource.clear();
  for (const b of list) {
    bindings.set(b.target, b);
    sourceAdd(b.kind, b.channel, b.num, b.target);
  }
}

/** drop any binding whose target no longer resolves against the
    mirror — call after a rebuild replaces the node set */
export function pruneBindings(): void {
  const kept = allBindings().filter(b => targetResolves(b.target));
  if (kept.length !== bindings.size) { setBindings(kept); saveBindings(); }
}

/* ---- persistence -------------------------------------------------------- */

const KEY = 'herder.midi.v1';

function saveBindings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(allBindings())); } catch { /* storage full / denied */ }
}

/** load bindings saved from a prior session; call once at boot, after
    the mirror is populated so validation has something to check against */
export function loadBindings(): void {
  let raw: string | null;
  try { raw = localStorage.getItem(KEY); } catch { return; }
  if (!raw) return;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return; }
  if (!Array.isArray(parsed)) return;
  const list: MidiBinding[] = [];
  for (const r of parsed as any[]) {
    /* pre-pad saves used `cc` for the source number and had no `kind`
       — read either shape, defaulting an old row to 'cc' */
    const channel = Number(r?.channel), num = Number(r?.num ?? r?.cc), target = r?.target;
    const kind: MidiSourceKind = r?.kind === 'pad' ? 'pad' : 'cc';
    if (!Number.isInteger(channel) || !Number.isInteger(num) || typeof target !== 'string') continue;
    if (!targetResolves(target)) continue;
    list.push({ channel, num, kind, target, mode: r?.mode === 'relative' ? 'relative' : 'absolute' });
  }
  setBindings(list);
}
