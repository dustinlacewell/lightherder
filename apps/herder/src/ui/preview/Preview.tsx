/* The preview monitor: bottom-left, mirrors the pinned node's output;
   the grip in its header resizes it (16:9 stays locked — the loop
   textures are 16:9 and a preview must not lie about shape). While
   the bench is frozen, ‹ › scrubs this node's ring history. */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { PatchNode } from '../../patch';
import { addShield, stage } from '../../runtime';
import { KindIcon } from '../nodes';
import { openPopout } from './popout';

/* how far back the preview can scrub: ring depth 6, minus the frame
   being written — the oldest committed tap is 4 */
const MAX_TAP = 4;

export function Preview({ node, frozen, locked, setLocked, w, setW, fullscreen }: {
  node: PatchNode | null; frozen: boolean; locked: boolean; setLocked: (l: boolean) => void;
  w: number; setW: (w: number | ((w: number) => number)) => void; fullscreen: boolean;
}) {
  const [tap, setTap] = useState(0);
  const [popped, setPopped] = useState(false);
  const drag = useRef<{ x0: number; w0: number } | null>(null);
  const faceRef = useCallback((el: HTMLDivElement | null) => { stage.preview.el = el; }, []);
  useEffect(() => { if (!frozen) setTap(0); }, [frozen]);
  stage.preview.tap = frozen ? tap : 0;

  /* the popout window lives as long as the toggle is on and SOME node
     is pinned — switching the pinned node must not recreate it (the
     engine follows stage.preview.nodeId each frame; only the title here
     tracks the node). It closes itself if every node goes away or the
     bench navigates — never leave a dangling window. */
  const hasNode = !!node;
  useEffect(() => {
    if (!popped) return;
    if (!hasNode) { setPopped(false); return; }
    const win = openPopout();
    if (!win) { setPopped(false); return; }
    const poll = setInterval(() => { if (win.closed) setPopped(false); }, 400);
    return () => {
      clearInterval(poll);
      stage.preview.popout = null;
      if (!win.closed) win.close();
    };
  }, [popped, hasNode]);
  const shownName = node?.data.name;
  useEffect(() => {
    const win = stage.preview.popout?.win;
    if (popped && shownName && win && !win.closed) win.document.title = `Herder — ${shownName}`;
  }, [popped, shownName]);

  return (
    <aside
      className={"preview" + (fullscreen ? " pv-full" : "")}
      style={fullscreen ? undefined : { width: w }}
      ref={el => { if (el) addShield(el); }}
    >
      <header className="pv-head">
        {node && <KindIcon kind={node.type} />}
        <span className="dev-name">{node ? node.data.name : 'select a screen'}</span>
        {node && (
          <button
            className={`pv-lockbtn${locked ? ' lit' : ''}`}
            title={locked ? 'unlock — let selecting a screen change the preview' : 'lock — keep previewing this screen'}
            onClick={() => setLocked(!locked)}
          >{locked ? '🔒' : '🔓'}</button>
        )}
        {node && (
          <button
            className={`pv-lockbtn${popped ? ' lit' : ''}`}
            title={popped ? 'close the popped-out window' : 'pop this preview out into its own window'}
            onClick={() => setPopped(p => !p)}
          >⧉</button>
        )}
        {frozen && node && (
          <span className="pv-scrub" title="scrub this device's frame history (frozen only)">
            <button className="pv-tapbtn" disabled={tap >= MAX_TAP} onClick={() => setTap(t => Math.min(MAX_TAP, t + 1))}>‹</button>
            <span className="pv-tap">{tap === 0 ? 'now' : `t−${tap}`}</span>
            <button className="pv-tapbtn" disabled={tap <= 0} onClick={() => setTap(t => Math.max(0, t - 1))}>›</button>
          </span>
        )}
        <div
          className="pv-grip"
          title="drag to resize the preview"
          onPointerDown={e => {
            drag.current = { x0: e.clientX, w0: w };
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
          }}
          onPointerMove={e => {
            const d = drag.current;
            if (d) setW(Math.min(760, Math.max(180, d.w0 + (e.clientX - d.x0))));
          }}
          onPointerUp={() => { drag.current = null; }}
          onPointerCancel={() => { drag.current = null; }}
        />
      </header>
      <div ref={faceRef} className="face pv-face" />
    </aside>
  );
}
