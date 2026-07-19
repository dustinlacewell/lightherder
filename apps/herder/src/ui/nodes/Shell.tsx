/* The device chassis every node kind shares: header (icon, editable
   name, action buttons, drawer caret, remove), the port stack, the
   knob drawer, and the blitted face well. */

import { useCallback, useEffect, useState } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals } from '@xyflow/react';
import { DRAWER, PARAMS, type NodeData, type NodeKind } from '../../patch';
import { dispatch, releaseNode, setFace, spark, tap } from '../../runtime';
import { Knob } from '../controls/Knob';
import { KindIcon } from './icons';

/* every op the shell emits addresses its node by the compiled view id
   the component holds; the bench applier resolves the scope from it */
const at = (): { kind: 'doc'; path: string[] } => ({ kind: 'doc', path: [] });

export function useSetParam(id: string): (k: string, v: number) => void {
  return useCallback((k: string, v: number) => {
    dispatch({ kind: 'setParam', scope: at(), node: id, key: k, v });
  }, [id]);
}

/* the header reset: knobs back to their defaults, minus the ones the
   kind considers routing/geometry rather than electronics — one
   setParam per reset key */
export function ResetBtn({ id, kind, keep, title }: { id: string; kind: NodeKind; keep?: Set<string>; title: string }) {
  const reset = (): void => {
    for (const [k, p] of Object.entries(PARAMS[kind]))
      if (!keep?.has(k)) dispatch({ kind: 'setParam', scope: at(), node: id, key: k, v: p.def });
  };
  return <button className="dev-btn nodrag" title={title} onClick={reset}>↺</button>;
}

/* every device's name is editable in place (double-click) — for
   IN/OUT devices the name IS the port label on the module's face */
function DevName({ id, name }: { id: string; name: string }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span className="dev-name" title="double-click to rename" onDoubleClick={() => setEditing(true)}>
        {name}
      </span>
    );
  }
  return (
    <input
      className="dev-name dev-rename nodrag"
      autoFocus
      defaultValue={name}
      onFocus={e => e.currentTarget.select()}
      onBlur={e => {
        const v = e.currentTarget.value.trim();
        if (v) dispatch({ kind: 'rename', scope: at(), node: id, name: v });
        setEditing(false);
      }}
      onKeyDown={e => {
        e.stopPropagation();   // Delete/Backspace must edit text, not the node
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') setEditing(false);
      }}
      onPointerDown={e => e.stopPropagation()}
    />
  );
}

/* the port stack: ONE system for a device's left edge. A kind's fixed
   input ports (video ins, mixer A/B) take the first rows; any drawer
   param exposed as a control port (shift-right-click its knob) stacks
   below, in drawer order. The rail column carries every row's label
   (amber video, teal control) whenever any param is exposed — the
   header ⊣ hides it, and fixed ports then fall back to their floating
   labels. The node widens by the rail so the face keeps its size, and
   grows as tall as the rows need. Outputs stay on the right edge.

   The floating labels share vertical space with exactly one thing: the
   FACE — dark glass an 8px label reads on. That is a layout contract,
   not a coincidence: Shell renders the `face` slot first in the body,
   so a device's controls (its children) always flow BELOW the glass,
   physically out of the label band. A kind with labeled fixed ports
   must hand its face to the slot, never render one among its children
   — the dev-mode warning below is the tripwire. */
const PORT_ROW = 20;
const PORT_TOP = 44;

export interface FixedPort { kind: 'v' | 'c'; id: string; label: string; desc: string }

