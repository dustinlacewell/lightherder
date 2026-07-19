/* The canonical configurations — Blair's machines as patches. */

import { setDial, type Slot } from '@ldlework/dials';
import { makeEdge, makeNode, type NodeKind, type PatchEdge, type PatchNode, type SubPatch } from './graph';

/* the consumer-camcorder character Blair's rig depends on (sharpening,
   AGC, a soft knee, a slightly dishonest sensor) — the PRESETS opt
   their cameras into it; a bench-built camera boots identity */
export const CAMCORDER: Record<string, number> =
  { sharpen: 0.5, agc: 0.8, fringe: 0.0005, bleed: 0.012, knee: 1 };

function patchBuilder() {
  const nodes: PatchNode[] = [];
  const add = (kind: NodeKind, name: string, x: number, y: number, v: Record<string, number> = {}, sel = 0): PatchNode => {
    const n = makeNode(kind, x, y, nodes);
    n.data.name = name;
    n.data.sel = sel;
    for (const [k, val] of Object.entries(v)) setDial(n.data.slots[k] as Slot<number>, val);
    nodes.push(n);
    return n;
  };
  return { nodes, add };
}

/* THE PIECE — the full Light Herder (ARCHITECTURE §4, the Phase III
   machine): two tower rails, each a beamsplitter unit — upper monitor
   through the glass on its camera's own loop, lower monitor reflected
   in the glass carrying a switcher — plus the front rotating loop and
   the media loop folded in. The switcher chain is the 2/2/21 table:
     SW1: camL / camR            → lower L
     SW2: camR / SW3             → lower R
     SW3: camL / SW4             → SW2
     SW4: media / camF / mediaCam→ front-sel + SW3
   Everything boots in the "everything at once" configuration: the
   lowers crossed, SW2 chained down to the front loop, the front
   monitor on its own loop, the media waiting at SW4 position 1.
   One HANDLE pair of dials drives BOTH tower cameras (the belt);
   each camera's own Rotate knob is its belt-slip offset. */
export function piecePatch(): SubPatch {
  const { nodes, add } = patchBuilder();

  /* left rail */
  const monUL = add('monitor', 'UPPER L', -40, -160);
  const monLL = add('monitor', 'LOWER L', -40, 420);
  const glassL = add('mixer', 'GLASS L', 250, 130);
  const camL = add('camera', 'CAM L', 540, 130, { ...CAMCORDER });
  const sw1 = add('switch', 'SW 1', -260, 420, {}, 1);

  /* right rail */
  const monUR = add('monitor', 'UPPER R', 1560, -160);
  const monLR = add('monitor', 'LOWER R', 1560, 420);
  const glassR = add('mixer', 'GLASS R', 1270, 130);
  const camR = add('camera', 'CAM R', 980, 130, { ...CAMCORDER });
  const sw2 = add('switch', 'SW 2', 1360, 660, {}, 1);

  /* the switcher chain down to the front loop */
  const sw3 = add('switch', 'SW 3', 250, 700, {}, 1);
  const sw4 = add('switch', 'SW 4', -340, 940, {}, 1);
  const media = add('media', 'MEDIA', -620, 940);

  /* the front rotating loop, media-loop evolution included: the Canon's
     feedback is the key BASE; SW4's pick (media-cam loop, or the media
     itself) is luma-keyed OVER it — "keying does electronically what
     the beam-splitter glass does on the Primary Loop" */
  const rolF = add('mixer', 'ROLAND F', -40, 940, { mode: 1 });
  const monF1 = add('monitor', 'ROT MON 1', 250, 940);
  const camF = add('camera', 'CANON', 540, 940, { ...CAMCORDER });
  const monF2 = add('monitor', 'ROT MON 2', 830, 940, { delay: 3 });
  const camP = add('camera', 'MEDIA CAM', 1120, 940, { ...CAMCORDER });

  /* the handle (belt-linked: one pair of dials, both tower cameras)
     and the two rotating-monitor spins */
  const dRot = add('dial', 'HANDLE ROT', 540, -160);
  const dZoom = add('dial', 'HANDLE ZOOM', 830, -160);
  const dF = add('dial', 'SPIN 1', 540, 1240);
  const dP = add('dial', 'SPIN 2', 1120, 1240);

  const edges: PatchEdge[] = [
    /* left tower: cam sees both monitors through the glass */
    makeEdge(monUL.id, 'v:out', glassL.id, 'v:a'),
    makeEdge(monLL.id, 'v:out', glassL.id, 'v:b'),
    makeEdge(glassL.id, 'v:out', camL.id, 'v:in'),
    makeEdge(camL.id, 'v:out', monUL.id, 'v:in'),      // upper = the self loop
    makeEdge(sw1.id, 'v:out', monLL.id, 'v:in'),       // lower = the switcher
    makeEdge(camL.id, 'v:out', sw1.id, 'v:in1'),
    makeEdge(camR.id, 'v:out', sw1.id, 'v:in2'),       // home: the other tower

    /* right tower, mirrored */
    makeEdge(monUR.id, 'v:out', glassR.id, 'v:a'),
    makeEdge(monLR.id, 'v:out', glassR.id, 'v:b'),
    makeEdge(glassR.id, 'v:out', camR.id, 'v:in'),
    makeEdge(camR.id, 'v:out', monUR.id, 'v:in'),
    makeEdge(sw2.id, 'v:out', monLR.id, 'v:in'),
    makeEdge(camR.id, 'v:out', sw2.id, 'v:in1'),
    makeEdge(sw3.id, 'v:out', sw2.id, 'v:in2'),        // home: the chain below

    /* the chain: SW3 hands SW4's pick up to the right tower */
    makeEdge(camL.id, 'v:out', sw3.id, 'v:in1'),
    makeEdge(sw4.id, 'v:out', sw3.id, 'v:in2'),
    makeEdge(media.id, 'v:out', sw4.id, 'v:in1'),      // flip here to inject an image
    makeEdge(camP.id, 'v:out', sw4.id, 'v:in2'),       // home: the media-cam loop

    /* the front loop: the Canon watches rotating monitor 1, which shows
       SW4's pick luma-keyed over the Canon's own feedback */
    makeEdge(camF.id, 'v:out', rolF.id, 'v:a'),        // S1: the Canon feedback
    makeEdge(sw4.id, 'v:out', rolF.id, 'v:b'),         // S2: the key fill
    makeEdge(rolF.id, 'v:out', monF1.id, 'v:in'),
    makeEdge(monF1.id, 'v:out', camF.id, 'v:in'),

    /* the media loop: Canon relayed through the Blackmagic to rotating
       monitor 2, watched by the media's camera, back into SW4 */
    makeEdge(camF.id, 'v:out', monF2.id, 'v:in'),
    makeEdge(monF2.id, 'v:out', camP.id, 'v:in'),

    /* the handle: one dial pair, both tower rods (the belt) */
    makeEdge(dRot.id, 'c:out', camL.id, 'c:rot'),
    makeEdge(dRot.id, 'c:out', camR.id, 'c:rot'),
    makeEdge(dZoom.id, 'c:out', camL.id, 'c:zoom'),
    makeEdge(dZoom.id, 'c:out', camR.id, 'c:zoom'),
    makeEdge(dF.id, 'c:out', camF.id, 'c:rot'),
    makeEdge(dP.id, 'c:out', camP.id, 'c:rot'),
  ];
  return { nodes, edges };
}

