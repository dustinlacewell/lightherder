/* The device toolbar — drag a tool onto the bench, or click to drop
   it mid-view. */

import type { MakeOpts, NodeKind } from '../../patch';
import { announcePresence } from '../../session';
import { DND_MIME, hideDragImage } from '../bench/dnd';
import { KindIcon } from '../nodes';

const TOOLS: { kind: NodeKind; momentary: boolean; label: string; hint: string }[] = [
  { kind: 'camera', momentary: false, label: 'CAM', hint: 'Camera — closes a loop; rotation & zoom by knob or dial' },
  { kind: 'monitor', momentary: false, label: 'MON', hint: 'Monitor — shows its input; point a camera at it' },
  { kind: 'mixer', momentary: false, label: 'MIX', hint: 'Mixer — two inputs, acts like a monitor: 50/50 glass or luma key' },
  { kind: 'switch', momentary: false, label: 'SW', hint: 'Switch — routes one of four inputs; a cut is instant' },
  { kind: 'switch', momentary: true, label: 'MOM', hint: 'Momentary switch — routes while held, springs back home' },
  { kind: 'dial', momentary: false, label: 'DIAL', hint: 'Dial — a control signal for a camera’s rotation or zoom' },
  { kind: 'xypad', momentary: false, label: 'XY', hint: 'XY Pad — two control signals off one puck, X and Y wire independently' },
  { kind: 'media', momentary: false, label: 'MEDIA', hint: 'Media — drop an image or video in; the way a picture gets into a loop' },
  { kind: 'draw', momentary: false, label: 'DRAW', hint: 'Draw — paint a source by hand; pen hue and size on its sliders' },
  { kind: 'in', momentary: false, label: 'IN', hint: 'In — declares a module input port for this patch; its name is the port label' },
  { kind: 'out', momentary: false, label: 'OUT', hint: 'Out — declares a module output port for this patch; its name is the port label' },
];

export function Toolbar({ onSpawn }: { onSpawn: (kind: NodeKind, opts: MakeOpts, sx: number, sy: number) => void }) {
  return (
    <nav className="toolbar" aria-label="Devices">
      {TOOLS.map(t => (
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
    </nav>
  );
}