export function Shell({ id, data, kind, fixed = [], face, headBtns, className, children }: {
  id: string; data: NodeData; kind: NodeKind; fixed?: FixedPort[];
  /** the blitted glass, rendered first in the body — the only element
      the port stack's floating labels may overlap */
  face?: React.ReactNode;
  headBtns?: React.ReactNode; className?: string; children?: React.ReactNode;
}) {
  if (import.meta.env.DEV && fixed.some(p => p.label) && !face)
    console.warn(`herder: ${kind} has labeled fixed ports but no face slot — the labels will float over its controls`);
  const upd = useUpdateNodeInternals();
  const rf = useReactFlow();
  const hasDrawer = DRAWER[kind].length > 0;
  const setParam = useSetParam(id);

  const exposed = DRAWER[kind].filter(k => data.ports?.includes(k));
  const labelsOn = data.labels !== false;
  const railed = exposed.length > 0 && labelsOn;
  const rows = fixed.length + exposed.length;
  const sig = exposed.join();
  useEffect(() => { upd(id); }, [id, sig, upd]);

  const togglePort = (k: string): void => {
    dispatch({ kind: 'togglePort', scope: at(), node: id, param: k, on: !data.ports?.includes(k) });
  };

  /* floating mini-labels only when there IS no rail and labels aren't
     explicitly hidden — ⊣ means bare handles, full stop */
  const Fixed = ({ p, i }: { p: FixedPort; i: number }) => {
    const Port = p.kind === 'v' ? VPort : CPort;
    return <Port dir="in" id={p.id} top={PORT_TOP + i * PORT_ROW} label={railed || !labelsOn ? undefined : p.label} desc={p.desc} />;
  };

  return (
    <div
      className={`dev dev-${kind}${railed ? ' railed' : ''}${className ? ' ' + className : ''}`}
      style={rows ? { minHeight: PORT_TOP + rows * PORT_ROW } : undefined}
    >
      <header className="dev-head">
        <KindIcon kind={kind} />
        <DevName id={id} name={data.name} />
        {headBtns}
        {exposed.length > 0 && (
          <button
            className="dev-btn nodrag"
            title={labelsOn ? 'hide the port labels (the ports stay)' : 'show the port labels'}
            onClick={() => dispatch({ kind: 'setProp', scope: at(), node: id, key: 'labels', v: !labelsOn })}
          >{labelsOn ? '⊣' : '⊢'}</button>
        )}
        {hasDrawer && (
          <button
            className="dev-btn nodrag" title="Knobs"
            onClick={() => dispatch({ kind: 'setProp', scope: at(), node: id, key: 'open', v: !data.open })}
          >{data.open ? '▾' : '▸'}</button>
        )}
        <button
          className="dev-btn nodrag" title="Remove this device (and its wires)"
          onClick={() => { releaseNode(id); rf.deleteElements({ nodes: [{ id }] }); }}
        >×</button>
      </header>
      <div className="dev-cols">
        {railed && (
          <aside className="rail">
            {fixed.map(p => <span key={p.id} className={`rl-${p.kind}`} title={p.desc}>{p.label}</span>)}
            {exposed.map(k => <span key={k} className="rl-c" title={PARAMS[kind][k].desc}>{PARAMS[kind][k].label}</span>)}
          </aside>
        )}
        <div className="dev-main">{face}{children}</div>
      </div>
      {fixed.map((p, i) => <Fixed key={p.id} p={p} i={i} />)}
      {exposed.map((k, i) => (
        <CPort
          key={k} dir="in" id={`c:${k}`} top={PORT_TOP + (fixed.length + i) * PORT_ROW}
          desc={`${PARAMS[kind][k].label} control — a dial (or a module IN) rides the knob ± half its range; several wires fan in, last moved wins`}
        />
      ))}
      {hasDrawer && data.open && (
        <div className="drawer nodrag">
          {DRAWER[kind].map(k => (
            <Knob
              key={k} def={PARAMS[kind][k]} value={data.v[k]} onChange={v => setParam(k, v)} midiTarget={`${id}:${k}`}
              port={{ on: exposed.includes(k), toggle: () => togglePort(k) }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* a face well the engine blits onto; monitors and mixers take a tapped
   spark — new light for a watching camera to pick up */
export function Face({ id, sparkable }: { id: string; sparkable: boolean }) {
  const ref = useCallback((el: HTMLDivElement | null) => setFace(id, el), [id]);
  return (
    <div
      ref={ref}
      className={`face nodrag${sparkable ? ' sparkable' : ''}`}
      title={sparkable ? 'click to spark light onto this screen · Shift-click for a TAP (a single-frame impulse)' : undefined}
      onPointerDown={sparkable ? e => {
        const r = e.currentTarget.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = 1 - (e.clientY - r.top) / r.height;
        if (e.shiftKey) tap(id, x, y);
        else spark(id, x, y);
      } : undefined}
    />
  );
}

export function VPort({ dir, id, top, label, desc }: { dir: 'in' | 'out'; id: string; top: number; label?: string; desc: string }) {
  return (
    <Handle
      type={dir === 'in' ? 'target' : 'source'}
      position={dir === 'in' ? Position.Left : Position.Right}
      id={id} className="port-v" style={{ top }} title={desc}
    >
      {label && <span className={`plbl plbl-${dir}`}>{label}</span>}
    </Handle>
  );
}

export function CPort({ dir, id, top, label, desc }: { dir: 'in' | 'out'; id: string; top: number; label?: string; desc: string }) {
  return (
    <Handle
      type={dir === 'in' ? 'target' : 'source'}
      position={dir === 'in' ? Position.Left : Position.Right}
      id={id} className="port-c" style={{ top }} title={desc}
    >
      {label && <span className={`plbl plbl-${dir}`}>{label}</span>}
    </Handle>
  );
}
