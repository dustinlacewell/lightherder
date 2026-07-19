/* The app: the React Flow provider around the bench. Everything else
   composes inside Bench. */

import { ReactFlowProvider } from '@xyflow/react';
import { Bench } from './bench/Bench';

export function App() {
  return (
    <ReactFlowProvider>
      <Bench />
    </ReactFlowProvider>
  );
}