/* THE DUO — the machine as wired on 2/10/21, the dual-rotating-monitor
   experiment: Roland 1 in KEY state feeds rotating monitor 1, which
   the Canon watches; the Canon feeds both the keyer's base (its own
   loop) and, through the Blackmagic (delay 3), rotating monitor 2 —
   which the media's camera watches, closing the second loop into the
   keyer's fill. The media waits behind the switch. */
export function duoPatch(): SubPatch {
  const { nodes, add } = patchBuilder();

  const mix1 = add('mixer', 'ROLAND 1', 40, 120, { mode: 1 });
  const mon1 = add('monitor', 'ROT MON 1', 340, 120);
  const cam1 = add('camera', 'CANON', 640, 120, { ...CAMCORDER });
  const mon2 = add('monitor', 'ROT MON 2', 640, 470, { delay: 3 });
  const cam2 = add('camera', 'MEDIA CAM', 340, 470, { ...CAMCORDER });
  const sw1 = add('switch', 'ROLAND 2', 40, 470);
  const media1 = add('media', 'MEDIA', -240, 500);
  const d1 = add('dial', 'CANON ROT', 940, 60);
  const d2 = add('dial', 'CANON ZOOM', 940, 260);
  const d3 = add('dial', 'MEDIA ROT', 940, 460);
  const d4 = add('dial', 'MEDIA ZOOM', 940, 660);

  const edges: PatchEdge[] = [
    makeEdge(mix1.id, 'v:out', mon1.id, 'v:in'),     // Roland 1 → rotating monitor 1
    makeEdge(mon1.id, 'v:out', cam1.id, 'v:in'),     // the Canon watches it
    makeEdge(cam1.id, 'v:out', mix1.id, 'v:a'),      // its own loop is the key base
    makeEdge(cam1.id, 'v:out', mon2.id, 'v:in'),     // and relays through the Blackmagic
    makeEdge(mon2.id, 'v:out', cam2.id, 'v:in'),     // the media's camera watches monitor 2
    makeEdge(cam2.id, 'v:out', sw1.id, 'v:in1'),     // its loop is the switch's home
    makeEdge(media1.id, 'v:out', sw1.id, 'v:in2'),   // the media waits on position 2
    makeEdge(sw1.id, 'v:out', mix1.id, 'v:b'),       // the switch feeds the keyer's fill
    makeEdge(d1.id, 'c:out', cam1.id, 'c:rot'),
    makeEdge(d2.id, 'c:out', cam1.id, 'c:zoom'),
    makeEdge(d3.id, 'c:out', cam2.id, 'c:rot'),
    makeEdge(d4.id, 'c:out', cam2.id, 'c:zoom'),
  ];
  return { nodes, edges };
}
