/* The presence overlay — the other tabs rendered onto the bench, split
   across two surfaces by what the things ARE:

   · GRAPH OBJECTS — the ring around a node a peer is mid-dragging, the
     dashed ghost cable from an anchored handle to the dragging peer's
     pointer — live in flow space inside the ViewportPortal, under the
     glass like the real edges and chassis they decorate.

   · POINTER OBJECTS — cursors (with their label / "+ tool" chip) and
     middle-click pings — are hands over the bench, so they render in a
     fixed body-level overlay ABOVE everything: panels, preview, the GL
     face canvas. The overlay's inner container carries the live viewport
     transform, so a local pan moves them instantly (no easing artifact)
     while each cursor keeps its own 90ms glide and 1/zoom counter-scale.

   Remote drag frames are applied here too — through the same updateNode
   call a remote moveNode op rides, so no change records back onto the
   wire and the settle op stays the authority. A peer viewing a DIFFERENT
   level naturally no-ops: the dragged id isn't among its internal nodes.
   Cursors and pings are path-scoped explicitly, since a flow position is
   only meaningful on the level it was pointed at. */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { getBezierPath, Position, useReactFlow, useStore, ViewportPortal } from '@xyflow/react';
import { handleKind, makeNode, type NodeData } from '../../patch';
import { peerColor, presenceStore, sessionStore, watchRemoteDrag, type PeerPresence } from '../../session';
import { nodeTypes } from '../nodes';

/* the same truncation the session panel uses for an unnamed peer */
const shortId = (id: string): string => id.slice(0, 6);

const OPPOSITE: Record<Position, Position> = {
  [Position.Left]: Position.Right,
  [Position.Right]: Position.Left,
  [Position.Top]: Position.Bottom,
  [Position.Bottom]: Position.Top,
};

