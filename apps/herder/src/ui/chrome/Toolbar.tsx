/* The device toolbar — drag a tool onto the bench, or click to drop
   it mid-view. Vertical tabs down the rail switch between the device
   categories; only the active category's tools show. Hovering a tool
   opens a card beside the panel — name, story, and for an effect a
   live preview running it over the stained glass (fxPreview.ts). */

import { useEffect, useRef, useState } from 'react';
import { HoverCard } from '@ldlework/phosphor';
import type { MakeOpts, NodeKind } from '../../patch';
import { announcePresence } from '../../session';
import { DND_MIME, hideDragImage } from '../bench/dnd';
import { KindIcon } from '../nodes';
import { FX } from '../../fx';
import { mountFxPreview } from './fxPreview';

const CATS = ['Compose', 'Effects', 'Route', 'Control', 'Sources', 'IO'] as const;
type Cat = (typeof CATS)[number];

const FX_TOOLS = Object.entries(FX).map(([kind, d]) => ({
  cat: 'Effects' as Cat, kind: kind as NodeKind, momentary: false, label: d.label, hint: d.hint,
}));

const TOOLS: { cat: Cat; kind: NodeKind; momentary: boolean; label: string; hint: string }[] = [
  { cat: 'Compose', kind: 'camera', momentary: false, label: 'Camera', hint: 'Camera — closes a loop; rotation & zoom by knob or dial' },
  { cat: 'Compose', kind: 'monitor', momentary: false, label: 'Monitor', hint: 'Monitor — shows its input; point a camera at it' },
  { cat: 'Compose', kind: 'mixer', momentary: false, label: 'Mixer', hint: 'Mixer — two inputs, acts like a monitor: 50/50 glass or luma key' },
  { cat: 'Compose', kind: 'delay', momentary: false, label: 'Delay', hint: 'Delay — a frame store: records its input and plays back the one N frames ago; echo and motion-difference against any source' },
  ...FX_TOOLS,
  { cat: 'Route', kind: 'switch', momentary: false, label: 'Switch', hint: 'Switch — routes one of four inputs; a cut is instant. Its VID/CTL button flips it between video and dial signals' },
  { cat: 'Route', kind: 'switch', momentary: true, label: 'Moment', hint: 'Momentary switch — routes while held, springs back home. Its VID/CTL button flips it between video and dial signals' },
  { cat: 'Control', kind: 'dial', momentary: false, label: 'Dial', hint: 'Dial — a control signal for a camera’s rotation or zoom' },
  { cat: 'Control', kind: 'xypad', momentary: false, label: 'XY', hint: 'XY Pad — two control signals off one puck, X and Y wire independently' },
  { cat: 'Sources', kind: 'media', momentary: false, label: 'Media', hint: 'Media — drop an image or video in, or paste a video URL; the way a picture gets into a loop' },
  { cat: 'Sources', kind: 'webcam', momentary: false, label: 'Webcam', hint: 'Webcam — click its face to start your camera as a live source' },
  { cat: 'Sources', kind: 'draw', momentary: false, label: 'Canvas', hint: 'Draw — paint a source by hand; pen hue and size on its sliders' },
  { cat: 'IO', kind: 'in', momentary: false, label: 'In', hint: 'In — declares a module input port for this patch; its name is the port label' },
  { cat: 'IO', kind: 'out', momentary: false, label: 'Out', hint: 'Out — declares a module output port for this patch; its name is the port label' },
];

/* the hover card's body: name, the tool's story, and — for an effect —
   the live preview canvas adopted into the well while the card is up */
function ToolCard({ label, hint, kind }: { label: string; hint: string; kind: NodeKind }) {
  const wellRef = useRef<HTMLDivElement | null>(null);
  const fx = kind in FX;
  useEffect(() => {
    const well = wellRef.current;
    if (!fx || !well) return;
    return mountFxPreview(well, kind as keyof typeof FX);
  }, [fx, kind]);
  return (
    <>
      {fx ? <div ref={wellRef} /> : null}
      <strong>{label}</strong>
      <span>{hint.replace(/^[^—]*—\s*/, '')}</span>
      <span className="tool-card-coda">drag onto the bench, or click to drop it mid-view</span>
    </>
  );
}

export function Toolbar({ onSpawn }: { onSpawn: (kind: NodeKind, opts: MakeOpts, sx: number, sy: number) => void }) {
  const [cat, setCat] = useState<Cat>('Compose');
  const [dragging, setDragging] = useState(false);
  return (
    <nav className="toolbar" aria-label="Devices">
      <div className="tool-tabs" role="tablist" aria-label="Device categories">
        {CATS.map(c => (
          <button
            key={c}
            role="tab"
            aria-selected={c === cat}
            className={'tool-tab' + (c === cat ? ' on' : '')}
            onClick={() => setCat(c)}
          >{c}</button>
        ))}
      </div>
      <div className="tool-list" role="tabpanel">
        {TOOLS.filter(t => t.cat === cat).map(t => (
          <HoverCard
            key={t.label}
            placement="side"
            anchorSelector=".toolbar"
            disabled={dragging}
            /* an effect card runs tall — the preview canvas above the words */
            estimatedHeight={t.kind in FX ? 232 : undefined}
            content={<ToolCard label={t.label} hint={t.hint} kind={t.kind} />}
          >
            <button
              className="tool"
              draggable
              /* the drag carries no native snapshot — the presence spawn ghost
                 renders the real chassis at the drop anchor instead, for the
                 local dragger and the peers alike; dragend fires on drop OR
                 cancel, so the ghost always clears */
              onDragStart={e => {
                e.dataTransfer.setData(DND_MIME, `${t.kind}|${t.momentary ? 1 : 0}`);
                hideDragImage(e);
                setDragging(true);
                announcePresence({ spawn: { kind: t.kind, label: t.label, mom: t.momentary || undefined } });
              }}
              onDragEnd={() => {
                setDragging(false);
                announcePresence({ spawn: undefined });
              }}
              onClick={() => onSpawn(t.kind, { momentary: t.momentary }, window.innerWidth / 2, window.innerHeight / 2)}
            ><KindIcon kind={t.kind} />{t.label}</button>
          </HoverCard>
        ))}
      </div>
    </nav>
  );
}
