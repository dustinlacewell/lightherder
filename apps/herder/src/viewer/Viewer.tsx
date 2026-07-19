/* The viewer's whole UI — two screens and a thin strip.

     · JOIN — a room-code field (auto-filled and auto-submitted from a
       `#room=CODE` hash), the join button, and any relay-health note.
       Before a session, and after one ends and the viewer leaves.

     · LIVE — a full-window face div the engine paints the host's pinned
       screen into, under a thin overlay strip: the connection phase, a
       relay note while joining, a host-gone notice, and Leave.

   The viewer is a permanently read-only peer with follow hard-on. It
   reuses joinSession unchanged (the peer loop installs the read-only
   gate, the join snapshot and the op stream), injecting the headless
   applier's root + rebuild as its deps. Follow is driven here, not by
   the bench's usePreviewPin: the full-window face IS stage.preview.el,
   and the host's relayed pin drives stage.preview.nodeId. */

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { stage } from '../runtime';
import { joinSession, leaveSession, setFollow, sessionStore } from '../session';
import { viewerRebuild, viewerRoot } from './applier';

/** the deps the session injects — the headless applier's root and its
    live-swap rebuild. Fixed for the tab's life; the viewer never re-picks
    a document. */
const deps = { root: viewerRoot, rebuild: viewerRebuild };

export function Viewer() {
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.state);
  const live = session.phase === 'live' || session.phase === 'joining' || session.phase === 'ended';

  return live ? <Live session={session} /> : <Join />;
}

/* ---- join ------------------------------------------------------------- */

function Join() {
  const [code, setCode] = useState('');

  /* auto-join from `#room=CODE` — a shared viewer link drops straight into
     the room with no typing. The hash is CONSUMED on use: Join remounts
     after a Leave, and a surviving hash would re-fire the auto-join and
     make Leave a revolving door. The code lands in the field instead, so
     rejoining is one click, not a retype. */
  const joined = useRef(false);
  useEffect(() => {
    const m = /[#&]room=([^&]+)/.exec(location.hash);
    if (m && !joined.current) {
      joined.current = true;
      const c = m[1].toUpperCase();
      setCode(c);
      history.replaceState(null, '', location.pathname + location.search);
      void join(c);
    }
  }, []);

  const submit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const c = code.trim().toUpperCase();
    if (c) void join(c);
  }, [code]);

  return (
    <div className="vw-join">
      <div className="vw-card">
        <h1 className="vw-title">Herder</h1>
        <p className="vw-sub">viewer — watch a live session</p>
        <form onSubmit={submit} className="vw-form">
          <input
            className="vw-code"
            value={code}
            onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="ROOM CODE"
            maxLength={5}
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          <button className="vw-btn" type="submit" disabled={!code.trim()}>watch</button>
        </form>
      </div>
    </div>
  );
}

/** join a room as the read-only viewer: follow hard-on the moment the
    session exists, so the first host pin is honored. */
async function join(code: string): Promise<void> {
  await joinSession(code, deps);
  setFollow(true);
}

/* ---- live ------------------------------------------------------------- */

function Live({ session }: { session: ReturnType<typeof sessionStore.state> }) {
  /* the full-window face IS the preview well — register it as
     stage.preview.el, the same slot the bench's preview monitor fills, so
     the blitter paints the pinned node into it every frame. The pin ITSELF
     is followed per-frame in the frame loop (follow.ts): a pin can race the
     op that brings its node in, so resolution belongs beside the engine
     step, not in a React effect. */
  const faceRef = useCallback((el: HTMLDivElement | null) => { stage.preview.el = el; }, []);

  /* a viewer never keeps stage.preview state past its own life */
  useEffect(() => () => { stage.preview.el = null; stage.preview.nodeId = null; }, []);

  /* the waiting overlay reflects a runtime value (stage.preview.nodeId,
     set per-frame by the follower) that is not a React signal. Tick a
     cheap rAF re-render WHILE no screen shows yet, so the overlay clears
     the instant the first pin resolves; it stops itself once a screen is
     caught (and re-arms if the screen later goes away). */
  const [, tick] = useState(0);
  const hasScreen = stage.preview.nodeId != null;
  useEffect(() => {
    if (hasScreen) return;
    let raf = 0;
    const spin = (): void => { raf = requestAnimationFrame(spin); tick(t => t + 1); };
    raf = requestAnimationFrame(spin);
    return () => cancelAnimationFrame(raf);
  }, [hasScreen]);

  const ended = session.phase === 'ended';

  return (
    <div className="vw-live">
      <div ref={faceRef} className="face vw-face" />
      {!hasScreen && (
        <div className="vw-waiting">
          {session.phase === 'joining'
            ? (session.relayNote ? `connecting — ${session.relayNote}` : 'connecting…')
            : ended
              ? 'the host left'
              : 'waiting for the host to pin a screen'}
        </div>
      )}
      <div className="vw-strip">
        <span className={`vw-dot vw-dot-${session.phase}`} />
        <span className="vw-phase">
          {session.phase === 'joining' ? 'joining' : ended ? 'host gone' : 'live'}
          {session.code ? ` · ${session.code}` : ''}
        </span>
        {session.phase === 'joining' && session.progress && (
          <span className="vw-note">{session.progress.key}</span>
        )}
        {session.phase === 'joining' && session.relayNote && (
          <span className="vw-note">{session.relayNote}</span>
        )}
        <button className="vw-leave" onClick={() => void leaveSession()}>leave</button>
      </div>
    </div>
  );
}
