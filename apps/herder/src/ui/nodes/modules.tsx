/* The module system's devices: IN/OUT port declarations, and the
   MODULE box that wears a patch as a device. */

import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';
import { useUpdateNodeInternals } from '@xyflow/react';
import { moduleInterface } from '../../patch';
import { libStore } from '../../persist';
import { dispatch } from '../../runtime';
import type { DeviceProps } from '../bench/types';
import { CPort, Shell, VPort } from './Shell';

/* the bench hands the module nodes its drill-in navigation — a module
   opens by asking the bench to descend into it */
export const ModuleNav = createContext<((viewId: string, name: string) => void) | null>(null);

/* IN/OUT come in two flavors; flipping one drops the device's wires
   (they'd be the wrong signal kind). Outer wires into the module port
   it defines are pruned when that level is next projected. */
function FlavorBtn({ id, flavor }: { id: string; flavor: 'v' | 'c' }) {
  return (
    <button
      className={`dev-btn nodrag flav-${flavor}`}
      title={flavor === 'v'
        ? 'a VIDEO port — click to make it a CONTROL port (drops this device’s wires)'
        : 'a CONTROL port — click to make it a VIDEO port (drops this device’s wires)'}
      onClick={() => dispatch({ kind: 'setFlavor', scope: { kind: 'doc', path: [] }, node: id, flavor: flavor === 'v' ? 'c' : 'v' })}
    >{flavor === 'v' ? 'VID' : 'CTL'}</button>
  );
}

/* flipping flavor swaps the handle id (v:out ↔ c:out) — React Flow
   caches handle registrations per node, so it must be told to
   re-measure or drags from the port carry the stale id and fail
   kind-validation */
function useFlavorHandles(id: string, flavor: 'v' | 'c'): void {
  const upd = useUpdateNodeInternals();
  useEffect(() => { upd(id); }, [id, flavor, upd]);
}

export function InNode({ id, data }: DeviceProps) {
  const flavor = data.flavor ?? 'v';
  const Port = flavor === 'v' ? VPort : CPort;
  useFlavorHandles(id, flavor);
  return (
    <Shell id={id} data={data} kind="in" headBtns={<FlavorBtn id={id} flavor={flavor} />}>
      <div className="iobody">module input</div>
      <Port dir="out" id={`${flavor}:out`} top={46}
        desc="what arrives at this port from outside — wire it into the patch" />
    </Shell>
  );
}

export function OutNode({ id, data }: DeviceProps) {
  const flavor = data.flavor ?? 'v';
  const Port = flavor === 'v' ? VPort : CPort;
  useFlavorHandles(id, flavor);
  return (
    <Shell id={id} data={data} kind="out" headBtns={<FlavorBtn id={id} flavor={flavor} />}>
      <div className="iobody">module output</div>
      <Port dir="in" id={`${flavor}:in`} top={46}
        desc="what this patch emits at this port — wire a signal here" />
    </Shell>
  );
}

/* a patch boxed as a device: name + the ports its IN/OUT devices
   declare. No face — compile dissolves it; there is nothing that is
   "its" picture. Double-click (or ⤢) drills in. */
const MOD_HEAD = 30;
const MOD_ROW = 22;

export function ModuleNode({ id, data }: DeviceProps) {
  const nav = useContext(ModuleNav);
  const upd = useUpdateNodeInternals();
  /* re-derive the ports when the referenced entry is edited elsewhere —
     the store bumps its version, this re-renders, and the sig-keyed
     effect below re-measures the handles */
  useSyncExternalStore(libStore.subscribe, libStore.version);
  const resolved = data.ref !== undefined ? libStore.resolve(data.ref) : null;
  const dead = resolved === null;   // no entry (missing, or a not-yet-set ref)
  const ports = moduleInterface(resolved ?? undefined);
  const ins = ports.filter(p => p.dir === 'in');
  const outs = ports.filter(p => p.dir === 'out');
  const rows = Math.max(ins.length, outs.length, 1);

  /* dynamic handles: React Flow must re-measure when the interface
     changes (an IN/OUT added, removed or renamed inside) */
  const sig = ports.map(p => p.dir + p.handle).join();
  useEffect(() => { upd(id); }, [id, sig, upd]);

  const open = () => { if (!dead) nav?.(id, data.name); };
  return (
    <Shell
      id={id} data={data} kind="module" className={dead ? 'mod-dead' : undefined}
      headBtns={dead
        ? undefined
        : <button className="dev-btn nodrag" title="Open this module — edit the patch inside (double-click the body works too)" onClick={open}>⤢</button>}
    >
      <div className="modbody nodrag" style={{ minHeight: rows * MOD_ROW + 12 }} onDoubleClick={open}>
        {dead ? (
          <span className="modempty mod-dead-badge" title="this module's library entry is gone — the instance renders nothing until it returns">missing entry</span>
        ) : (
          <>
            <div className="modcol modcol-in">
              {ins.map(p => <span key={p.handle} className={`modport modport-${p.kind}`}>{p.name}</span>)}
            </div>
            <div className="modcol modcol-out">
              {outs.map(p => <span key={p.handle} className={`modport modport-${p.kind}`}>{p.name}</span>)}
            </div>
            {!ports.length && <span className="modempty">no ports — add IN / OUT devices inside</span>}
          </>
        )}
      </div>
      {ins.map((p, i) => (p.kind === 'v'
        ? <VPort key={p.handle} dir="in" id={p.handle} top={MOD_HEAD + 17 + i * MOD_ROW} desc={`input — ${p.name}`} />
        : <CPort key={p.handle} dir="in" id={p.handle} top={MOD_HEAD + 17 + i * MOD_ROW} desc={`control input — ${p.name}`} />))}
      {outs.map((p, i) => (p.kind === 'v'
        ? <VPort key={p.handle} dir="out" id={p.handle} top={MOD_HEAD + 17 + i * MOD_ROW} desc={`output — ${p.name}`} />
        : <CPort key={p.handle} dir="out" id={p.handle} top={MOD_HEAD + 17 + i * MOD_ROW} desc={`control output — ${p.name}`} />))}
    </Shell>
  );
}
