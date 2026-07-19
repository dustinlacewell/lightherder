/* The bench pane: an infinite React Flow canvas showing ONE level of
   the patch tree (drill into a module via its ⤢ / double-click; climb
   out on the breadcrumb), with the fixed panes composed around it —
   toolbar, transport, globals, util strip, library shelf, preview
   monitor. All the graph logic lives in the hooks; this component
   only composes. */

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { PanelComponentsProvider } from '@ldlework/dials/react';
import { Background, BackgroundVariant, MiniMap, ReactFlow, useReactFlow, useStoreApi } from '@xyflow/react';
import { herderPanelComponents } from '../controls/dialsBundle';
import { bakeEntry, mediaPaths, unproject, viewContext, type NodeKind, type PatchEdge, type PatchNode } from '../../patch';
import { copyStoredMedia, libStore } from '../../persist';
import { clearAllScreens, dispatch, gateMode, mirror } from '../../runtime';
import { announcePresence, joinSession, pingBench, sessionStore, setFollow, type SessionDeps } from '../../session';
import { SessionPanel } from '../panels/SessionPanel';
import { Crumbs } from '../chrome/Crumbs';
import { GlobalsBar } from '../chrome/GlobalsBar';
import { Toolbar } from '../chrome/Toolbar';
import { Transport, useFreeze } from '../chrome/Transport';
import { UtilBar } from '../chrome/UtilBar';
import { ModuleNav, nodeTypes } from '../nodes';
import { LibraryPanel } from '../panels/LibraryPanel';
import { MidiLog } from '../panels/MidiLog';
import { Preview } from '../preview/Preview';
import { usePreviewPin } from '../preview/usePreviewPin';
import { DND_MIME, LIB_MIME } from './dnd';
import { PresenceLayer } from './PresenceLayer';
import { useBench } from './useBench';
import { isSteering, useFollow } from './useFollow';
import { useClipboard } from './useClipboard';
import { usePersistence } from './usePersistence';
import { useSpawn } from './useSpawn';