export function PresenceLayer({ path }: { path: string }) {
  useSyncExternalStore(presenceStore.subscribe, presenceStore.version);
  const rf = useReactFlow();
  const [tx, ty, zoom] = useStore(s => s.transform);

  /* land remote drag frames on the RF nodes the moment they arrive —
     the store bump re-renders this overlay the same frame, so the ring
     and the node move together */
  useEffect(() => watchRemoteDrag(moves => {
    for (const m of moves)
      if (rf.getInternalNode(m.id)) rf.updateNode(m.id, { position: { x: m.x, y: m.y } });
  }), [rf]);

  const peers = presenceStore.peers();
  const pings = presenceStore.pings();
  const self = presenceStore.self();
  if (!peers.length && !pings.length && !self.spawn) return null;

  return (
    <>
      <ViewportPortal>
        {/* drag rings — flow-scale, so they hug the node at any zoom */}
        {peers.flatMap(p => (p.drag ?? []).map(d => {
          const n = rf.getInternalNode(d.id);
          if (!n) return null;
          const { x, y } = n.internals.positionAbsolute;
          return (
            <div
              key={`${p.id}:${d.id}`}
              className="presence-ring"
              style={{
                transform: `translate(${x}px, ${y}px)`,
                width: n.measured.width ?? 0,
                height: n.measured.height ?? 0,
                borderColor: p.color,
                boxShadow: `0 0 12px ${p.color}55`,
              }}
            />
          );
        }))}

        {/* ghost cables — the anchored handle to the peer's live pointer */}
        <svg className="presence-wires" width="1" height="1">
          {peers.map(p => {
            const g = ghostPath(rf, p);
            return g && <path key={p.id} className={`presence-wire ${g.cls}`} d={g.d} />;
          })}
        </svg>

        {/* spawn ghosts — the device being carried off the toolbar /
            shelf: the peers' carries, and our OWN (the native drag image
            is suppressed, so this ghost IS the local drag feedback) */}
        {peers.map(p => p.spawn && p.cur && p.path === path && (
          <SpawnGhost key={`${p.id}:spawn`} spawn={p.spawn} cur={p.cur} color={p.color} />
        ))}
        {self.spawn && self.cur && (
          <SpawnGhost spawn={self.spawn} cur={self.cur} color={peerColor(sessionStore.state().selfId)} own />
        )}
      </ViewportPortal>

      {/* hands over the bench — cursors and pings, above every surface */}
      {createPortal(
        <div className="presence-screen">
          <div className="presence-space" style={{ transform: `translate(${tx}px, ${ty}px) scale(${zoom})` }}>
            {pings.map(g => g.path === path && (
              <div key={g.key} className="presence-ping" style={{ transform: `translate(${g.x}px, ${g.y}px) scale(${1 / zoom})` }}>
                <span className="presence-ping-ring" style={{ borderColor: g.color }} />
                <span className="presence-ping-ring late" style={{ borderColor: g.color }} />
                <span className="presence-ping-dot" style={{ background: g.color }} />
              </div>
            ))}
            {peers.map(p => p.cur && p.path === path && (
              <div
                key={p.id}
                className="presence-cursor"
                style={{ transform: `translate(${p.cur.x}px, ${p.cur.y}px) scale(${1 / zoom})` }}
              >
                <svg className="presence-arrow" width="18" height="20" viewBox="0 0 18 20">
                  <path
                    d="M1 1 L1 15.5 L5.2 11.8 L7.9 17.6 L10.6 16.3 L7.9 10.7 L13.4 10.1 Z"
                    fill={p.color} stroke="#0d0b08" strokeWidth="1.2" strokeLinejoin="round"
                  />
                </svg>
                <span className="presence-label" style={{ background: p.color }}>{shortId(p.id)}</span>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* one carried device — the ACTUAL node component from the bench's
   registry, rendered inert at the exact drop anchor (cursor − 105, −16,
   the same offset useSpawn lands with). Its data is minted by the same
   makeNode the drop will use, so knobs, ports, face wells and a
   module's real port list are all the true article; only the name is
   overridden to the carried label, and a module gets its ref so its
   interface resolves. The wrapper is inert (pointer-events none), so
   the component's buttons and gestures are unreachable; its Handles
   render as bare port dots (no node id — the Bench's onError filter
   swallows React Flow's '010' complaint about exactly this). */
function SpawnGhost({ spawn, cur, color, own }: {
  spawn: NonNullable<PeerPresence['spawn']>;
  cur: { x: number; y: number };
  color: string;
  /** our own carry tracks the hand raw — no easing between frames */
  own?: boolean;
}) {
  /* every node component reads only { id, data } off its NodeProps */
  const Device = nodeTypes[spawn.kind] as unknown as React.FC<{ id: string; data: NodeData }>;
  const data = useMemo(() => {
    const n = makeNode(spawn.kind, 0, 0, [], { momentary: spawn.mom });
    n.data.name = spawn.label;
    if (spawn.ref !== undefined) { n.data.ref = spawn.ref; n.data.vals = {}; }
    return n.data;
  }, [spawn.kind, spawn.label, spawn.ref, spawn.mom]);
  return (
    <div
      className={`presence-ghost${own ? ' own' : ''}`}
      style={{ transform: `translate(${cur.x - 105}px, ${cur.y - 16}px)`, outlineColor: color }}
    >
      <Device id="__ghost" data={data} />
    </div>
  );
}

/* the ghost cable's bezier: anchored end read off the live handle
   bounds (absent when this tab views another level — then no ghost),
   loose end at the peer's pointer. Colored by the wire kind it would
   make, so a control cable ghosts teal and a video cable amber. */
function ghostPath(
  rf: ReturnType<typeof useReactFlow>,
  p: PeerPresence,
): { d: string; cls: string } | null {
  if (!p.wire || !p.cur) return null;
  const n = rf.getInternalNode(p.wire.node);
  const h = n?.internals.handleBounds?.[p.wire.from]?.find(hb => hb.id === p.wire!.handle);
  if (!n || !h) return null;
  const sx = n.internals.positionAbsolute.x + h.x + h.width / 2;
  const sy = n.internals.positionAbsolute.y + h.y + h.height / 2;
  const [d] = getBezierPath({
    sourceX: sx, sourceY: sy, sourcePosition: h.position,
    targetX: p.cur.x, targetY: p.cur.y, targetPosition: OPPOSITE[h.position],
  });
  return { d, cls: handleKind(p.wire.handle) === 'c' ? 'ghost-ctl' : 'ghost-video' };
}
