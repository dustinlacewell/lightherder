/* The editor's own dress on the document types: React Flow decorates
   nodes with view state (selection, measurements), and a wire's color
   is a CSS class the document model doesn't know about — both live
   only in editor state, never in the document. */

import type { Node, NodeProps } from '@xyflow/react';
import { handleKind, type NodeData, type NodeKind, type PatchEdge } from '../../patch';

export type BenchNode = Node<NodeData, NodeKind>;
export type BenchEdge = PatchEdge & { className: string };

/** what a device component receives from React Flow */
export type DeviceProps = NodeProps<BenchNode>;

export const wire = (e: PatchEdge): BenchEdge =>
  ({ ...e, className: handleKind(e.sourceHandle) === 'c' ? 'wire-ctl' : 'wire-video' });
export const wires = (es: PatchEdge[]): BenchEdge[] => es.map(wire);
