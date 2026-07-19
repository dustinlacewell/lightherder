/* Top-right: the two globals (Video, Res) in their own pane. Saving
   goes through the bench (it owns the patch tree — the runtime holds
   the compiled mirror, which must never be persisted). */

import { useEffect, useReducer, useSyncExternalStore } from 'react';
import type { Slot } from '@ldlework/dials';
import { GLOBAL_PARAMS } from '../../patch';
import { dispatch, engineRef, mirror } from '../../runtime';
import { sessionStore } from '../../session';
import { Knob } from '../controls/Knob';

export function GlobalsBar({ onSave }: { onSave: () => void }) {
  const [, repaint] = useReducer((x: number) => x + 1, 0);
  /* a REMOTE setGlobal writes mirror.globals with nothing observable to
     React; the session version bumps on remote apply, so re-render the knobs
     off it. A no-op with no session (the version never bumps). */
  useSyncExternalStore(sessionStore.subscribe, sessionStore.version);

  /* honor a restored Res before the first tick */
  useEffect(() => { engineRef.current?.setResolution((mirror.globals.res as Slot<number>).dial.value); }, []);

  /* the op writes the mirror globals AND retunes the engine on a res
     change (that retune moved into the applier so a REMOTE res change
     retunes too); the save and the repaint stay this pane's own to do */
  const setGlobal = (k: string, v: number): void => {
    dispatch({ kind: 'setGlobal', k, v });
    onSave();
    repaint();
  };

  return (
    <div className="globalsbar">
      {Object.entries(GLOBAL_PARAMS).map(([k, p]) => (
        <Knob key={k} def={p} value={(mirror.globals[k] as Slot<number>).dial.value} onChange={v => setGlobal(k, v)} size={38} midiTarget={`global:${k}`} />
      ))}
    </div>
  );
}
