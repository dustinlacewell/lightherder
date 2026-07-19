/* The bench persists itself (the TREE, not the compiled mirror),
   debounced — on graph edits, on MIDI writes landing in unmounted
   corners of the tree, and on the way out the door. */

import { useCallback, useEffect } from 'react';
import { savePatch } from '../../persist';
import { mirror } from '../../runtime';
import * as midi from '../../midi';
import type { Bench } from './useBench';

export function usePersistence(bench: Bench): () => void {
  const { root, nodes, edges } = bench;
  const persist = useCallback(
    () => savePatch({ nodes: root().nodes, edges: root().edges, globals: mirror.globals }),
    [root]);

  useEffect(() => {
    const t = setTimeout(persist, 800);
    return () => clearTimeout(t);
  }, [nodes, edges, persist]);

  /* a CC landing where no knob is mounted (inside an undrilled module,
     a collapsed panel) writes the tree directly, bypassing React state
     — give it the same debounced persist */
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    midi.onModelWrite(() => { clearTimeout(t); t = setTimeout(persist, 800); });
    return () => clearTimeout(t);
  }, [persist]);

  useEffect(() => {
    addEventListener('beforeunload', persist);
    return () => removeEventListener('beforeunload', persist);
  }, [persist]);

  return persist;
}
