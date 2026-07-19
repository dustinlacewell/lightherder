/* The devices, as React Flow nodes — the registry the bench hands to
   React Flow, plus the pieces other panes reuse (the kind glyphs, the
   drill-in navigation context). */

import type { NodeTypes } from '@xyflow/react';
import { CameraNode, DialNode, MixerNode, MonitorNode, SwitchNode, XyPadNode } from './devices';
import { InNode, ModuleNode, OutNode } from './modules';
import { DrawNode, MediaNode } from './sources';

export { KindIcon } from './icons';
export { ModuleNav } from './modules';

export const nodeTypes: NodeTypes = {
  media: MediaNode,
  draw: DrawNode,
  camera: CameraNode,
  monitor: MonitorNode,
  mixer: MixerNode,
  switch: SwitchNode,
  dial: DialNode,
  xypad: XyPadNode,
  in: InNode,
  out: OutNode,
  module: ModuleNode,
};
