/* The device toolbar — drag a tool onto the bench, or click to drop
   it mid-view. Vertical tabs down the rail switch between the device
   categories; only the active category's tools show. */

import { useState } from 'react';
import type { MakeOpts, NodeKind } from '../../patch';
import { announcePresence } from '../../session';
import { DND_MIME, hideDragImage } from '../bench/dnd';
import { KindIcon } from '../nodes';
import { FX } from '../../fx';

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

export function Toolbar({ onSpawn }: { onSpawn: (kind: NodeKind, opts: MakeOpts, sx: number, sy: number) => void }) {
  const [cat, setCat] = useState<Cat>('Compose');
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
          <button
            key={t.label}
            className="tool"
            title={`${t.hint} — drag onto the bench, or click to drop it mid-view`}
            draggable
            /* the drag carries no native snapshot — the presence spawn ghost
               renders the real chassis at the drop anchor instead, for the
               local dragger and the peers alike; dragend fires on drop OR
               cancel, so the ghost always clears */
            onDragStart={e => {
              e.dataTransfer.setData(DND_MIME, `${t.kind}|${t.momentary ? 1 : 0}`);
              hideDragImage(e);
              announcePresence({ spawn: { kind: t.kind, label: t.label, mom: t.momentary || undefined } });
            }}
            onDragEnd={() => announcePresence({ spawn: undefined })}
            onClick={() => onSpawn(t.kind, { momentary: t.momentary }, window.innerWidth / 2, window.innerHeight / 2)}
          ><KindIcon kind={t.kind} />{t.label}</button>
        ))}
      </div>
    </nav>
  );
}
