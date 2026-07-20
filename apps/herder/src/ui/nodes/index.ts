/* The devices, as React Flow nodes — the registry the bench hands to
   React Flow, plus the pieces other panes reuse (the kind glyphs, the
   drill-in navigation context). */

import type { NodeTypes } from '@xyflow/react';
import { CameraNode, DialNode, MixerNode, MonitorNode, SwitchNode, XyPadNode, effectNodes } from './devices';
import { InNode, ModuleNode, OutNode } from './modules';
import { DrawNode, MediaNode, WebcamNode } from './sources';

export { KindIcon } from './icons';
export { ModuleNav } from './modules';

export const nodeTypes: NodeTypes = {
  media: MediaNode,
  webcam: WebcamNode,
  draw: DrawNode,
  camera: CameraNode,
  monitor: MonitorNode,
  mixer: MixerNode,
  ...effectNodes,
  switch: SwitchNode,
  dial: DialNode,
  xypad: XyPadNode,
  in: InNode,
  out: OutNode,
  module: ModuleNode,
};