export function Bench() {
  const bench = useBench();
  const persist = usePersistence(bench);
  const { copyPatch, pastePatch } = useClipboard(bench);
  const { spawn, dropLib } = useSpawn(bench);
  const pin = usePreviewPin(bench.nodes, bench.flat);
  const { frozen, setFrozen, stepTick } = useFreeze();
  const [midiLogOpen, setMidiLogOpen] = useState(false);
  const [sessionOpen, setSessionOpen] = useState(false);
  const rf = useReactFlow();
  const rfStore = useStoreApi();
  useFollow(bench.goTo);

  /* a live read-only peer is a viewer: React Flow stops originating
     document edits (drags, new wires, Delete-key removals) so no op is
     even attempted — the gate would block it, but blocking a drag mid-way
     leaves a partial local state, so we prevent it at the source. Selection
     and panning stay on: it's a viewer, not a screenshot. */
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.state);
  const canWrite = !(session.phase === 'live' && session.role === 'peer' && !session.write);
  /* the read-only cue (§F): a live peer without write sees a pill by the
     transport; a blocked edit bumps deniedAt and the pill flashes. Keying
     the node on deniedAt restarts the CSS flash animation on each bump. */
  const readOnly = session.phase === 'live' && session.role === 'peer' && !session.write;

  /* the session reaches the document and the live-swap rebuild through
     this seam alone — never into React. `rebuild` is unused until the
     join snapshot (S4) but injected now so the surface is final. */
  const sessionDeps = useMemo<SessionDeps>(
    () => ({ root: bench.root, rebuild: bench.rebuild }), [bench.root, bench.rebuild]);

  /* presence: a screen point as the wire carries it — flow space, rounded
     to the quarter-unit (trims the JSON, no visible step even at max zoom) */
  const flowAt = useCallback((cx: number, cy: number) => {
    const p = rf.screenToFlowPosition({ x: cx, y: cy });
    return { x: Math.round(p.x * 4) / 4, y: Math.round(p.y * 4) / 4 };
  }, [rf]);

  /* presence: which level this tab is viewing rides every message, and a
     fresh announce fires when the path changes or a session goes live —
     so peers place (or hide) our cursor correctly without waiting for a
     pointer move. announcePresence is a no-op outside a live session. */
  const pathKey = bench.path.map(c => c.id).join('/');
  useEffect(() => { announcePresence({ path: pathKey }); }, [pathKey]);
  useEffect(() => { if (session.phase === 'live') announcePresence({}); }, [session.phase]);

  /* a #room=CODE in the URL auto-joins on mount — the copy-link path.
     Runs once; a stray hash without a code is ignored. */
  useEffect(() => {
    const m = /(?:^|[#&])room=([^&]+)/.exec(location.hash);
    if (m) { setSessionOpen(true); void joinSession(decodeURIComponent(m[1]), sessionDeps); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* fork the level being viewed into a fresh library entry. The RF view
     carries the MERGED on-screen values (drilled through a ref, the knobs
     shown are the instance's, not the entry's bare defaults), so
     unproject + bakeEntry capture exactly what's on screen as the new
     entry's defaults — nested ref modules keep their refs, their inner
     values baked in. Each media node's blob is copied from its EFFECTIVE
     key (read off the mirror, where compile stamps it — a ref instance's
     non-overridden nodes have no blob under their compiled id) into the
     new entry's key space, so the fork shows its pictures. The birth is an
     op, so the store, its subscribers and (later) the collab wire all
     learn of it through the one dispatcher. */
  const { root, path, prefix } = bench;
  const saveHere = useCallback(async (name: string) => {
    const ctx = viewContext(root(), path, libStore.resolve);
    if (!ctx) return;
    const id = `lib.${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
    /* a read-only peer must not fork an entry: ask the gate BEFORE the blob
       copies so a blocked saveHere copies no media (the gate cues the pill). */
    if (gateMode({ kind: 'entryCreate', entry: { id, name, patch: { nodes: [], edges: [] } } }) === 'block') return;
    const local = unproject(
      rf.getNodes() as PatchNode[], rf.getEdges() as PatchEdge[], prefix);
    const patch = bakeEntry(local, prefix, ctx.overlays ?? []);
    await Promise.all(mediaPaths(local).map(rel => {
      /* a shelf-entered view solos into the mirror, so the stamped key is
         normally there; the entry-key fallback covers the race before the
         solo compile lands */
      const key = mirror.nodes.find(n => n.id === prefix + rel)?.data.mediaKey
        ?? (ctx.kind === 'entry' && !ctx.owner ? `${ctx.entryId}/${rel}` : prefix + rel);
      return copyStoredMedia(key, `${id}/${rel}`);
    }));
    dispatch({ kind: 'entryCreate', entry: { id, name, patch } });
  }, [rf, root, path, prefix]);

  return (
    <PanelComponentsProvider value={herderPanelComponents}>
    <div
      className="bench"
      /* presence: the pointer in flow space, streamed to the room. The
         wrapper sees every move — pane, nodes, mid-drag (RF's pointer
         capture still bubbles through it) — and the rAF coalescer in
         announcePresence keeps it to one message a frame. Quarter-unit
         rounding trims the JSON without a visible step even at max zoom. */
      onPointerMove={e => announcePresence({ cur: flowAt(e.clientX, e.clientY) })}
      onPointerLeave={() => announcePresence({ cur: null })}
      /* middle click pings the bench — a "look here" any role may make.
         preventDefault keeps the browser's autoscroll cursor out of it. */
      onMouseDown={e => {
        if (e.button !== 1) return;
        e.preventDefault();
        const p = flowAt(e.clientX, e.clientY);
        pingBench(p.x, p.y);
      }}
      /* an HTML5 drag (toolbar tool, shelf entry) suppresses pointermove —
         the cursor stream rides dragover instead, so peers watch the tool
         travel */
      onDragOver={e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        announcePresence({ cur: flowAt(e.clientX, e.clientY) });
      }}
      onDrop={e => {
        e.preventDefault();   /* a stray file drop must never navigate the page */
        const lib = e.dataTransfer.getData(LIB_MIME);
        if (lib) {
          const entry = libStore.entries().find(en => en.id === lib);
          if (entry) dropLib(entry, e.clientX, e.clientY);
          return;
        }
        const t = e.dataTransfer.getData(DND_MIME);
        if (!t) return;
        const [kind, mom] = t.split('|');
        spawn(kind as NodeKind, { momentary: mom === '1' }, e.clientX, e.clientY);
      }}
    >
      <ModuleNav.Provider value={bench.enter}>
      <ReactFlow
        nodes={bench.nodes}
        edges={bench.edges}
        onNodesChange={bench.handleNodesChange}
        onEdgesChange={bench.handleEdgesChange}
        onConnect={bench.onConnect}
        isValidConnection={bench.isValid}
        /* presence: a cable drag ghosts on every peer's bench — anchored
           at this handle, loose end following our cursor */
        onConnectStart={(_, h) => {
          if (h.nodeId && h.handleId)
            announcePresence({ wire: { node: h.nodeId, handle: h.handleId, from: h.handleType ?? 'source' } });
        }}
        onConnectEnd={() => announcePresence({ wire: undefined })}
        /* presence: the camera rides the stream as a flow-space CENTER
           plus zoom — a center, not the raw offset, so peers with
           different window sizes agree on the point being looked at.
           Fires for gestures and programmatic moves alike (fitView, a
           follower's own steer), so the outbound cam is always current. */
        onMove={(_, vp) => {
          const { width, height } = rfStore.getState();
          announcePresence({ cam: {
            x: Math.round((width / 2 - vp.x) / vp.zoom * 4) / 4,
            y: Math.round((height / 2 - vp.y) / vp.zoom * 4) / 4,
            z: Math.round(vp.zoom * 1000) / 1000,
          } });
        }}
        /* any viewport move that is not the follow steer's own — a pane
           grab, a wheel zoom, a minimap pan — is the user striking out on
           their own: break follow. The checkbox is the way back in. */
        onMoveStart={() => { if (!isSteering() && sessionStore.state().follow) setFollow(false); }}
        /* the presence spawn ghost renders REAL device components outside
           any node, so their Handles have no node id — React Flow flags
           that as '010' on every render. Expected here; everything else
           still logs. */
        onError={(code, msg) => { if (code !== '010') console.error(msg); }}
        nodeTypes={nodeTypes}
        nodesDraggable={canWrite}
        nodesConnectable={canWrite}
        edgesFocusable={canWrite}
        deleteKeyCode={canWrite ? ['Delete', 'Backspace'] : null}
        /* Shift belongs to the TAP gesture (and fine knob drags) — box
           selection would overlay the faces and eat shift-clicks */
        selectionKeyCode="Control"
        zoomOnDoubleClick={false}
        minZoom={0.15}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.5} color="#2b2114" />
        <MiniMap pannable zoomable nodeColor="#3a2c1a" maskColor="rgba(8,6,4,0.72)" bgColor="#0d0b08" />
        <PresenceLayer path={pathKey} />
      </ReactFlow>
      </ModuleNav.Provider>

      <Crumbs path={bench.path} onJump={bench.jump} />
      <Toolbar onSpawn={spawn} />

      <div className="topcenter">
        {readOnly && (
          <span key={session.deniedAt} className="session-readonly" title="You are a viewer — the host holds the pen">read-only</span>
        )}
        <Transport frozen={frozen} setFrozen={setFrozen} stepTick={stepTick} />
        <UtilBar
          onClear={() => clearAllScreens()}
          onNew={() => dispatch({ kind: 'replaceGraph', patch: { nodes: [], edges: [] } })}
          onCopy={copyPatch}
          onPaste={pastePatch}
          midiLogOpen={midiLogOpen}
          setMidiLogOpen={setMidiLogOpen}
          sessionOpen={sessionOpen}
          setSessionOpen={setSessionOpen}
        />
      </div>
      <GlobalsBar onSave={persist} />
      <LibraryPanel onSaveHere={saveHere} onOpen={bench.enterLib} root={bench.root} />
      <Preview node={pin.shown} frozen={frozen} locked={pin.locked} setLocked={pin.setLocked} w={pin.w} setW={pin.setW} />
      {midiLogOpen && <MidiLog onClose={() => setMidiLogOpen(false)} />}
      {sessionOpen && <SessionPanel deps={sessionDeps} onClose={() => setSessionOpen(false)} />}
    </div>
    </PanelComponentsProvider>
  );
}
