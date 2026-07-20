/* A knob — drag vertically like a real knob under a careful finger.
   Shift for fine motion, double-click for default, wheel and arrows work.
   A knob can carry a second param (`shift`): then shift-drag works THAT
   instead of fine motion, and shift-double-click resets it.
   `nodrag` keeps React Flow from dragging the node while a knob turns. */

import { useEffect, useRef, useState } from 'react';
import type { ParamDef } from '../../patch';
import * as midi from '../../midi';
import { liveValue, watchLive } from '../../runtime';

const A0 = -135, A1 = 135;

function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const pt = (a: number) => [cx + r * Math.cos((a - 90) * Math.PI / 180), cy + r * Math.sin((a - 90) * Math.PI / 180)];
  const [x0, y0] = pt(a0), [x1, y1] = pt(a1);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${(a1 - a0) > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export interface KnobProps {
  def: ParamDef;
  value: number;
  onChange: (v: number) => void;
  size?: number;
  /** "nodeId:param" or "global:param" — omit to leave this knob un-bindable */
  midiTarget?: string;
  /** a second param riding the same knob: shift-drag works it instead
      of fine motion; shift-double-click resets it */
  shift?: { def: ParamDef; value: number; onChange: (v: number) => void };
  /** this param can be exposed as a control port on its device —
      shift-right-click toggles it (and MIDI mode-flip moves to
      ctrl-right-click) */
  port?: { on: boolean; toggle: () => void };
}

const clampStep = (Q: ParamDef, v: number): number => {
  v = Math.min(Q.max, Math.max(Q.min, v));
  return Q.step ? Math.round(v / Q.step) * Q.step : v;
};

export function Knob({ def: P, value, onChange, size = 44, midiTarget, shift, port }: KnobProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y0: number; v0: number; alt: boolean } | null>(null);
  const [, bump] = useState(0);

  const set = (v: number): void => {
    v = clampStep(P, v);
    if (v !== value) onChange(v);
  };

  /* wheel must be a non-passive native listener to preventDefault
     (React attaches synthetic wheel passively) */
  const live = useRef({ set, value });
  live.current = { set, value };
  useEffect(() => {
    const el = rootRef.current!;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      const { set, value } = live.current;
      set(value - Math.sign(e.deltaY) * (P.step || (P.max - P.min) / 120));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [P]);

  /* an absolute CC drives this knob exactly like a drag: 0..1 across
     the param's own range; a relative encoder's detent moves it one
     wheel notch */
  useEffect(() => {
    if (!midiTarget) return;
    midi.registerTarget(
      midiTarget,
      t => live.current.set(P.min + t * (P.max - P.min)),
      steps => {
        const { set, value } = live.current;
        set(value + steps * (P.step || (P.max - P.min) / 120));
      },
    );
    return () => midi.unregisterTarget(midiTarget);
  }, [midiTarget, P]);

  /* re-render when this target's learn state flips, whoever triggered it */
  useEffect(() => {
    if (!midiTarget) return;
    return midi.watchLearn(midiTarget, () => bump(x => x + 1));
  }, [midiTarget]);

  /* while a wire rides this param's control port the engine publishes
     the effective value under the same "nodeId:param" key; follow it,
     coalesced to one re-render per frame (ticks can outpace paints) */
  useEffect(() => {
    if (!midiTarget) return;
    let raf = 0;
    const off = watchLive(midiTarget, () => {
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; bump(x => x + 1); });
    });
    return () => { off(); if (raf) cancelAnimationFrame(raf); };
  }, [midiTarget]);

  const bound = midiTarget ? midi.isBound(midiTarget) : false;
  const learning = midiTarget ? midi.isLearning(midiTarget) : false;
  const mode = midiTarget ? midi.bindingFor(midiTarget)?.mode : undefined;

  /* the ridden value, when there is one — the knob displays it (arc in
     the control teal) while drags and edits keep working the base.
     Periodic params come back unwrapped (a ridden hue can read 660°) —
     fold those onto the knob's own circle. */
  const ridden = midiTarget ? liveValue(midiTarget) : undefined;
  const range = P.max - P.min;
  const shown = ridden === undefined ? value
    : P.periodic ? ((ridden - P.min) % range + range) % range + P.min
    : ridden;

  const onContextMenu = (midiTarget || port)
    ? (e: React.MouseEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (port && e.shiftKey) { port.toggle(); return; }
      if (!midiTarget) return;
      if (learning) { midi.cancelLearn(); return; }
      if (bound && (port ? e.ctrlKey : e.shiftKey)) { midi.toggleMode(midiTarget); bump(x => x + 1); return; }
      if (bound) { midi.unbind(midiTarget); bump(x => x + 1); return; }
      midi.startLearn(midiTarget, () => bump(x => x + 1));
    }
    : undefined;

  const t = (shown - P.min) / (P.max - P.min);
  const a = A0 + Math.min(1, Math.max(0, t)) * (A1 - A0);
  const rad = (a - 90) * Math.PI / 180;

  return (
    <div
      ref={rootRef}
      className={`knob nodrag${learning ? ' midi-learning' : ''}${bound ? ' midi-bound' : ''}`}
      style={{ width: size }}
      tabIndex={0}
      title={`${P.label} — ${P.desc}`
        + (shift ? `\n\nshift-drag: ${shift.def.label} — ${shift.def.desc}` : '')
        + (port ? `\n\nshift+right-click: ${port.on ? 'remove its control port' : 'expose as a control port on this device'}` : '')
        + (midiTarget ? `\n\nright-click: ${learning ? 'cancel MIDI learn' : bound ? 'unbind MIDI CC' : 'MIDI learn'}${bound ? `\n${port ? 'ctrl' : 'shift'}+right-click: ${mode === 'relative' ? 'relative encoder → absolute' : 'absolute → relative encoder'}` : ''}` : '')}
      role="slider"
      aria-label={P.label}
      aria-valuemin={P.min}
      aria-valuemax={P.max}
      aria-valuenow={shown}
      aria-valuetext={P.fmt(shown)}
      onPointerDown={e => {
        const alt = !!(shift && e.shiftKey);
        drag.current = { y0: e.clientY, v0: alt ? shift!.value : value, alt };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d) return;
        if (d.alt && shift) {
          const S = shift.def;
          const v = clampStep(S, d.v0 + (d.y0 - e.clientY) / 150 * (S.max - S.min));
          if (v !== shift.value) shift.onChange(v);
          return;
        }
        /* shift means fine motion — unless shift is a param here */
        const fine = !shift && e.shiftKey ? 0.15 : 1;
        set(d.v0 + (d.y0 - e.clientY) / 150 * (P.max - P.min) * fine);
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={e => {
        e.stopPropagation();
        if (shift && e.shiftKey) { shift.onChange(clampStep(shift.def, shift.def.def)); return; }
        set(P.def);
      }}
      onContextMenu={onContextMenu}
      onKeyDown={e => {
        const st = P.step || (P.max - P.min) / (e.shiftKey ? 400 : 80);
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') { set(value + st); e.preventDefault(); }
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') { set(value - st); e.preventDefault(); }
        if (e.key === 'Home') { set(P.def); e.preventDefault(); }
      }}
    >
      <svg width={size} height={size} viewBox="0 0 44 44">
        <path d={arcPath(22, 22, 19, A0, A1)} fill="none" stroke="#33281a" strokeWidth={2.5} strokeLinecap="round" />
        {a > A0 + 0.5 && <path d={arcPath(22, 22, 19, A0, a)} fill="none" stroke={ridden !== undefined ? 'var(--teal)' : 'var(--amber)'} strokeWidth={2.5} strokeLinecap="round" />}
        <circle cx={22} cy={22} r={14} fill="#1c150d" stroke="#3a2c1a" />
        <line
          x1={22 + 6 * Math.cos(rad)} y1={22 + 6 * Math.sin(rad)}
          x2={22 + 12 * Math.cos(rad)} y2={22 + 12 * Math.sin(rad)}
          stroke="var(--maple)" strokeWidth={2} strokeLinecap="round"
        />
        {midiTarget && (bound || learning) && (
          <circle cx={34} cy={10} r={3.2} className={learning ? 'midi-dot learning' : 'midi-dot bound'} />
        )}
        {port?.on && <circle cx={10} cy={10} r={3.2} className="port-dot" />}
      </svg>
      <div className="lbl">{P.label}</div>
      <div className="val">{P.fmt(shown)}</div>
    </div>
  );
}

