/* Per-slot chrome — what herder wraps around every drawer knob that the
   bespoke `Knob` used to own inline: MIDI learn/unbind/mode-flip, the
   MIDI + control-port dots, and the right-click context-menu policy.

   Dials' `SlotRow` renders the knob (phosphor's `KnobSlider`); this
   wraps its *control* (the Panel's `SlotChrome` seam, Phase-1 G3) so the
   knob face never has to know about MIDI or ports. The knob's own value
   plumbing is untouched — a CC with no registered setter falls straight
   through to `midi/targets.ts`' model fallback, which dispatches the
   path `setParam` op (silently, in place), so a mounted drawer knob and
   an unmounted one drive identically. This chrome therefore registers no
   MIDI setter: it only owns the *learn* handshake and the adornments.

   The target key is "nodeId:slotpath" — a root knob ("n3:zoom") or a
   modulated sub-param ("n3:zoom/freq"). Sub-slots are MIDI-learnable
   (decision 7) but never port-exposable: the port toggle shows only on a
   root (depth-1) path. */

import { useEffect, useReducer } from 'react';
import type { Slot } from '@ldlework/dials';
import type { SlotChromeProps } from '@ldlework/dials/react';
import * as midi from '../../midi';
import { useSlotNode } from './dialsBundle';

export function SlotChrome({ path, slot, children }: SlotChromeProps) {
  const node = useSlotNode();
  const [, bump] = useReducer((x: number) => x + 1, 0);
  const target = node ? `${node.id}:${path.join('/')}` : null;
  const rootKey = path.length === 1 ? path[0] : null;
  const portOn = rootKey != null && (node?.exposed.includes(rootKey) ?? false);

  /* re-render when this target's learn state flips, whoever triggered it
     (a right-click on another knob can steal the arm) */
  useEffect(() => {
    if (!target) return;
    return midi.watchLearn(target, () => bump());
  }, [target]);

  if (!target) return <>{children}</>;

  const bound = midi.isBound(target);
  const learning = midi.isLearning(target);
  const mode = midi.bindingFor(target)?.mode;

  /* right-click policy. PLAIN right-click belongs to the knob — it opens
     the modulation picker (phosphor's onRightClick) — so the chrome only
     acts on a MODIFIED right-click and lets an unmodified one fall
     through untouched:
       ctrl+right-click        → learn / cancel / unbind MIDI
       ctrl+shift+right-click  → flip a bound target absolute⇄relative
       shift+right-click       → toggle the control port (root slots only)
     A plain right-click is left entirely alone (no preventDefault, no
     stopPropagation), so the knob's own picker gesture runs. */
  const onContextMenu = (e: React.MouseEvent): void => {
    if (rootKey != null && e.shiftKey && !e.ctrlKey) {
      e.preventDefault(); e.stopPropagation();
      node!.togglePort(rootKey); return;
    }
    if (e.ctrlKey) {
      e.preventDefault(); e.stopPropagation();
      if (learning) { midi.cancelLearn(); return; }
      if (bound && e.shiftKey) { midi.toggleMode(target); bump(); return; }
      if (bound) { midi.unbind(target); bump(); return; }
      midi.startLearn(target, () => bump());
      return;
    }
    /* plain right-click → the knob's modulation picker; don't intercept */
  };

  const title = midiTitle(slot, { learning, bound, mode, port: rootKey != null ? portOn : undefined });

  return (
    <div
      className={`slot-chrome${learning ? ' midi-learning' : ''}${bound ? ' midi-bound' : ''}`}
      onContextMenu={onContextMenu}
      title={title}
    >
      {children}
      {(bound || learning) && <span className={`slot-dot midi ${learning ? 'learning' : 'bound'}`} />}
      {portOn && <span className="slot-dot port" />}
    </div>
  );
}

/* the hover text the bespoke Knob carried, rebuilt from what this slot
   affords right now */
function midiTitle(
  slot: Slot<unknown>,
  s: { learning: boolean; bound: boolean; mode?: string; port?: boolean },
): string {
  const meta = slot.dial.meta;
  const head = meta.description ? `${meta.label ?? ''} — ${meta.description}` : (meta.label ?? '');
  const portLine = s.port !== undefined
    ? `\n\nshift+right-click: ${s.port ? 'remove its control port' : 'expose as a control port on this device'}`
    : '';
  const midiLine = `\n\nright-click: open the modulation picker`
    + `\nctrl+right-click: ${s.learning ? 'cancel MIDI learn' : s.bound ? 'unbind MIDI CC' : 'MIDI learn'}`
    + (s.bound ? `\nctrl+shift+right-click: ${s.mode === 'relative' ? 'relative encoder → absolute' : 'absolute → relative encoder'}` : '');
  return head + portLine + midiLine;
}