/* An XY pad — one puck, two independent −1…+1 signals. Drag anywhere
   in the field to set both axes at once; double-click recenters both.
   Each axis can carry its own MIDI target (two CCs onto one puck) and
   rides a live value exactly like a knob, so a wired axis shows what
   the engine actually resolved. */
export interface XYPadProps {
  defX: ParamDef; x: number; onX: (v: number) => void; midiX?: string;
  defY: ParamDef; y: number; onY: (v: number) => void; midiY?: string;
  /** the glided/lerped OUTPUT actually riding the wire — drawn as a
      second ghost puck lagging the selection while a slew is dialed in.
      Omit (or leave equal to x/y) for no lag puck. */
  outX?: number; outY?: number;
  size?: number;
}

export function XYPad({ defX, x, onX, midiX, defY, y, onY, midiY, outX, outY, size = 96 }: XYPadProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  /* drag is relative and pointer-LOCKED: the press grabs the mouse
     (the OS cursor freezes and hides) and movementX/Y deltas
     accumulate into a virtual position that clamps at the walls each
     step — the puck pins against an edge with no overshoot debt, and
     the first reverse motion peels it off. If the browser refuses the
     lock, setPointerCapture still routes the moves and movementX/Y
     still carry the deltas, so the drag degrades gracefully. */
  const drag = useRef<{ vx: number; vy: number } | null>(null);
  const [, bump] = useState(0);

  const setX = (v: number): void => { v = clampStep(defX, v); if (v !== x) onX(v); };
  const setY = (v: number): void => { v = clampStep(defY, v); if (v !== y) onY(v); };

  const live = useRef({ setX, setY, x, y });
  live.current = { setX, setY, x, y };

  const fromPointer = (e: { movementX: number; movementY: number }): void => {
    const d = drag.current!;
    const r = rootRef.current!.getBoundingClientRect();
    const { setX, setY } = live.current;
    d.vx = Math.min(defX.max, Math.max(defX.min, d.vx + e.movementX / r.width * (defX.max - defX.min)));
    d.vy = Math.min(defY.max, Math.max(defY.min, d.vy - e.movementY / r.height * (defY.max - defY.min)));
    setX(d.vx);
    setY(d.vy);
  };

  const endDrag = (): void => {
    if (!drag.current) return;
    drag.current = null;
    if (document.pointerLockElement === rootRef.current) document.exitPointerLock();
  };

  /* unmounting mid-drag must not strand a hidden cursor */
  useEffect(() => () => {
    if (drag.current && document.pointerLockElement) document.exitPointerLock();
  }, []);

  useEffect(() => {
    if (!midiX) return;
    midi.registerTarget(
      midiX,
      t => live.current.setX(defX.min + t * (defX.max - defX.min)),
      steps => live.current.setX(live.current.x + steps * (defX.step || (defX.max - defX.min) / 120)),
    );
    return () => midi.unregisterTarget(midiX);
  }, [midiX, defX]);

  useEffect(() => {
    if (!midiY) return;
    midi.registerTarget(
      midiY,
      t => live.current.setY(defY.min + t * (defY.max - defY.min)),
      steps => live.current.setY(live.current.y + steps * (defY.step || (defY.max - defY.min) / 120)),
    );
    return () => midi.unregisterTarget(midiY);
  }, [midiY, defY]);

  useEffect(() => {
    if (!midiX && !midiY) return;
    const offs = [midiX, midiY].filter((t): t is string => !!t).map(t => midi.watchLearn(t, () => bump(n => n + 1)));
    return () => offs.forEach(off => off());
  }, [midiX, midiY]);

  useEffect(() => {
    if (!midiX && !midiY) return;
    let raf = 0;
    const bumpSoon = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; bump(n => n + 1); }); };
    const offs = [midiX, midiY].filter((t): t is string => !!t).map(t => watchLive(t, bumpSoon));
    return () => { offs.forEach(off => off()); if (raf) cancelAnimationFrame(raf); };
  }, [midiX, midiY]);

  const riddenX = midiX ? liveValue(midiX) : undefined;
  const riddenY = midiY ? liveValue(midiY) : undefined;
  const shownX = riddenX ?? x, shownY = riddenY ?? y;
  const tx = (shownX - defX.min) / (defX.max - defX.min);
  const ty = 1 - (shownY - defY.min) / (defY.max - defY.min);
  const ridden = riddenX !== undefined || riddenY !== undefined;

  /* the glided output as a second, lagging puck — only when it visibly
     diverges from the selection (a slew is easing it toward the knob) */
  const ox = outX ?? shownX, oy = outY ?? shownY;
  const lagging = Math.abs(ox - shownX) > 1e-4 || Math.abs(oy - shownY) > 1e-4;
  const gx = (ox - defX.min) / (defX.max - defX.min);
  const gy = 1 - (oy - defY.min) / (defY.max - defY.min);

  return (
    <div
      ref={rootRef}
      className="xypad nodrag"
      style={{ width: size, height: size }}
      title={`${defX.label} / ${defY.label}\n${defX.desc}\n${defY.desc}`}
      role="slider"
      aria-label={`${defX.label} / ${defY.label}`}
      onPointerDown={e => {
        /* the press jumps the puck to the tapped spot; the drag then
           rides raw mouse deltas from there, under pointer lock */
        const r = e.currentTarget.getBoundingClientRect();
        const vx = clampStep(defX, defX.min + (e.clientX - r.left) / r.width * (defX.max - defX.min));
        const vy = clampStep(defY, defY.min + (1 - (e.clientY - r.top) / r.height) * (defY.max - defY.min));
        drag.current = { vx, vy };
        e.currentTarget.setPointerCapture(e.pointerId);
        try { (e.currentTarget.requestPointerLock() as Promise<void> | undefined)?.catch(() => {}); } catch { /* capture-only fallback */ }
        setX(vx);
        setY(vy);
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMove={e => { if (drag.current) fromPointer(e); }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={e => { e.stopPropagation(); setX(defX.def); setY(defY.def); }}
    >
      <div className="xypad-cross" />
      {lagging && (
        <div
          className="xypad-puck out"
          title="the glided output riding the wire — lags the selection while a slew is set"
          style={{ left: `${Math.min(1, Math.max(0, gx)) * 100}%`, top: `${Math.min(1, Math.max(0, gy)) * 100}%` }}
        />
      )}
      <div
        className={`xypad-puck${ridden ? ' ridden' : ''}`}
        style={{ left: `${Math.min(1, Math.max(0, tx)) * 100}%`, top: `${Math.min(1, Math.max(0, ty)) * 100}%` }}
      />
      <div className="xypad-vals">
        <span>{defX.fmt(shownX)}</span>
        <span>{defY.fmt(shownY)}</span>
      </div>
    </div>
  );
}

/* A little arc gauge — a knob's quiet sibling: the same sweep, no
   pointer cap, teal fill. Shows a secondary param and takes the same
   vertical drag (double-click for default). The dial uses one for its
   Lerp, beside the main knob. */
export function ArcGauge({ def: P, value, onChange, size = 26 }: {
  def: ParamDef; value: number; onChange: (v: number) => void; size?: number;
}) {
  const drag = useRef<{ y0: number; v0: number } | null>(null);
  const set = (v: number): void => {
    v = clampStep(P, v);
    if (v !== value) onChange(v);
  };
  const t = (value - P.min) / (P.max - P.min);
  const a = A0 + t * (A1 - A0);
  return (
    <div
      className="arcgauge nodrag"
      style={{ width: size }}
      title={`${P.label} — ${P.desc}`}
      role="slider"
      aria-label={P.label}
      aria-valuemin={P.min}
      aria-valuemax={P.max}
      aria-valuenow={value}
      aria-valuetext={P.fmt(value)}
      onPointerDown={e => {
        drag.current = { y0: e.clientY, v0: value };
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerMove={e => {
        const d = drag.current;
        if (!d) return;
        set(d.v0 + (d.y0 - e.clientY) / 150 * (P.max - P.min));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
      onDoubleClick={e => { e.stopPropagation(); set(P.def); }}
    >
      <svg width={size} height={size} viewBox="0 0 26 26">
        <path d={arcPath(13, 13, 10, A0, A1)} fill="none" stroke="#1a2b28" strokeWidth={2.5} strokeLinecap="round" />
        {a > A0 + 0.5 && <path d={arcPath(13, 13, 10, A0, a)} fill="none" stroke="var(--teal)" strokeWidth={2.5} strokeLinecap="round" />}
      </svg>
      <div className="val">{P.fmt(value)}</div>
    </div>
  );
}
